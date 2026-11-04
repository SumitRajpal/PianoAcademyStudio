#pragma once

// Replays audio through the v1.2 cascade exactly as the phone's analysis loop
// runs it (Engine::workerLoop) and as the scenario suite drives it: one hop
// pushed, one hop processed, stream time (hop + 1) x 5.33 ms. The phone drops
// hops only after a stall; a replay never does, so it is deterministic.

#include <chrono>
#include <cstddef>
#include <memory>
#include <vector>

#include "../../cpp/legacy/Cascade.h"
#include "../../cpp/legacy/PianoProfile.h"
#include "../../cpp/legacy/SampleRing.h"

namespace harness {

constexpr int kHop = 256;

/** From `tMs` on, the lesson expects `notes` (MIDI numbers; empty: free play). */
struct ExpectedChange {
  double tMs{0.0};
  std::vector<int> notes;
};

struct ReplayConfig {
  bool polyphony{false};
  bool haveProfile{false};
  piano::PianoProfile profile = piano::PianoProfile::defaults();
  std::vector<ExpectedChange> expected;  // in time order
  bool logRejections{true};
};

struct ReplayEvent {
  int hop;
  piano::NoteEvent e;
};

struct ReplayRejection {
  int hop;
  piano::Rejection r;
};

struct ReplayResult {
  std::vector<ReplayEvent> events;
  std::vector<ReplayRejection> rejections;
  std::vector<double> hopUs;  // compute time per hop, for a sanity check only
  int hops{0};
};

namespace replay_detail {

class Collector : public piano::RejectionObserver {
public:
  explicit Collector(std::vector<ReplayRejection>& out) : out_(out) {}
  void reject(const piano::Rejection& r) noexcept override { out_.push_back({hop, r}); }
  int hop{0};

private:
  std::vector<ReplayRejection>& out_;
};

}  // namespace replay_detail

/** v1.2 ("legacy"): the cascade the app runs today. Audio must be 48 kHz mono. */
inline ReplayResult replayLegacy(const std::vector<float>& pcm, const ReplayConfig& config) {
  using Clock = std::chrono::steady_clock;
  constexpr double kHopMs = 1000.0 * kHop / 48000.0;
  ReplayResult result;
  auto cascade = std::make_unique<piano::Cascade>();
  if (config.haveProfile) cascade->setProfile(config.profile);
  cascade->setPolyphony(config.polyphony);
  replay_detail::Collector collector(result.rejections);
  if (config.logRejections) cascade->setRejectionObserver(&collector);
  auto ring = std::make_unique<piano::EngineRing>();
  std::vector<piano::NoteEvent> evs;
  evs.reserve(64);
  std::size_t nextChange = 0;
  int hop = 0;
  for (std::size_t off = 0; off + kHop <= pcm.size(); off += kHop) {
    // Commands take effect at the start of a hop, as on the phone.
    while (nextChange < config.expected.size() && config.expected[nextChange].tMs <= hop * kHopMs) {
      cascade->setExpectedNotes(config.expected[nextChange++].notes);
    }
    ring->push(pcm.data() + off, kHop);
    collector.hop = hop;
    const auto t0 = Clock::now();
    cascade->processHop(*ring, evs, (hop + 1) * kHopMs);
    result.hopUs.push_back(std::chrono::duration<double, std::micro>(Clock::now() - t0).count());
    ring->consume(kHop);
    for (const auto& e : evs) result.events.push_back({hop, e});
    ++hop;
  }
  result.hops = hop;
  return result;
}

}  // namespace harness
