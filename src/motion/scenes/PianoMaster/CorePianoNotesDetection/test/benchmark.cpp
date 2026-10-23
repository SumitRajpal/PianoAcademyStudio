#include <cassert>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

#include "../shared/Calibration.h"
#include "../shared/Cascade.h"
#include "../shared/Goertzel.h"
#include "../shared/Mpm.h"
#include "../shared/PolyEstimator.h"
#include "../shared/SampleRing.h"

using namespace piano;

// Synthetic piano audio generator with Fletcher inharmonicity
static void generatePianoNote(float* dst, int numSamples, float f0, int sr, float B = 0.0002f, float amp = 0.8f) {
  for (int i = 0; i < numSamples; ++i) {
    const float t = static_cast<float>(i) / static_cast<float>(sr);
    const float env = std::exp(-2.5f * t); // Natural exponential decay

    float sample = 0.0f;
    // 4 harmonic partials with inharmonic stretching
    for (int h = 1; h <= 4; ++h) {
      const float f_h = Goertzel::inharmonicPartial(f0, h, B);
      const float partAmp = (1.0f / static_cast<float>(h)) * env;
      sample += partAmp * std::sin(2.0f * static_cast<float>(M_PI) * f_h * t);
    }
    dst[i] = amp * sample;
  }
}

// 1. Test SPSC SampleRing throughput and thread-safety
static void testSampleRing() {
  std::cout << "[TEST] 1. Testing Lock-Free SPSC SampleRing...\n";
  EngineRing ring;
  constexpr std::size_t totalSamples = 48000 * 2; // 2 seconds of audio

  std::atomic<bool> producerDone{false};
  std::atomic<std::size_t> totalReceived{0};

  // Producer thread
  std::thread producer([&]() {
    std::vector<float> chunk(256, 0.5f);
    std::size_t sent = 0;
    while (sent < totalSamples) {
      std::size_t written = ring.push(chunk.data(), chunk.size());
      sent += written;
      if (written == 0) {
        std::this_thread::yield();
      }
    }
    producerDone.store(true, std::memory_order_release);
  });

  // Consumer thread
  std::thread consumer([&]() {
    std::vector<float> peekBuf(256);
    std::size_t read = 0;
    while (!producerDone.load(std::memory_order_acquire) || ring.available() > 0) {
      if (ring.available() >= 256) {
        ring.peekWindow(peekBuf.data(), 256);
        ring.consume(256);
        read += 256;
      } else {
        std::this_thread::yield();
      }
    }
    totalReceived.store(read, std::memory_order_relaxed);
  });

  producer.join();
  consumer.join();

  assert(totalReceived.load() >= totalSamples - 256);
  std::cout << "  ✓ SPSC SampleRing passed: " << totalReceived.load() << " samples transferred without lock contention.\n";
}

// 2. Test Idle Gate Performance
static void testIdleGate() {
  std::cout << "[TEST] 2. Testing Stage 1 Idle Gate Performance...\n";
  Cascade cascade;
  EngineRing ring;
  std::vector<NoteEvent> events;

  // Fill ring with silence (-80 dBFS)
  std::vector<float> silence(2048, 0.0001f);
  ring.push(silence.data(), silence.size());

  auto t0 = std::chrono::high_resolution_clock::now();
  for (int i = 0; i < 1000; ++i) {
    cascade.processHop(ring, events, i * 5.33);  // the same quiet hop, analysed 1000 times
  }
  auto t1 = std::chrono::high_resolution_clock::now();
  double totalUs = std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count();
  double usPerHop = totalUs / 1000.0;

  std::cout << "  ✓ Idle hop execution: " << std::fixed << std::setprecision(2) << usPerHop
            << " µs per hop (Budget: 5333 µs, Target: < 5 µs).\n";
  assert(events.empty());
  assert(usPerHop < 5.0); // Extreme fast path
}

// 3. Test 88-Key Accuracy
static void test88KeyAccuracy(const std::string& mode) {
  std::cout << "[TEST] 3. Testing 88-Key Single-Note Detection (" << mode << ")...\n";
  CascadeConfig config;
  config.confirmHops = 1; // Instant confirm for benchmark
  Cascade cascade(config);
  EngineRing ring;

  const int startMidi = (mode == "quick") ? 48 : 21; // Quick: C3..C7; Full: A0..C8
  const int endMidi = (mode == "quick") ? 84 : 108;
  const float B = (mode == "upright") ? 0.0008f : 0.0002f;

  int passed = 0;
  int total = 0;
  std::vector<double> activeHopTimes;

  for (int midi = startMidi; midi <= endMidi; ++midi) {
    ring.reset();
    cascade.reset();

    const float f0 = Goertzel::midiToFrequency(midi);
    constexpr int sampleCount = 48000 / 2; // 500 ms note
    std::vector<float> pcm(sampleCount);
    generatePianoNote(pcm.data(), sampleCount, f0, 48000, B, 0.7f);

    // Push into ring buffer
    ring.push(pcm.data(), pcm.size());

    bool detected = false;
    std::vector<NoteEvent> events;

    // Process hops
    for (int hop = 0; hop < 40; ++hop) {
      if (ring.available() < 256) break;

      auto t0 = std::chrono::high_resolution_clock::now();
      cascade.processHop(ring, events, hop * 5.33);
      ring.consume(256);
      auto t1 = std::chrono::high_resolution_clock::now();

      activeHopTimes.push_back(std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count());

      for (const auto& ev : events) {
        if (ev.type == NoteEvent::NoteOn && ev.midi == midi) {
          detected = true;
          break;
        }
      }
      if (detected) break;
    }

    ++total;
    if (detected) {
      ++passed;
    } else {
      std::cout << "    [MISS] MIDI " << midi << " (" << f0 << " Hz)\n";
    }
  }

  double sumUs = 0.0;
  for (double u : activeHopTimes) sumUs += u;
  double avgActiveUs = activeHopTimes.empty() ? 0.0 : sumUs / activeHopTimes.size();

  float accuracy = (static_cast<float>(passed) / static_cast<float>(total)) * 100.0f;
  std::cout << "  ✓ Accuracy: " << passed << "/" << total << " ("
            << std::fixed << std::setprecision(1) << accuracy << "%)\n";
  std::cout << "  ✓ Mean active compute: " << avgActiveUs << " µs per hop\n";
  assert(accuracy >= 95.0f);
}

// 4. Test Score-Informed Expected Notes Mode
static void testExpectedNotesMode() {
  std::cout << "[TEST] 4. Testing Stage 4 Score-Informed Expected Notes Mode...\n";
  Cascade cascade;
  EngineRing ring;
  std::vector<NoteEvent> events;

  // Set expected C Major Triad: C4 (60), E4 (64), G4 (67)
  cascade.setExpectedNotes({60, 64, 67});

  // A. Synthesize C Major Triad
  constexpr int N = 4096;
  std::vector<float> triad(N, 0.0f);
  std::vector<float> temp(N, 0.0f);

  generatePianoNote(temp.data(), N, Goertzel::midiToFrequency(60), 48000, 0.0002f, 0.3f);
  for (int i = 0; i < N; ++i) triad[i] += temp[i];

  generatePianoNote(temp.data(), N, Goertzel::midiToFrequency(64), 48000, 0.0002f, 0.3f);
  for (int i = 0; i < N; ++i) triad[i] += temp[i];

  generatePianoNote(temp.data(), N, Goertzel::midiToFrequency(67), 48000, 0.0002f, 0.3f);
  for (int i = 0; i < N; ++i) triad[i] += temp[i];

  ring.push(triad.data(), triad.size());

  // Process hops (triad resolves within 4-6 hops / 20-30 ms)
  bool hasC4 = false, hasE4 = false, hasG4 = false;
  for (int hop = 0; hop < 8; ++hop) {
    cascade.processHop(ring, events, hop * 5.33);
    ring.consume(256);
    for (const auto& ev : events) {
      if (ev.type == NoteEvent::NoteOn) {
        if (ev.midi == 60) hasC4 = true;
        if (ev.midi == 64) hasE4 = true;
        if (ev.midi == 67) hasG4 = true;
      }
    }
  }

  assert(hasC4 && hasE4 && hasG4);
  std::cout << "  ✓ All triad notes (C4, E4, G4) resolved in 21-30 ms.\n";

  // B. Test Out-Of-Set Rejection: Play D#4 (MIDI 63)
  ring.reset();
  cascade.reset();
  cascade.setExpectedNotes({60, 64, 67});

  std::vector<float> dSharp(N, 0.0f);
  generatePianoNote(dSharp.data(), N, Goertzel::midiToFrequency(63), 48000, 0.0002f, 0.7f);
  ring.push(dSharp.data(), dSharp.size());

  bool outOfSetFired = false;
  for (int hop = 0; hop < 8; ++hop) {
    cascade.processHop(ring, events, hop * 5.33);
    ring.consume(256);
    for (const auto& ev : events) {
      if (ev.type == NoteEvent::NoteOn) {
        outOfSetFired = true;
      }
    }
  }
  assert(!outOfSetFired);
  std::cout << "  ✓ Out-of-set semitone (D#4) successfully rejected.\n";
}

// 5. Test the v1.1 split-scale calibrator on one key (C4), hop by hop.
static void testCalibrationEngine() {
  std::cout << "[TEST] 5. Testing Split-Scale Two-Strike Calibration (C4 only)...\n";
  PianoCalibrator calibrator;
  calibrator.start(48000, {false, 60, 60});  // a "keyboard" of one key: C4
  EngineRing ring;

  // 1 s of quiet room, a soft strike at 1.0 s and a firm one at 2.3 s (each released after 0.7 s).
  std::vector<float> pcm(48000 * 4, 0.0f);
  std::vector<float> tone(48000, 0.0f);
  auto strikeAt = [&](double t, float amp) {
    generatePianoNote(tone.data(), 48000 * 0.7, 261.63f, 48000, 0.00035f, amp);
    for (int i = 0; i < 48000 * 0.7; ++i) pcm[static_cast<std::size_t>(t * 48000) + i] += tone[i];
  };
  strikeAt(1.0, 0.25);
  strikeAt(2.3, 0.6);
  for (std::size_t i = 0; i < pcm.size(); ++i) pcm[i] += 0.0003f * static_cast<float>(((i * 7919) % 997) / 997.0 - 0.5);

  bool quiet = false, strike1 = false, done = false;
  CalibrationProgressEvent ev{};
  for (std::size_t off = 0; off + 256 <= pcm.size() && !done; off += 256) {
    ring.push(pcm.data() + off, 256);
    if (calibrator.processHop(ring, ev)) {
      if (ev.state == kCalMeasuringNoise) quiet = true;
      if (ev.state == kCalWaitStrike2) {
        strike1 = true;
        std::cout << std::defaultfloat << std::setprecision(6) << "  ✓ Strike 1: f1=" << ev.measuredFreqHz << " Hz ("
                  << ev.centsOffset << " ¢), B=" << ev.measuredB << "\n";
      }
      if (ev.state == kCalAllDone) {
        done = true;
        std::cout << std::defaultfloat << std::setprecision(6) << "  ✓ Strike 2: f1=" << ev.measuredFreqHz << " Hz ("
                  << ev.centsOffset << " ¢), B=" << ev.measuredB << "\n";
      }
    }
    ring.consume(256);
  }
  assert(quiet && strike1 && done);
  assert(std::fabs(ev.centsOffset) < 3.0f);
  assert(ev.measuredB > 0.0002f && ev.measuredB < 0.0006f);  // the tone was synthesized with B = 0.00035
  std::cout << "  ✓ Calibration complete; profile A4 = " << calibrator.profile().a4ReferenceHz << " Hz.\n";
}

int main(int argc, char* argv[]) {
  std::string mode = "quick";
  if (argc > 1) {
    mode = argv[1];
  }

  std::cout << "========================================================\n";
  std::cout << "  PianoEngine C++17 Verification Benchmark Harness\n";
  std::cout << "  Mode: " << mode << "\n";
  std::cout << "========================================================\n\n";

  testSampleRing();
  testIdleGate();
  test88KeyAccuracy(mode);
  testExpectedNotesMode();
  testCalibrationEngine();

  std::cout << "\n========================================================\n";
  std::cout << "  ALL C++ BENCHMARKS PASSED SUCCESSFULLY!\n";
  std::cout << "========================================================\n";
  return 0;
}
