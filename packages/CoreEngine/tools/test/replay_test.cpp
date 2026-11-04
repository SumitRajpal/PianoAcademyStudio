// The harness's own tests: replays are deterministic, match the scenario
// suite's driver, and the rejection log never changes a decision; WAV files
// round-trip. Run: tools/harness.sh test

#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "../common/Wav.h"
#include "../replay/Replay.h"
#include "../synth/Goldens.h"

namespace {

int g_failed = 0;
int g_passed = 0;

void check(bool ok, const char* name, const std::string& detail = "") {
  std::printf("  [%s] %-58s %s\n", ok ? "PASS" : "FAIL", name, detail.c_str());
  (ok ? g_passed : g_failed)++;
}

bool sameEvents(const std::vector<harness::ReplayEvent>& a, const std::vector<harness::ReplayEvent>& b) {
  if (a.size() != b.size()) return false;
  for (std::size_t i = 0; i < a.size(); ++i) {
    const auto &x = a[i], &y = b[i];
    if (x.hop != y.hop || x.e.type != y.e.type || x.e.midi != y.e.midi || x.e.tMs != y.e.tMs ||
        std::memcmp(&x.e.cents, &y.e.cents, sizeof(float)) != 0 ||
        std::memcmp(&x.e.velocity, &y.e.velocity, sizeof(float)) != 0) {
      return false;
    }
  }
  return true;
}

harness::GoldenTake golden(const std::string& name) {
  for (const auto& t : harness::goldenTakes())
    if (t.name == name) return t;
  return {};
}

// The scenario suite's driver (test/scenarios.cpp, runCascade), copied as it is.
std::vector<harness::ReplayEvent> scenarioDriver(const std::vector<float>& pcm) {
  constexpr int kHop = 256;
  constexpr double kHopMs = 1000.0 * kHop / 48000.0;
  auto ring = std::make_unique<piano::EngineRing>();
  auto cascade = std::make_unique<piano::Cascade>();
  std::vector<piano::NoteEvent> evs;
  std::vector<harness::ReplayEvent> out;
  int hop = 0;
  for (std::size_t off = 0; off + kHop <= pcm.size(); off += kHop) {
    ring->push(pcm.data() + off, kHop);
    cascade->processHop(*ring, evs, (hop + 1) * kHopMs);
    ring->consume(kHop);
    for (auto& e : evs) out.push_back({hop, e});
    ++hop;
  }
  return out;
}

}  // namespace

int main() {
  std::printf("== Harness ==\n");
  const auto takes = harness::goldenTakes();

  // Deterministic, equal to the scenario driver, unchanged by the rejection log.
  for (const auto& t : takes) {
    const std::vector<float> pcm = harness::renderGolden(t);
    harness::ReplayConfig config;
    config.polyphony = t.polyphony;
    for (const auto& [ms, notes] : t.expected) config.expected.push_back({ms, notes});
    const auto a = harness::replayLegacy(pcm, config);
    const auto b = harness::replayLegacy(pcm, config);
    bool sameRejections = a.rejections.size() == b.rejections.size();
    for (std::size_t i = 0; sameRejections && i < a.rejections.size(); ++i) {
      const auto &x = a.rejections[i].r, &y = b.rejections[i].r;
      sameRejections = a.rejections[i].hop == b.rejections[i].hop && x.midi == y.midi &&
                       std::strcmp(x.gate, y.gate) == 0 && std::memcmp(&x.measured, &y.measured, sizeof(float)) == 0;
    }
    check(sameEvents(a.events, b.events) && sameRejections, (t.name + ": the same events and rejections every run").c_str(),
          std::to_string(a.events.size()) + " events, " + std::to_string(a.rejections.size()) + " rejections");

    harness::ReplayConfig quiet = config;
    quiet.logRejections = false;
    check(sameEvents(a.events, harness::replayLegacy(pcm, quiet).events),
          (t.name + ": the rejection log changes no decision").c_str());

    if (!t.polyphony && t.expected.empty()) {
      check(sameEvents(a.events, scenarioDriver(pcm)), (t.name + ": the same events as the scenario driver").c_str());
    }
  }

  // A clean scale is heard note by note, each within 100 ms of its strike.
  {
    const auto t = golden("scale");
    const auto r = harness::replayLegacy(harness::renderGolden(t), {});
    int heard = 0;
    for (const auto& s : t.strikes) {
      for (const auto& e : r.events) {
        if (e.e.type == piano::NoteEvent::NoteOn && e.e.midi == s.midi && e.e.tMs / 1000.0 >= s.t - 0.01 &&
            e.e.tMs / 1000.0 <= s.t + 0.1) {
          ++heard;
          break;
        }
      }
    }
    check(heard == static_cast<int>(t.strikes.size()), "the scale's notes are each heard within 100 ms",
          std::to_string(heard) + " of " + std::to_string(t.strikes.size()));
  }

  // WAV: float32 round-trips exactly; 16-bit PCM reads back to within one step.
  {
    const auto dir = std::filesystem::temp_directory_path() / "harness-wav-test";
    std::filesystem::create_directories(dir);
    std::vector<float> x = {0.0f, 0.5f, -0.25f, 0.999f, -1.0f, 1e-6f};
    const auto f32 = (dir / "f32.wav").string();
    harness::writeWav(f32, x, 48000);
    const auto a = harness::readWav(f32);
    check(a.sampleRate == 48000 && a.samples == x, "float32 WAV round-trips exactly");

    const auto i16 = (dir / "i16.wav").string();
    {
      std::FILE* f = std::fopen(i16.c_str(), "wb");
      const int16_t pcm[] = {0, 16384, -8192, 32767, -32768, 0, 100, -100};  // stereo: 4 frames
      auto put16 = [&](uint16_t v) { std::fwrite(&v, 2, 1, f); };
      auto put32 = [&](uint32_t v) { std::fwrite(&v, 4, 1, f); };
      std::fwrite("RIFF", 1, 4, f);
      put32(36 + sizeof pcm);
      std::fwrite("WAVEfmt ", 1, 8, f);
      put32(16);
      put16(1);
      put16(2);
      put32(44100);
      put32(44100 * 4);
      put16(4);
      put16(16);
      std::fwrite("data", 1, 4, f);
      put32(sizeof pcm);
      std::fwrite(pcm, 1, sizeof pcm, f);
      std::fclose(f);
    }
    const auto b = harness::readWav(i16);
    // Frames (0, 16384), (-8192, 32767), (-32768, 0), (100, -100), averaged.
    const bool ok = b.sampleRate == 44100 && b.channels == 2 && b.samples.size() == 4 &&
                    std::fabs(b.samples[0] - 0.25f) < 1e-4f &&
                    std::fabs(b.samples[1] - 0.5f * (-0.25f + 32767.0f / 32768.0f)) < 1e-4f &&
                    std::fabs(b.samples[2] - (-0.5f)) < 1e-4f && std::fabs(b.samples[3]) < 1e-4f;
    check(ok, "16-bit stereo WAV reads as mono, to within one step");
  }

  std::printf("\n%d passed, %d failed\n", g_passed, g_failed);
  return g_failed == 0 ? 0 : 1;
}
