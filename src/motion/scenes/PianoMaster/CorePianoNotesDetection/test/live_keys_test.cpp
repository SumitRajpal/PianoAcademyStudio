// Live keys test: the key table and the event ring (shared/LiveKeys.h).
// First the rules on one thread, then real concurrency: one writer publishes
// a long, fast stream of notes while readers on other threads read keys,
// follow changes and drain events, one of them so slowly that the ring laps
// it. Build it with -fsanitize=thread (./run.sh engine) to prove that no read
// is ever torn and nothing races.

#include <array>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <random>
#include <string>
#include <thread>
#include <vector>

#include "../shared/LiveKeys.h"

using namespace piano;

namespace {

int g_failed = 0;

void check(bool ok, const char* name, const std::string& detail) {
  std::printf("  [%s] %-58s %s\n", ok ? "PASS" : "FAIL", name, detail.c_str());
  if (!ok) ++g_failed;
}

NoteEvent noteOn(int midi, float velocity, float cents, double tMs) {
  NoteEvent e{};
  e.type = NoteEvent::NoteOn;
  e.midi = midi;
  e.velocity = velocity;
  e.cents = cents;
  e.tMs = tMs;
  return e;
}

NoteEvent noteOff(int midi, double tMs) {
  NoteEvent e{};
  e.type = NoteEvent::NoteOff;
  e.midi = midi;
  e.tMs = tMs;
  return e;
}

// A strike's velocity and cents encode its key and strike number, so a reader
// can tell a torn read (fields from two different strikes) from a real one.
float velocityFor(int midi, uint32_t strike) {
  return static_cast<float>((midi * 7 + static_cast<int>(strike)) % 97 + 1) / 100.0f;
}
float centsFor(int midi, uint32_t strike) {
  return static_cast<float>((midi * 13 + static_cast<int>(strike) * 5) % 81 - 40);
}

using KeyStates = std::array<bool, LiveKeys::kKeys>;

KeyStates tableState(const LiveNotes& live) {
  KeyStates s{};
  for (int m = 0; m < LiveKeys::kKeys; ++m) s[static_cast<std::size_t>(m)] = live.keys().isDown(m);
  return s;
}

std::string countDiffs(const KeyStates& a, const KeyStates& b) {
  int diffs = 0;
  for (std::size_t m = 0; m < a.size(); ++m) diffs += a[m] != b[m];
  return std::to_string(diffs) + " keys differ";
}

void rules() {
  std::printf("-- rules --\n");
  LiveNotes live;
  live.publish(noteOn(60, 0.5f, 3.0f, 10.0));
  LiveKey k;
  const bool ok = live.keys().read(60, k);
  check(ok && k.down && k.velocity == 0.5f && k.cents == 3.0f && k.strikes == 1 && k.changedAt == 1 &&
            live.keys().version() == 1 && live.events().head() == 1,
        "a note-on is event 0 and key change (version) 1", "");

  live.publish(noteOff(60, 20.0));
  uint64_t version = 0;
  LiveKeys::Changes changes{};
  int n = live.keys().changesSince(0, version, changes);
  check(n == 1 && changes[0].midi == 60 && !changes[0].down && changes[0].struck && version == 2,
        "struck and released between two looks: comes back struck", "");
  n = live.keys().changesSince(2, version, changes);
  check(n == 0 && version == 2, "nothing new since the last look: nothing", "");
  live.publish(noteOn(64, 0.7f, -2.0f, 30.0));
  n = live.keys().changesSince(-1, version, changes);
  check(n == 1 && changes[0].midi == 64 && changes[0].down && !changes[0].struck,
        "first look (since < 0): every key down, none flagged struck", "");
  check(live.keys().isDown(64) && !live.keys().isDown(60) && !live.keys().isDown(-1) && !live.keys().isDown(128),
        "isDown, and keys outside MIDI read as up", "");

  // A reader starts at the end, hears about held keys, then every event once.
  NoteEventReader reader(live);
  std::vector<NoteEvent> got;
  auto collect = [&](const NoteEvent& e) { got.push_back(e); };
  reader.drain(live, collect);
  check(got.size() == 1 && got[0].midi == 64 && got[0].type == NoteEvent::NoteOn && got[0].velocity == 0.7f,
        "a new reader hears about keys already held", "");
  got.clear();
  live.publish(noteOff(64, 40.0));
  live.publish(noteOn(67, 0.2f, 1.0f, 50.0));
  live.publish(noteOff(67, 60.0));
  live.publish(noteOn(67, 0.9f, 1.5f, 70.0));  // struck again
  reader.drain(live, collect);
  check(got.size() == 4 && got[0].midi == 64 && got[1].midi == 67 && got[3].velocity == 0.9f &&
            got[1].tMs < got[2].tMs && got[2].tMs < got[3].tMs,
        "then every event, in order", std::to_string(got.size()) + " events");
  got.clear();
  reader.drain(live, collect);
  check(got.empty(), "and none twice", "");

  // Lapped: far more events than the ring holds while the reader is away.
  KeyStates consumer{};
  consumer[67] = true;
  for (int i = 0; i < 1000; ++i) {
    const int m = 40 + i % 30;
    live.publish(live.keys().isDown(m) ? noteOff(m, 100.0 + i) : noteOn(m, 0.5f, 0.0f, 100.0 + i));
  }
  live.publish(noteOff(67, 2000.0));
  std::size_t delivered = 0;
  reader.drain(live, [&](const NoteEvent& e) {
    consumer[static_cast<std::size_t>(e.midi)] = e.type == NoteEvent::NoteOn;
    ++delivered;
  });
  check(consumer == tableState(live) && delivered < 1001,
        "a lapped reader still ends exactly in step", std::to_string(delivered) + " delivered of 1001");

  live.publish(noteOn(21, 0.4f, 0.0f, 3000.0));
  const int released = live.releaseAll(3010.0);
  bool anyDown = false;
  for (int m = 0; m < LiveKeys::kKeys; ++m) anyDown |= live.keys().isDown(m);
  check(released >= 1 && !anyDown, "releaseAll lets every key up", std::to_string(released) + " released");
}

void concurrency() {
  std::printf("-- concurrency: 1 writer, 4 readers --\n");
  LiveNotes live;
#if defined(__SANITIZE_THREAD__) || (defined(__has_feature) && __has_feature(thread_sanitizer))
  constexpr int kEvents = 200000;
#else
  constexpr int kEvents = 2000000;
#endif
  std::atomic<bool> done{false};

  std::thread writer([&] {
    std::mt19937 rng(7);
    std::array<uint32_t, LiveKeys::kKeys> strikes{};
    for (int i = 0; i < kEvents; ++i) {
      const int m = 21 + static_cast<int>(rng() % 88);
      const auto slot = static_cast<std::size_t>(m);
      if (live.keys().isDown(m)) {
        live.publish(noteOff(m, i));
      } else {
        const uint32_t s = ++strikes[slot];
        live.publish(noteOn(m, velocityFor(m, s), centsFor(m, s), i));
      }
    }
    done.store(true, std::memory_order_release);
  });

  // Reads whole keys at random: never a mix of two strikes.
  std::atomic<long> torn{0};
  std::atomic<long> busy{0};
  std::atomic<long> reads{0};
  std::thread keyReader([&] {
    std::mt19937 rng(11);
    while (!done.load(std::memory_order_acquire)) {
      const int m = 21 + static_cast<int>(rng() % 88);
      LiveKey k;
      if (!live.keys().read(m, k)) {
        ++busy;
        continue;
      }
      ++reads;
      if (k.strikes > 0 && (k.velocity != velocityFor(m, k.strikes) || k.cents != centsFor(m, k.strikes))) ++torn;
    }
  });

  // Follows changes like the UI-thread pump: state only, at least once.
  KeyStates follower{};
  long looks = 0;
  std::thread changeReader([&] {
    int64_t seen = -1;
    LiveKeys::Changes changes{};
    auto look = [&] {
      uint64_t version = 0;
      const int n = live.keys().changesSince(seen, version, changes);
      if (n < 0) return;
      for (int i = 0; i < n; ++i) follower[static_cast<std::size_t>(changes[static_cast<std::size_t>(i)].midi)] =
          changes[static_cast<std::size_t>(i)].down;
      seen = static_cast<int64_t>(version);
      ++looks;
    };
    while (!done.load(std::memory_order_acquire)) look();
    look();
  });

  // Drain events like the JS thread: one fast, one so slow it gets lapped.
  auto drainer = [&](KeyStates& state, std::size_t& delivered, std::chrono::microseconds pause) {
    NoteEventReader reader(live);
    auto apply = [&](const NoteEvent& e) {
      state[static_cast<std::size_t>(e.midi)] = e.type == NoteEvent::NoteOn;
      ++delivered;
    };
    while (!done.load(std::memory_order_acquire)) {
      reader.drain(live, apply);
      if (pause.count() > 0) std::this_thread::sleep_for(pause);
    }
    reader.drain(live, apply);
  };
  KeyStates fast{};
  KeyStates slow{};
  std::size_t fastCount = 0;
  std::size_t slowCount = 0;
  std::thread fastReader([&] { drainer(fast, fastCount, std::chrono::microseconds(0)); });
  std::thread slowReader([&] { drainer(slow, slowCount, std::chrono::microseconds(2000)); });

  writer.join();
  keyReader.join();
  changeReader.join();
  fastReader.join();
  slowReader.join();

  const KeyStates truth = tableState(live);
  check(torn.load() == 0, "no torn key reads",
        std::to_string(reads.load()) + " reads, " + std::to_string(busy.load()) + " busy, " +
            std::to_string(torn.load()) + " torn");
  check(follower == truth, "change follower ends in step", countDiffs(follower, truth) + ", " +
                                                               std::to_string(looks) + " looks");
  check(fast == truth, "fast event reader ends in step",
        countDiffs(fast, truth) + ", " + std::to_string(fastCount) + " delivered");
  check(slow == truth && slowCount < static_cast<std::size_t>(kEvents), "lapped event reader ends in step",
        countDiffs(slow, truth) + ", " + std::to_string(slowCount) + " of " + std::to_string(kEvents) +
            " delivered");
  check(live.events().head() == static_cast<uint64_t>(kEvents) && live.keys().version() == static_cast<uint64_t>(kEvents),
        "every event published, version == events", "");
}

}  // namespace

int main() {
  std::printf("== Live keys ==\n");
  rules();
  concurrency();
  std::printf("%s\n", g_failed == 0 ? "live keys: all passed" : "live keys: FAILED");
  return g_failed == 0 ? 0 : 1;
}
