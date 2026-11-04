#pragma once

// The take recorder (master 5.2 and 5.3; Phase 0 slice 2). It writes every
// sample the microphone capture hands the engine to a 48 kHz mono 32-bit
// float WAV file: a take for the evaluation harness. One recorder serves the
// one microphone: takeRecorder().
//
// Threads:
//  - Audio thread: push(). Wait-free: a bounded copy into a ring allocated up
//    front, with no lock, no allocation and no file I/O. It does nothing
//    unless a take is armed.
//  - Writer thread, one per take: drains the ring every 20 ms into the file,
//    keeps the peak and clipped counts, and rewrites the WAV header every
//    second, so a crash keeps the take up to its last second.
//  - Control thread (JS): start(), stop().
//  - Any thread: status(), and interrupt(), which stops the capture at once
//    and records why (a call, a route change, the app leaving the screen).

#include <algorithm>
#include <atomic>
#include <bit>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace piano::capture {

static_assert(std::endian::native == std::endian::little, "WAV samples are written as they lie in memory");

enum class StopReason : uint8_t {
  None,
  Interrupted,   // a call, Siri or another app took the audio session
  RouteChanged,  // headphones or a Bluetooth device came or went
  Background,    // the app left the screen
  WriteError,    // the file could not be written (storage full)
  TooLong,       // the WAV format's 4 GB limit, about 6 hours
};

/** The name meta.json uses for a stop reason ("" for none). */
inline const char* stopReasonName(StopReason reason) noexcept {
  switch (reason) {
    case StopReason::None: return "";
    case StopReason::Interrupted: return "interrupted";
    case StopReason::RouteChanged: return "route";
    case StopReason::Background: return "background";
    case StopReason::WriteError: return "write-error";
    case StopReason::TooLong: return "too-long";
  }
  return "";
}

/** Samples lost because the ring was full: where in the file, and how many. */
struct TakeGap {
  uint64_t position;
  uint64_t length;
};

struct TakeStats {
  uint64_t samples = 0;         // in the file
  uint64_t droppedSamples = 0;  // lost because the ring was full
  uint64_t clippedSamples = 0;  // |x| >= kClipLevel
  float peak = 0.0f;            // the largest |x|
  std::vector<TakeGap> gaps;    // the first kMaxGaps places where samples were lost
  StopReason stopReason = StopReason::None;
};

struct TakeStatus {
  bool recording = false;  // a take is open, from start() to stop()
  bool capturing = false;  // samples are being accepted
  uint64_t samples = 0;    // written so far
  uint64_t droppedSamples = 0;
  uint64_t clippedSamples = 0;
  float peak = 0.0f;
  StopReason stopReason = StopReason::None;
};

class TakeRecorder {
public:
  static constexpr int kSampleRate = 48000;
  static constexpr float kClipLevel = 0.985f;  // master 6.5's clip flag
  static constexpr std::size_t kDefaultRingSamples = std::size_t{1} << 18;  // 5.46 s
  static constexpr std::size_t kMaxGaps = 64;
  static constexpr uint64_t kHeaderBytes = 44;
  static constexpr uint64_t kMaxSamples = (0xFFFFFFFFull - kHeaderBytes) / 4;  // the RIFF size limit

  explicit TakeRecorder(std::size_t ringSamples = kDefaultRingSamples,
                        std::chrono::milliseconds writerPeriod = std::chrono::milliseconds(20))
      : capacity_(std::bit_ceil(std::max<std::size_t>(ringSamples, 1024))),
        mask_(capacity_ - 1),
        ring_(new float[capacity_]()),
        writerPeriod_(writerPeriod) {}

  ~TakeRecorder() { stop(); }

  TakeRecorder(const TakeRecorder&) = delete;
  TakeRecorder& operator=(const TakeRecorder&) = delete;

  // ---- audio thread ------------------------------------------------------------

  /** Copies the samples into the ring while a take is armed; what doesn't fit is counted as dropped. */
  void push(const float* samples, std::size_t count) noexcept {
    inFlight_.fetch_add(1, std::memory_order_seq_cst);
    if (armed_.load(std::memory_order_seq_cst)) {
      const uint64_t tail = tail_.load(std::memory_order_relaxed);
      const uint64_t head = head_.load(std::memory_order_acquire);
      const uint64_t space = capacity_ - (tail - head);
      const std::size_t fits = count <= space ? count : static_cast<std::size_t>(space);
      for (std::size_t i = 0; i < fits; ++i) ring_[(tail + i) & mask_] = samples[i];
      tail_.store(tail + fits, std::memory_order_release);
      if (fits < count) noteDropped(tail + fits, count - fits);
    }
    inFlight_.fetch_sub(1, std::memory_order_seq_cst);
  }

  // ---- control thread ----------------------------------------------------------

  /** Opens a take. False if one is already open or the file can't be created. */
  bool start(const std::string& wavPath) {
    if (recording_.load(std::memory_order_acquire)) return false;
    std::FILE* file = std::fopen(wavPath.c_str(), "wb");
    if (file == nullptr) return false;
    file_ = file;
    head_.store(0, std::memory_order_relaxed);
    tail_.store(0, std::memory_order_relaxed);
    written_.store(0, std::memory_order_relaxed);
    dropped_.store(0, std::memory_order_relaxed);
    clipped_.store(0, std::memory_order_relaxed);
    peak_.store(0.0f, std::memory_order_relaxed);
    gapCount_.store(0, std::memory_order_relaxed);
    stopReason_.store(StopReason::None, std::memory_order_relaxed);
    finishing_.store(false, std::memory_order_relaxed);
    writeError_ = false;
    writeHeader(0);
    if (writeError_) {
      std::fclose(file_);
      file_ = nullptr;
      return false;
    }
    recording_.store(true, std::memory_order_release);
    writer_ = std::thread(&TakeRecorder::writerLoop, this);
    armed_.store(true, std::memory_order_seq_cst);
    return true;
  }

  /** Closes the take: everything pushed so far goes into the file. Empty counts if none is open. */
  TakeStats stop() {
    if (!recording_.load(std::memory_order_acquire)) return {};
    armed_.store(false, std::memory_order_seq_cst);
    while (inFlight_.load(std::memory_order_seq_cst) != 0) std::this_thread::yield();
    finishing_.store(true, std::memory_order_release);
    if (writer_.joinable()) writer_.join();

    TakeStats stats;
    stats.samples = written_.load(std::memory_order_relaxed);
    stats.droppedSamples = dropped_.load(std::memory_order_relaxed);
    stats.clippedSamples = clipped_.load(std::memory_order_relaxed);
    stats.peak = peak_.load(std::memory_order_relaxed);
    const std::size_t gaps = std::min(gapCount_.load(std::memory_order_acquire), kMaxGaps);
    stats.gaps.assign(gaps_, gaps_ + gaps);
    stats.stopReason = stopReason_.load(std::memory_order_acquire);
    recording_.store(false, std::memory_order_release);
    return stats;
  }

  // ---- any thread ----------------------------------------------------------------

  /** Stops the capture at once and records why; the first reason wins. The take stays open until stop(). */
  void interrupt(StopReason reason) noexcept {
    if (!recording_.load(std::memory_order_acquire)) return;
    StopReason none = StopReason::None;
    stopReason_.compare_exchange_strong(none, reason, std::memory_order_acq_rel);
    armed_.store(false, std::memory_order_seq_cst);
  }

  TakeStatus status() const noexcept {
    TakeStatus s;
    s.recording = recording_.load(std::memory_order_acquire);
    s.capturing = armed_.load(std::memory_order_acquire);
    s.samples = written_.load(std::memory_order_relaxed);
    s.droppedSamples = dropped_.load(std::memory_order_relaxed);
    s.clippedSamples = clipped_.load(std::memory_order_relaxed);
    s.peak = peak_.load(std::memory_order_relaxed);
    s.stopReason = stopReason_.load(std::memory_order_acquire);
    return s;
  }

  /** Tests only: while held, the writer drains nothing, so the ring fills. */
  void holdWriterForTests(bool hold) noexcept { holdWriter_.store(hold, std::memory_order_release); }

private:
  // Audio thread only (and stop(), after the audio thread has left push()).
  void noteDropped(uint64_t position, uint64_t lost) noexcept {
    dropped_.fetch_add(lost, std::memory_order_relaxed);
    const std::size_t count = gapCount_.load(std::memory_order_relaxed);
    if (count > 0 && gaps_[count - 1].position == position) {
      gaps_[count - 1].length += lost;  // nothing was written since the last gap: it goes on
    } else if (count < kMaxGaps) {
      gaps_[count] = {position, lost};
      gapCount_.store(count + 1, std::memory_order_release);
    }
  }

  void writerLoop() {
    std::vector<float> chunk(8192);
    auto lastHeader = std::chrono::steady_clock::now();
    while (!finishing_.load(std::memory_order_acquire)) {
      if (!holdWriter_.load(std::memory_order_acquire)) drain(chunk);
      const auto now = std::chrono::steady_clock::now();
      if (now - lastHeader >= std::chrono::seconds(1)) {
        writeHeader(written_.load(std::memory_order_relaxed));
        lastHeader = now;
      }
      std::this_thread::sleep_for(writerPeriod_);
    }
    drain(chunk);  // the push()es have all returned: this is the rest of the take
    writeHeader(written_.load(std::memory_order_relaxed));
    std::fclose(file_);
    file_ = nullptr;
  }

  void drain(std::vector<float>& chunk) {
    const uint64_t tail = tail_.load(std::memory_order_acquire);
    uint64_t head = head_.load(std::memory_order_relaxed);
    float peak = peak_.load(std::memory_order_relaxed);
    uint64_t clipped = 0;
    while (head < tail && !writeError_) {
      const std::size_t n = static_cast<std::size_t>(std::min<uint64_t>(tail - head, chunk.size()));
      for (std::size_t i = 0; i < n; ++i) {
        const float x = ring_[(head + i) & mask_];
        chunk[i] = x;
        const float a = std::fabs(x);
        peak = std::max(peak, a);
        if (a >= kClipLevel) ++clipped;
      }
      const uint64_t written = written_.load(std::memory_order_relaxed);
      const std::size_t keep = static_cast<std::size_t>(std::min<uint64_t>(n, kMaxSamples - written));
      if (std::fwrite(chunk.data(), sizeof(float), keep, file_) != keep) {
        writeError_ = true;
        interrupt(StopReason::WriteError);
      } else if (keep < n) {
        interrupt(StopReason::TooLong);
      }
      written_.store(written + keep, std::memory_order_relaxed);
      head += n;
      head_.store(head, std::memory_order_release);
      if (keep < n) break;
    }
    // Anything left after an error or the length limit is let go, so the audio thread never blocks.
    if (writeError_ || written_.load(std::memory_order_relaxed) >= kMaxSamples) head_.store(tail, std::memory_order_release);
    peak_.store(peak, std::memory_order_relaxed);
    if (clipped > 0) clipped_.fetch_add(clipped, std::memory_order_relaxed);
  }

  void writeHeader(uint64_t samples) {
    const uint32_t dataBytes = static_cast<uint32_t>(samples * 4);
    unsigned char h[kHeaderBytes];
    auto put = [&h](std::size_t at, uint32_t v, int bytes) {
      for (int i = 0; i < bytes; ++i) h[at + i] = static_cast<unsigned char>(v >> (8 * i));
    };
    std::copy_n("RIFF", 4, h);
    put(4, 36 + dataBytes, 4);
    std::copy_n("WAVEfmt ", 8, h + 8);
    put(16, 16, 4);              // fmt chunk size
    put(20, 3, 2);               // IEEE float
    put(22, 1, 2);               // mono
    put(24, kSampleRate, 4);
    put(28, kSampleRate * 4, 4);  // bytes per second
    put(32, 4, 2);               // bytes per frame
    put(34, 32, 2);              // bits per sample
    std::copy_n("data", 4, h + 36);
    put(40, dataBytes, 4);
    if (std::fseek(file_, 0, SEEK_SET) != 0 || std::fwrite(h, 1, sizeof h, file_) != sizeof h) {
      writeError_ = true;
      interrupt(StopReason::WriteError);
    }
    std::fseek(file_, 0, SEEK_END);
    std::fflush(file_);
  }

  const std::size_t capacity_;
  const std::size_t mask_;
  const std::unique_ptr<float[]> ring_;
  const std::chrono::milliseconds writerPeriod_;

  // The audio thread and the writer.
  alignas(64) std::atomic<uint64_t> tail_{0};
  alignas(64) std::atomic<uint64_t> head_{0};

  // The arming handshake: stop() disarms, then waits until no push() is in flight.
  alignas(64) std::atomic<bool> armed_{false};
  std::atomic<int> inFlight_{0};

  // Counts, readable from any thread.
  std::atomic<uint64_t> written_{0};
  std::atomic<uint64_t> dropped_{0};
  std::atomic<uint64_t> clipped_{0};
  std::atomic<float> peak_{0.0f};
  std::atomic<StopReason> stopReason_{StopReason::None};
  std::atomic<bool> recording_{false};

  // Audio thread only; read by stop() after the audio thread has left push().
  TakeGap gaps_[kMaxGaps]{};
  std::atomic<std::size_t> gapCount_{0};

  // The writer thread, started and joined by the control thread.
  std::thread writer_;
  std::FILE* file_ = nullptr;
  bool writeError_ = false;
  std::atomic<bool> finishing_{false};
  std::atomic<bool> holdWriter_{false};
};

/**
 * The one recorder for the one microphone. Touch it on a control thread
 * before capture starts (IosAudioInput's constructor does), so the audio
 * thread never constructs it.
 */
inline TakeRecorder& takeRecorder() {
  static TakeRecorder recorder;
  return recorder;
}

}  // namespace piano::capture
