#pragma once

#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace piano {

/**
 * Wait-free single-producer single-consumer ring buffer for PCM samples.
 *
 * The producer is the OS audio callback; the consumer is the analysis thread.
 * Acquire/release ordering, 64-byte aligned cursors (no false sharing) and a
 * power-of-two capacity (bitmask wrap).
 *
 * The consumer reads windows that reach back before its read cursor (up to
 * LookbackSamples), so the producer treats that history as still in use and
 * never overwrites it.
 *
 * v1.1: peekWindow ends at head + hop (the hop being processed), and
 * dropStaleBacklog() skips ahead after a stall so latency cannot build up.
 */
template <std::size_t CapacityPow2 = 32768, std::size_t LookbackSamples = 8192>
class SampleRing {
  static_assert((CapacityPow2 & (CapacityPow2 - 1)) == 0, "CapacityPow2 must be a power of two");
  static_assert(LookbackSamples < CapacityPow2 / 2, "lookback must leave room for new samples");
  static constexpr std::size_t kMask = CapacityPow2 - 1;

public:
  static constexpr std::size_t kCapacity = CapacityPow2;
  static constexpr std::size_t kLookback = LookbackSamples;

  SampleRing() = default;

  /** Producer only. Returns how many samples were written (the rest are dropped). */
  std::size_t push(const float* data, std::size_t count) noexcept {
    const std::size_t tail = tail_.load(std::memory_order_relaxed);
    const std::size_t head = head_.load(std::memory_order_acquire);
    const std::size_t used = (tail - head) + LookbackSamples;
    const std::size_t avail = (used < CapacityPow2) ? CapacityPow2 - used : 0;
    const std::size_t toWrite = std::min(count, avail);
    for (std::size_t i = 0; i < toWrite; ++i) {
      buffer_[(tail + i) & kMask] = data[i];
    }
    tail_.store(tail + toWrite, std::memory_order_release);
    return toWrite;
  }

  /** Consumer: samples written but not yet consumed. */
  std::size_t available() const noexcept {
    const std::size_t tail = tail_.load(std::memory_order_acquire);
    const std::size_t head = head_.load(std::memory_order_relaxed);
    return tail - head;
  }

  /**
   * Consumer: copies the windowSize samples that end at the end of the hop
   * being processed ([head + hop - windowSize, head + hop)).
   * windowSize must not exceed LookbackSamples + hopSize.
   */
  void peekWindow(float* dst, std::size_t windowSize, std::size_t hopSize = 256) const noexcept {
    const std::size_t end = head_.load(std::memory_order_relaxed) + hopSize;
    const std::size_t start = end - windowSize;
    for (std::size_t i = 0; i < windowSize; ++i) {
      dst[i] = buffer_[(start + i) & kMask];
    }
  }

  /** Consumer: advance the read cursor by one hop. */
  void consume(std::size_t hopSize) noexcept {
    const std::size_t head = head_.load(std::memory_order_relaxed);
    head_.store(head + hopSize, std::memory_order_release);
  }

  /**
   * Consumer: after a stall, skip to the newest hop so detection stays live.
   * Returns the number of samples skipped (0 when the backlog was small).
   */
  std::size_t dropStaleBacklog(std::size_t hopSize, std::size_t maxBacklogHops) noexcept {
    const std::size_t tail = tail_.load(std::memory_order_acquire);
    const std::size_t head = head_.load(std::memory_order_relaxed);
    const std::size_t backlog = tail - head;
    if (backlog <= hopSize * maxBacklogHops) return 0;
    const std::size_t keep = hopSize;
    const std::size_t skipped = (backlog - keep) / hopSize * hopSize;
    head_.store(head + skipped, std::memory_order_release);
    return skipped;
  }

  /** Total samples consumed or skipped since reset: the stream clock. */
  std::size_t readCursor() const noexcept {
    return head_.load(std::memory_order_relaxed) - LookbackSamples;
  }

  /** Only while neither side is running. */
  void reset() noexcept {
    head_.store(LookbackSamples, std::memory_order_relaxed);
    tail_.store(LookbackSamples, std::memory_order_relaxed);
    std::fill(std::begin(buffer_), std::end(buffer_), 0.0f);
  }

private:
  alignas(64) std::atomic<std::size_t> head_{LookbackSamples};
  alignas(64) std::atomic<std::size_t> tail_{LookbackSamples};
  alignas(64) float buffer_[CapacityPow2]{};
};

/** The ring every engine component shares. */
using EngineRing = SampleRing<32768, 8192>;

} // namespace piano
