#pragma once

#include <array>
#include <atomic>
#include <bitset>
#include <cstddef>
#include <cstdint>

#include "Cascade.h"

namespace piano {

/**
 * The live note state the analysis thread publishes for every other thread.
 *
 *  - LiveKeys: one slot per MIDI note (0-127) holding what that key is doing
 *    now. Any thread reads any key in O(1), and skips all work while the
 *    version has not moved.
 *  - NoteEventRing: the events themselves, in order, for readers that need
 *    every one of them (the JS listeners, scoring).
 *
 * One writer (the analysis thread; the JS thread while the engine is stopped)
 * and any number of readers on any threads. Nobody ever waits: no locks, no
 * allocation, no system calls. The writer never waits for a reader (the ring
 * overwrites its oldest event), and a reader that catches a slot mid-update
 * retries a few times, then reports it busy instead of waiting.
 *
 * Slots and cells are seqlocks whose fields are all atomics, so no read is
 * ever torn and ThreadSanitizer has nothing to flag.
 */

/** One key, as the analysis thread last left it. */
struct LiveKey {
  bool down{false};
  float velocity{0.0f};   // of the last strike; kept after the release
  float cents{0.0f};      // of the last strike
  double tMs{0.0};        // stream time of the last change (strike or release)
  uint32_t strikes{0};    // note-ons so far: a new value means "struck again"
  uint64_t changedAt{0};  // version of the last change
  uint64_t struckAt{0};   // version of the last strike
};

class LiveKeys {
public:
  static constexpr int kKeys = 128;
  static constexpr int kReadTries = 8;

  /** A key that changed: its state now, and whether it was struck among those changes. */
  struct Change {
    int midi;
    bool down;
    float velocity;
    bool struck;
  };
  using Changes = std::array<Change, kKeys>;

  // ---- writer ---------------------------------------------------------------

  /** Applies `e` as change number `version`, which must exceed every earlier one. O(1). */
  void apply(const NoteEvent& e, uint64_t version) noexcept {
    if (e.midi < 0 || e.midi >= kKeys) return;
    Slot& s = slots_[static_cast<std::size_t>(e.midi)];
    const uint32_t seq = s.seq.load(std::memory_order_relaxed);
    s.seq.store(seq + 1, std::memory_order_relaxed);  // odd: being written
    std::atomic_thread_fence(std::memory_order_release);
    const bool on = e.type == NoteEvent::NoteOn;
    s.down.store(on, std::memory_order_relaxed);
    if (on) {
      s.velocity.store(e.velocity, std::memory_order_relaxed);
      s.cents.store(e.cents, std::memory_order_relaxed);
      s.strikes.store(s.strikes.load(std::memory_order_relaxed) + 1, std::memory_order_relaxed);
      s.struckAt.store(version, std::memory_order_relaxed);
    }
    s.tMs.store(e.tMs, std::memory_order_relaxed);
    s.changedAt.store(version, std::memory_order_relaxed);
    s.seq.store(seq + 2, std::memory_order_release);  // even: complete
    version_.store(version, std::memory_order_release);
  }

  // ---- readers (any thread) ---------------------------------------------------

  /** Changes so far. Unchanged since the last look: nothing to do. */
  uint64_t version() const noexcept { return version_.load(std::memory_order_acquire); }

  /** Whether a key is down. One atomic load: never busy. */
  bool isDown(int midi) const noexcept {
    return midi >= 0 && midi < kKeys && slots_[static_cast<std::size_t>(midi)].down.load(std::memory_order_acquire);
  }

  /**
   * Every field of one key, consistent with each other. False when the key
   * was being written on every try (the writer was preempted mid-update):
   * read it again later. Keys outside MIDI read as up.
   */
  bool read(int midi, LiveKey& out) const noexcept {
    if (midi < 0 || midi >= kKeys) {
      out = LiveKey{};
      return true;
    }
    const Slot& s = slots_[static_cast<std::size_t>(midi)];
    for (int i = 0; i < kReadTries; ++i) {
      const uint32_t before = s.seq.load(std::memory_order_acquire);
      if (before & 1u) continue;
      LiveKey k;
      k.down = s.down.load(std::memory_order_relaxed);
      k.velocity = s.velocity.load(std::memory_order_relaxed);
      k.cents = s.cents.load(std::memory_order_relaxed);
      k.tMs = s.tMs.load(std::memory_order_relaxed);
      k.strikes = s.strikes.load(std::memory_order_relaxed);
      k.changedAt = s.changedAt.load(std::memory_order_relaxed);
      k.struckAt = s.struckAt.load(std::memory_order_relaxed);
      std::atomic_thread_fence(std::memory_order_acquire);
      if (s.seq.load(std::memory_order_relaxed) == before) {
        out = k;
        return true;
      }
    }
    return false;
  }

  /**
   * The keys changed after version `since` into `out`, lowest first, and in
   * `version` the version to pass next time. A key struck and released in
   * between comes back up with struck = true. `since` < 0: every key that is
   * down now (struck = false). Returns how many, or -1 when a key was
   * mid-update: ask again later. O(128) atomic reads, no allocation.
   *
   * At least once: a key that changes while this runs may come back again
   * next time, in the same state. Applying a change twice changes nothing.
   */
  int changesSince(int64_t since, uint64_t& version, Changes& out) const noexcept {
    const bool snapshot = since < 0;
    const uint64_t after = snapshot ? 0 : static_cast<uint64_t>(since);
    version = this->version();  // before the scan: later changes come back next time
    int n = 0;
    for (int m = 0; m < kKeys; ++m) {
      LiveKey k;
      if (!read(m, k)) return -1;
      if (snapshot ? !k.down : k.changedAt <= after) continue;
      out[static_cast<std::size_t>(n++)] = {m, k.down, k.velocity, !snapshot && k.struckAt > after};
    }
    return n;
  }

private:
  struct Slot {
    std::atomic<uint32_t> seq{0};
    std::atomic<bool> down{false};
    std::atomic<float> velocity{0.0f};
    std::atomic<float> cents{0.0f};
    std::atomic<double> tMs{0.0};
    std::atomic<uint32_t> strikes{0};
    std::atomic<uint64_t> changedAt{0};
    std::atomic<uint64_t> struckAt{0};
  };

  std::array<Slot, kKeys> slots_{};
  std::atomic<uint64_t> version_{0};
};

/**
 * Note events in order, numbered from 0. Holds the last `Capacity`; the
 * writer overwrites the oldest and never waits. Each reader keeps its own
 * position, so any number of readers follow it independently, each in O(1)
 * per event.
 */
template <std::size_t Capacity>
class NoteEventRing {
  static_assert(Capacity > 0 && (Capacity & (Capacity - 1)) == 0, "Capacity must be a power of two");

public:
  enum class Read : uint8_t { Ok, NotYet, Lost };

  /** Writer. The event gets number head(). O(1). */
  void push(const NoteEvent& e) noexcept {
    const uint64_t n = head_.load(std::memory_order_relaxed);  // only the writer changes it
    Cell& c = cells_[static_cast<std::size_t>(n & (Capacity - 1))];
    c.seq.store(2 * n + 1, std::memory_order_relaxed);  // odd: being written
    std::atomic_thread_fence(std::memory_order_release);
    c.on.store(e.type == NoteEvent::NoteOn, std::memory_order_relaxed);
    c.midi.store(e.midi, std::memory_order_relaxed);
    c.cents.store(e.cents, std::memory_order_relaxed);
    c.velocity.store(e.velocity, std::memory_order_relaxed);
    c.tMs.store(e.tMs, std::memory_order_relaxed);
    c.seq.store(2 * n + 2, std::memory_order_release);  // holds event n
    head_.store(n + 1, std::memory_order_release);
  }

  /** The number the next event will get: events below it exist (the last Capacity are kept). */
  uint64_t head() const noexcept { return head_.load(std::memory_order_acquire); }

  /** Event `n`: Ok, NotYet (not written yet) or Lost (overwritten by a newer one). */
  Read read(uint64_t n, NoteEvent& out) const noexcept {
    const Cell& c = cells_[static_cast<std::size_t>(n & (Capacity - 1))];
    const uint64_t want = 2 * n + 2;
    const uint64_t before = c.seq.load(std::memory_order_acquire);
    if (before < want) return Read::NotYet;
    if (before > want) return Read::Lost;
    NoteEvent e{};
    e.type = c.on.load(std::memory_order_relaxed) ? NoteEvent::NoteOn : NoteEvent::NoteOff;
    e.midi = c.midi.load(std::memory_order_relaxed);
    e.cents = c.cents.load(std::memory_order_relaxed);
    e.velocity = c.velocity.load(std::memory_order_relaxed);
    e.tMs = c.tMs.load(std::memory_order_relaxed);
    std::atomic_thread_fence(std::memory_order_acquire);
    if (c.seq.load(std::memory_order_relaxed) != want) return Read::Lost;
    out = e;
    return Read::Ok;
  }

private:
  struct Cell {
    std::atomic<uint64_t> seq{0};
    std::atomic<bool> on{false};
    std::atomic<int> midi{0};
    std::atomic<float> cents{0.0f};
    std::atomic<float> velocity{0.0f};
    std::atomic<double> tMs{0.0};
  };

  std::array<Cell, Capacity> cells_{};
  std::atomic<uint64_t> head_{0};
};

/**
 * The keys and the events together. Every change goes through publish(), so
 * event number n is key change (version) n + 1: a reader that has taken every
 * event below n knows which keys it is up to date on (changedAt <= n).
 */
class LiveNotes {
public:
  static constexpr std::size_t kRingCapacity = 256;
  using Ring = NoteEventRing<kRingCapacity>;

  /** Writer. The key first, then the event: see NoteEventReader::sync. */
  void publish(const NoteEvent& e) noexcept {
    keys_.apply(e, events_.head() + 1);
    events_.push(e);
  }

  /** Writer. Releases every key that is down, at stream time `tMs`. Returns how many. */
  int releaseAll(double tMs) noexcept {
    int released = 0;
    for (int m = 0; m < LiveKeys::kKeys; ++m) {
      if (!keys_.isDown(m)) continue;
      NoteEvent off{};
      off.type = NoteEvent::NoteOff;
      off.midi = m;
      off.tMs = tMs;
      publish(off);
      ++released;
    }
    return released;
  }

  const LiveKeys& keys() const noexcept { return keys_; }
  const Ring& events() const noexcept { return events_; }

private:
  LiveKeys keys_;
  Ring events_;
};

/**
 * Follows a LiveNotes from one thread and delivers every event, in order,
 * exactly once. If its thread stalls so long that the ring laps it, the
 * events it missed are gone: it then delivers the difference between what it
 * has delivered and the keys as they are, so its consumer ends up exactly in
 * step anyway. It starts the same way, so a consumer that subscribes while
 * keys are held hears about them.
 */
class NoteEventReader {
public:
  explicit NoteEventReader(const LiveNotes& live) noexcept : cursor_(live.events().head()) {}

  /** Delivers what is new. Returns how many events it delivered. */
  template <class Deliver>
  std::size_t drain(const LiveNotes& live, Deliver&& deliver) {
    std::size_t count = 0;
    const uint64_t head = live.events().head();
    if (head - cursor_ > LiveNotes::kRingCapacity) {
      cursor_ = head - LiveNotes::kRingCapacity;
      needsSync_ = true;
    }
    NoteEvent e{};
    while (cursor_ < head) {
      const LiveNotes::Ring::Read r = live.events().read(cursor_, e);
      if (r == LiveNotes::Ring::Read::NotYet) break;
      ++cursor_;
      if (r == LiveNotes::Ring::Read::Lost) {
        needsSync_ = true;
        continue;
      }
      delivered_[static_cast<std::size_t>(e.midi & 127)] = e.type == NoteEvent::NoteOn;
      deliver(e);
      ++count;
    }
    if (needsSync_) count += sync(live, deliver);
    return count;
  }

  uint64_t cursor() const noexcept { return cursor_; }

private:
  // Keys whose last change is behind the cursor are settled: their events
  // were delivered or lost. Where what was delivered differs from the key, a
  // note-on or note-off puts it right. A key changed later (or being changed
  // now) still has its event coming, so it is left alone.
  template <class Deliver>
  std::size_t sync(const LiveNotes& live, Deliver& deliver) {
    needsSync_ = false;
    std::size_t count = 0;
    for (int m = 0; m < LiveKeys::kKeys; ++m) {
      LiveKey k;
      if (!live.keys().read(m, k) || k.changedAt > cursor_) continue;
      if (k.down == delivered_[static_cast<std::size_t>(m)]) continue;
      NoteEvent e{};
      e.type = k.down ? NoteEvent::NoteOn : NoteEvent::NoteOff;
      e.midi = m;
      e.cents = k.down ? k.cents : 0.0f;
      e.velocity = k.down ? k.velocity : 0.0f;
      e.tMs = k.tMs;
      delivered_[static_cast<std::size_t>(m)] = k.down;
      deliver(e);
      ++count;
    }
    return count;
  }

  uint64_t cursor_;
  bool needsSync_{true};
  std::bitset<LiveKeys::kKeys> delivered_;
};

} // namespace piano
