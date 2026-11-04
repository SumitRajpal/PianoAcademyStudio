// The take recorder's tests (cpp/capture/TakeRecorder.h). Run: ./run.sh capture
//   take_recorder_test           every test, with 3 minutes of audio
//   take_recorder_test quick     the same with 20 s, for ThreadSanitizer

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <functional>
#include <new>
#include <string>
#include <thread>
#include <vector>

#include "../cpp/capture/TakeRecorder.h"
#include "../tools/common/Wav.h"

// Counts allocations made by the thread that sets t_countAllocations: the
// audio thread's push() must make none.
namespace {
thread_local bool t_countAllocations = false;
std::atomic<int> g_allocations{0};
}  // namespace

void* operator new(std::size_t size) {
  if (t_countAllocations) g_allocations.fetch_add(1, std::memory_order_relaxed);
  if (void* p = std::malloc(size ? size : 1)) return p;
  throw std::bad_alloc();
}
void operator delete(void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }

namespace {

using piano::capture::StopReason;
using piano::capture::TakeRecorder;
using piano::capture::TakeStats;
using namespace std::chrono_literals;

int g_failed = 0;
int g_passed = 0;

void check(bool ok, const std::string& name, const std::string& detail = "") {
  std::printf("  [%s] %-62s %s\n", ok ? "PASS" : "FAIL", name.c_str(), detail.c_str());
  (ok ? g_passed : g_failed)++;
}

std::string tempPath(const std::string& name) {
  const auto dir = std::filesystem::temp_directory_path() / "take-recorder-test";
  std::filesystem::create_directories(dir);
  return (dir / name).string();
}

/** Deterministic test audio: a few tones and a little noise, never clipping. */
std::vector<float> testAudio(std::size_t n, uint32_t seed) {
  std::vector<float> x(n);
  uint32_t s = seed;
  for (std::size_t i = 0; i < n; ++i) {
    s = s * 1664525u + 1013904223u;
    const double noise = (static_cast<double>(s >> 8) / 16777216.0 - 0.5) * 0.01;
    const double t = static_cast<double>(i) / TakeRecorder::kSampleRate;
    x[i] = static_cast<float>(0.3 * std::sin(2 * M_PI * 261.63 * t) + 0.2 * std::sin(2 * M_PI * 440.0 * t) + noise);
  }
  return x;
}

/** Pushes x as the audio thread would, in callback-sized chunks, a little faster than real time. */
void pushLikeAudioThread(TakeRecorder& rec, const std::vector<float>& x, std::atomic<int>* allocations = nullptr) {
  static constexpr std::size_t kChunks[] = {256, 512, 1024, 4096, 256, 768};
  std::size_t i = 0;
  std::size_t c = 0;
  while (i < x.size()) {
    const std::size_t n = std::min(kChunks[c++ % 6], x.size() - i);
    t_countAllocations = allocations != nullptr;
    rec.push(x.data() + i, n);
    t_countAllocations = false;
    i += n;
    std::this_thread::sleep_for(500us);  // ~0.5 ms per chunk: dozens of times real time
  }
}

bool sameSamples(const std::vector<float>& a, const std::vector<float>& b) {
  return a.size() == b.size() && std::memcmp(a.data(), b.data(), a.size() * sizeof(float)) == 0;
}

void waitUntil(const std::function<bool()>& done, std::chrono::milliseconds limit = 5s) {
  const auto end = std::chrono::steady_clock::now() + limit;
  while (!done() && std::chrono::steady_clock::now() < end) std::this_thread::sleep_for(2ms);
}

}  // namespace

int main(int argc, char** argv) {
  const bool quick = argc > 1 && std::strcmp(argv[1], "quick") == 0;
  const std::size_t seconds = quick ? 20 : 180;
  std::printf("Take recorder tests (%zu s of audio)\n", seconds);

  // Every sample, bit for bit, from an audio thread to a WAV the harness reads.
  // The ring holds 87 s here, so pushing faster than real time never fills it.
  {
    TakeRecorder rec(std::size_t{1} << 22);
    const auto path = tempPath("exact.wav");
    const auto x = testAudio(seconds * TakeRecorder::kSampleRate, 1);
    check(rec.start(path), "a take starts");
    check(!rec.start(tempPath("second.wav")), "a second take can't start while one is open");
    std::thread audio([&] { pushLikeAudioThread(rec, x, &g_allocations); });
    audio.join();
    const TakeStats stats = rec.stop();
    check(g_allocations.load() == 0, "the audio thread's pushes allocate nothing",
          std::to_string(g_allocations.load()) + " allocations");
    check(stats.samples == x.size() && stats.droppedSamples == 0 && stats.gaps.empty(), "every sample is written, none dropped",
          std::to_string(stats.samples) + " of " + std::to_string(x.size()));
    const auto wav = harness::readWav(path);
    check(wav.sampleRate == 48000 && wav.channels == 1 && wav.bitsPerSample == 32, "48 kHz mono 32-bit float");
    check(sameSamples(wav.samples, x), "the file holds exactly the pushed samples");
    check(std::filesystem::file_size(path) == 44 + 4 * x.size(), "the header's sizes match the file");
  }

  // Before start and after stop, pushes do nothing.
  {
    TakeRecorder rec;
    const auto before = testAudio(4800, 2);
    rec.push(before.data(), before.size());
    check(rec.status().samples == 0 && !rec.status().recording, "disarmed: a push before a take does nothing");
    const auto path = tempPath("armed.wav");
    rec.start(path);
    const auto during = testAudio(9600, 3);
    rec.push(during.data(), during.size());
    rec.stop();
    rec.push(before.data(), before.size());
    check(sameSamples(harness::readWav(path).samples, during), "only the take's own samples reach the file");
    check(rec.stop().samples == 0, "stop without a take returns empty counts");
  }

  // The file is readable mid-take: the header is rewritten every second.
  {
    TakeRecorder rec;
    const auto path = tempPath("midtake.wav");
    const auto x = testAudio(3 * TakeRecorder::kSampleRate, 4);
    rec.start(path);
    rec.push(x.data(), x.size());
    std::this_thread::sleep_for(1300ms);
    const auto partial = harness::readWav(path);
    check(sameSamples(partial.samples, x), "mid-take, the file holds every second written so far",
          std::to_string(partial.samples.size()) + " samples");
    rec.stop();
  }

  // A full ring drops the rest of a push, counts it and keeps where the gap is.
  {
    TakeRecorder rec(4096);
    const auto path = tempPath("overflow.wav");
    const auto x = testAudio(10000, 5);
    rec.start(path);
    rec.holdWriterForTests(true);
    rec.push(x.data(), 5000);  // 4096 fit, 904 lost
    rec.holdWriterForTests(false);
    waitUntil([&] { return rec.status().samples == 4096; });
    rec.holdWriterForTests(true);
    rec.push(x.data() + 5000, 5000);  // 4096 more fit, 904 lost
    rec.holdWriterForTests(false);
    const TakeStats stats = rec.stop();
    check(stats.samples == 8192 && stats.droppedSamples == 1808, "dropped samples are counted",
          std::to_string(stats.samples) + " written, " + std::to_string(stats.droppedSamples) + " dropped");
    const bool gaps = stats.gaps.size() == 2 && stats.gaps[0].position == 4096 && stats.gaps[0].length == 904 &&
                      stats.gaps[1].position == 8192 && stats.gaps[1].length == 904;
    check(gaps, "each gap keeps its position in the file and its length");
    std::vector<float> kept(x.begin(), x.begin() + 4096);
    kept.insert(kept.end(), x.begin() + 5000, x.begin() + 9096);
    check(sameSamples(harness::readWav(path).samples, kept), "the samples that fit are written unchanged");
  }

  // Peak and clipped samples (|x| >= 0.985, master 6.5).
  {
    TakeRecorder rec;
    const auto path = tempPath("clip.wav");
    std::vector<float> x(4800, 0.1f);
    x[100] = 0.99f;
    x[200] = -0.99f;
    x[300] = 0.985f;
    x[400] = 0.984f;
    rec.start(path);
    rec.push(x.data(), x.size());
    const TakeStats stats = rec.stop();
    check(stats.peak == 0.99f && stats.clippedSamples == 3, "the peak and the clipped count",
          "peak " + std::to_string(stats.peak) + ", clipped " + std::to_string(stats.clippedSamples));
  }

  // An interruption stops the capture at once and says why; stop() keeps what came before.
  {
    TakeRecorder rec;
    const auto path = tempPath("interrupt.wav");
    const auto x = testAudio(9600, 6);
    rec.start(path);
    rec.push(x.data(), 4800);
    rec.interrupt(StopReason::RouteChanged);
    rec.push(x.data() + 4800, 4800);
    const auto status = rec.status();
    check(status.recording && !status.capturing && status.stopReason == StopReason::RouteChanged,
          "interrupted: still open, no longer capturing, with the reason");
    rec.interrupt(StopReason::Background);
    const TakeStats stats = rec.stop();
    check(stats.samples == 4800 && stats.stopReason == StopReason::RouteChanged,
          "the samples before the interruption, and the first reason");
    check(std::strcmp(piano::capture::stopReasonName(stats.stopReason), "route") == 0, "reasons have names for meta.json");
  }

  // Threads together, for ThreadSanitizer: an audio thread pushing all along,
  // a status reader, takes started and stopped, and an interruption.
  {
    TakeRecorder rec(16384);
    std::atomic<bool> running{true};
    const auto chunk = testAudio(256, 7);
    std::thread audio([&] {
      while (running.load()) {
        rec.push(chunk.data(), chunk.size());
        std::this_thread::sleep_for(200us);
      }
    });
    std::thread reader([&] {
      while (running.load()) {
        const auto s = rec.status();
        (void)s;
        std::this_thread::sleep_for(1ms);
      }
    });
    bool allValid = true;
    for (int take = 0; take < 4; ++take) {
      const auto path = tempPath("threads" + std::to_string(take) + ".wav");
      rec.start(path);
      std::this_thread::sleep_for(60ms);
      if (take == 2) {
        std::thread([&] { rec.interrupt(StopReason::Interrupted); }).join();
        std::this_thread::sleep_for(10ms);
      }
      const TakeStats stats = rec.stop();
      const auto wav = harness::readWav(path);
      allValid = allValid && wav.samples.size() == stats.samples && stats.samples > 0;
    }
    running.store(false);
    audio.join();
    reader.join();
    check(allValid, "takes started and stopped while the audio thread runs are each whole");
  }

  std::printf("\n%d passed, %d failed\n", g_passed, g_failed);
  return g_failed == 0 ? 0 : 1;
}
