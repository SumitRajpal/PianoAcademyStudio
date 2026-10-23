// Engine test: threads, events, calibration hand-off and profile persistence.
// Build it with -fsanitize=thread (./run.sh engine) to prove the JS-thread
// setters no longer race the analysis thread (the audit found 5 races).

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <memory>
#include <mutex>
#include <random>
#include <string>
#include <thread>
#include <vector>

#include "../shared/Engine.h"
#include "../shared/LiveKeys.h"
#include "PianoSynth.h"

using namespace piano;

namespace {

int g_failed = 0;

void check(bool ok, const char* name, const std::string& detail) {
  std::printf("  [%s] %-52s %s\n", ok ? "PASS" : "FAIL", name, detail.c_str());
  if (!ok) ++g_failed;
}

// Stands in for IosAudioInput: plays a prepared buffer into the ring in real
// time (256 samples every 5.33 ms) from its own thread, like the OS would.
class FakeInput final : public AudioInput {
public:
  FakeInput(EngineRing& ring, std::vector<float> audio) : ring_(ring), audio_(std::move(audio)) {}
  ~FakeInput() override { stop(); }
  bool start(int, int) override {
    running_ = true;
    thread_ = std::thread([this] {
      std::size_t off = 0;
      auto next = std::chrono::steady_clock::now();
      std::vector<float> silence(256, 0.0f);
      while (running_) {
        const float* src = off + 256 <= audio_.size() ? audio_.data() + off : silence.data();
        ring_.push(src, 256);
        off += 256;
        next += std::chrono::microseconds(5333);
        std::this_thread::sleep_until(next);
      }
    });
    reportStatus(AudioInputStatus::Running);
    return true;
  }
  void stop() override {
    running_ = false;
    if (thread_.joinable()) thread_.join();
  }
  bool isRunning() const noexcept override { return running_; }

private:
  EngineRing& ring_;
  std::vector<float> audio_;
  std::atomic<bool> running_{false};
  std::thread thread_;
};

std::vector<float> melody(const std::vector<int>& notes, double spacing, unsigned seed) {
  std::mt19937 rng(seed);
  auto pcm = synth::silence(0.3 + notes.size() * spacing + 0.8);
  for (std::size_t k = 0; k < notes.size(); ++k) {
    const double t = 0.3 + k * spacing;
    synth::renderStrike(pcm, {notes[k], t, t + spacing * 0.9, 0.12}, rng);
  }
  synth::addNoise(pcm, -65.0, rng);
  return pcm;
}

}  // namespace

int main() {
  std::printf("== Engine ==\n");
  const std::string path = std::string(std::getenv("TMPDIR") ? std::getenv("TMPDIR") : "/tmp") + "/piano_engine_test_profile.json";
  std::remove(path.c_str());

  // 1. Events arrive, with stream-time stamps, while the JS thread keeps
  //    changing settings and swapping sinks (what lessons and Fast Refresh do).
  {
    Engine engine;
    const std::vector<int> notes{60, 62, 64, 65, 67};
    engine.setAudioInput(std::make_unique<FakeInput>(engine.getRing(), melody(notes, 0.35, 1)));
    std::mutex m;
    std::vector<NoteEvent> got;
    std::atomic<int> statuses{0};
    auto sink = [&](const NoteEvent& e) {
      std::lock_guard<std::mutex> lock(m);
      got.push_back(e);
    };
    engine.setNoteSink(std::make_shared<const Engine::NoteSink>(sink));
    engine.setStatusSink(std::make_shared<const Engine::StatusSink>([&](const EngineStatusEvent&) { ++statuses; }));
    check(engine.start(), "start", "");
    for (int i = 0; i < 120; ++i) {  // ~2.4 s of churn from the "JS thread"
      if (i % 10 == 0) engine.setNoteSink(std::make_shared<const Engine::NoteSink>(sink));
      if (i % 25 == 0) engine.setPolyphony(false);
      (void)engine.profileSnapshot();
      (void)engine.getStats();
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    engine.stop();
    std::vector<int> ons;
    double lastT = -1.0;
    bool monotonic = true;
    for (const auto& e : got) {
      if (e.type == NoteEvent::NoteOn) ons.push_back(e.midi);
      monotonic &= e.tMs >= lastT;
      lastT = e.tMs;
    }
    std::string seq;
    for (int n : ons) seq += std::to_string(n) + " ";
    check(ons == notes, "melody detected through the engine threads", seq);
    double firstOn = -1.0;
    for (const auto& e : got)
      if (e.type == NoteEvent::NoteOn) {
        firstOn = e.tMs;
        break;
      }
    check(monotonic && firstOn > 300.0 && firstOn < 360.0, "tMs is stream time (first strike at 300 ms)",
          std::to_string(firstOn) + " ms");
    check(statuses.load() >= 2, "status events (running, stopped)", std::to_string(statuses.load()));
    const auto live = engine.live();
    bool anyDown = false;
    for (int m = 0; m < LiveKeys::kKeys; ++m) anyDown |= live->keys().isDown(m);
    check(live->events().head() == got.size() && !anyDown, "every note reached the key table; all up after stop",
          std::to_string(live->events().head()) + " events");
    const EngineStats st = engine.getStats();
    const std::string timing = "avg " + std::to_string(st.avgUs) + " us, max " + std::to_string(st.maxUs) + " us, late " +
                               std::to_string(st.lateHops) + ", dropped " + std::to_string(st.droppedHops);
#if defined(__SANITIZE_THREAD__) || (defined(__has_feature) && __has_feature(thread_sanitizer))
    check(true, "timing (not judged under ThreadSanitizer)", timing);
#else
    check(st.lateHops == 0 && st.maxUs < 5333.0, "no late hops", timing);
#endif
  }

  // 2. Lesson mode: expected notes change every step while audio flows.
  {
    Engine engine;
    const std::vector<int> notes{60, 64, 67, 72};
    engine.setAudioInput(std::make_unique<FakeInput>(engine.getRing(), melody(notes, 0.4, 2)));
    std::mutex m;
    std::vector<int> ons;
    engine.setNoteSink(std::make_shared<const Engine::NoteSink>([&](const NoteEvent& e) {
      std::lock_guard<std::mutex> lock(m);
      if (e.type == NoteEvent::NoteOn) ons.push_back(e.midi);
    }));
    engine.setExpectedNotes({60});
    engine.start();
    const auto t0 = std::chrono::steady_clock::now();
    for (std::size_t step = 0; step < notes.size(); ++step) {
      // Advance the lesson right after each strike's window, like a UI would.
      std::this_thread::sleep_until(t0 + std::chrono::milliseconds(300 + 400 * static_cast<int>(step) + 200));
      if (step + 1 < notes.size()) engine.setExpectedNotes({notes[step + 1]});
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    engine.stop();
    std::string seq;
    for (int n : ons) seq += std::to_string(n) + " ";
    check(ons == notes, "lesson steps (expected notes changing live)", seq);
  }

  // 3. Calibration through the engine, saved to disk, loaded by a new engine.
  {
    Engine engine;
    engine.setProfileStoragePath(path);
    check(!engine.profileSnapshot().isCalibrated, "no profile before calibrating", "");
    // A user who strikes each key in the 49-key fast sequence twice, 1.3 s apart.
    std::array<int, PianoCalibrator::kMaxKeys> seq{};
    const CalibrationOptions opts{false, 36, 84};
    const int n = PianoCalibrator::buildSequence(opts, seq);
    std::mt19937 rng(3);
    auto pcm = synth::silence(1.0 + n * 2.6 + 1.0);
    for (int k = 0; k < n; ++k) {
      const double t = 1.0 + k * 2.6;
      synth::renderStrike(pcm, {seq[static_cast<std::size_t>(k)], t, t + 0.7, 0.06}, rng);
      synth::renderStrike(pcm, {seq[static_cast<std::size_t>(k)], t + 1.3, t + 2.0, 0.2}, rng);
    }
    synth::addNoise(pcm, -62.0, rng);
    engine.setAudioInput(std::make_unique<FakeInput>(engine.getRing(), std::move(pcm)));
    std::atomic<int> lastState{-99};
    std::atomic<int> events{0};
    std::atomic<int> notesWhileCalibrating{0};
    engine.setCalibrationSink(std::make_shared<const Engine::CalibrationSink>([&](const CalibrationProgressEvent& e) {
      lastState = e.state;
      ++events;
    }));
    engine.setNoteSink(std::make_shared<const Engine::NoteSink>([&](const NoteEvent& e) {
      if (e.type == NoteEvent::NoteOn && lastState.load() != kCalAllDone) ++notesWhileCalibrating;
    }));
    check(engine.startCalibration(opts), "startCalibration starts the engine", "");
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
    while (lastState.load() != kCalAllDone && std::chrono::steady_clock::now() < deadline) {
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    const PianoProfile p = engine.profileSnapshot();
    check(lastState.load() == kCalAllDone && p.isCalibrated && !engine.isCalibrating(), "calibration completes",
          std::to_string(events.load()) + " events, " + std::to_string(p.measuredKeyCount()) + " keys measured");
    check(notesWhileCalibrating.load() >= n, "the keys played are detected while calibrating",
          std::to_string(notesWhileCalibrating.load()) + " note-ons for " + std::to_string(n) + " keys");
    check(!std::ifstream(path), "used at once, but not saved until the user saves", "");
    check(engine.saveCalibrationProfile(), "saveCalibrationProfile", "");
    engine.stop();
    std::ifstream f(path);
    check(static_cast<bool>(f), "profile saved to disk", path);
    Engine reloaded;
    reloaded.setProfileStoragePath(path);
    const PianoProfile q = reloaded.profileSnapshot();
    check(q.isCalibrated && q.lowestMidi == 36 && q.highestMidi == 84 &&
              std::fabs(q.keyFreqHz[60] - p.keyFreqHz[60]) < 1e-3f,
          "a new engine loads it at startup", "");
    reloaded.clearCalibrationProfile();
    check(!reloaded.profileSnapshot().isCalibrated && !std::ifstream(path), "clearCalibrationProfile removes it", "");
    check(!reloaded.saveCalibrationProfile(), "nothing to save without a calibration", "");
  }

  // 4. Stopping mid-calibration really stops it (v1.0 resumed calibrating).
  {
    Engine engine;
    engine.setAudioInput(std::make_unique<FakeInput>(engine.getRing(), synth::silence(1.0)));
    engine.startCalibration({false, 21, 108});
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    engine.stop();
    check(!engine.isCalibrating(), "stop() ends calibration", "");
  }

  std::printf("%s\n", g_failed == 0 ? "engine: all passed" : "engine: FAILED");
  return g_failed == 0 ? 0 : 1;
}
