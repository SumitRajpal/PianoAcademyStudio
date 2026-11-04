// The harness's own C++ tests: the synthetic golden takes render the same
// samples every time and match their labels, and WAV files round-trip.
// Run: tools/harness.sh test

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <string>
#include <vector>

#include "../common/Wav.h"
#include "../synth/Goldens.h"

namespace {

int g_failed = 0;
int g_passed = 0;

void check(bool ok, const std::string& name, const std::string& detail = "") {
  std::printf("  [%s] %-58s %s\n", ok ? "PASS" : "FAIL", name.c_str(), detail.c_str());
  (ok ? g_passed : g_failed)++;
}

}  // namespace

int main() {
  std::printf("Harness tests\n");

  // Every golden take: deterministic, labels inside the take, no clipping.
  int pianoTakes = 0;
  for (const auto& t : harness::goldenTakes()) {
    const auto a = harness::renderGolden(t);
    const auto b = harness::renderGolden(t);
    check(a == b, t.name + ": the same samples every render");

    bool inside = true;
    for (const auto& s : t.strikes) inside = inside && s.t >= 0.0 && s.t < s.release && s.release <= t.durationSec;
    check(inside, t.name + ": every labelled note lies inside the take");

    float peak = 0.0f;
    for (float x : a) peak = std::max(peak, std::fabs(x));
    // Below master 6.5's clip flag (0.985), as a phone that isn't overloaded records it.
    check(peak > 0.0f && peak < 0.985f, t.name + ": audible and never clipped", "peak " + std::to_string(peak));

    if (!t.strikes.empty()) ++pianoTakes;
  }
  check(pianoTakes == static_cast<int>(harness::goldenTakes().size()) - 1, "every take but the noise take has notes");

  // The noise take: no piano, so no labels.
  // The lesson take: one expected note per strike, from 150 ms before it.
  for (const auto& t : harness::goldenTakes()) {
    if (t.name == "noise") check(t.strikes.empty(), "noise: no labelled notes");
    if (t.name == "lesson") {
      bool ok = t.expected.size() == t.strikes.size();
      for (std::size_t i = 0; ok && i < t.strikes.size(); ++i) {
        const auto& [ms, keys] = t.expected[i];
        ok = keys.size() == 1 && keys[0] == t.strikes[i].midi && std::fabs(ms - 1000.0 * (t.strikes[i].t - 0.15)) < 1e-6;
      }
      check(ok, "lesson: each note expected from 150 ms before its strike");
    }
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
