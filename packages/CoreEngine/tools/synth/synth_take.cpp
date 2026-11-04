// Renders the synthetic golden takes as take folders: audio.wav, labels.json,
// meta.json, and expected.txt and replay.args where a take needs them.
//
//   synth_take <out-folder> [take-name ...]     (no names: every golden take)

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <set>
#include <string>

#include "../common/Wav.h"
#include "Goldens.h"

namespace fs = std::filesystem;

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: synth_take <out-folder> [take-name ...]\n");
    return 2;
  }
  const fs::path out = argv[1];
  std::set<std::string> wanted;
  for (int i = 2; i < argc; ++i) wanted.insert(argv[i]);
  int written = 0;
  for (const auto& t : harness::goldenTakes()) {
    if (!wanted.empty() && wanted.count(t.name) == 0) continue;
    const fs::path dir = out / t.name;
    fs::create_directories(dir);
    harness::writeWav((dir / "audio.wav").string(), harness::renderGolden(t), synth::kSampleRate);

    std::ofstream labels(dir / "labels.json");
    labels << "{\n  \"version\": 1,\n  \"source\": \"synth\",\n  \"notes\": [";
    for (std::size_t i = 0; i < t.strikes.size(); ++i) {
      const auto& s = t.strikes[i];
      char line[200];
      std::snprintf(line, sizeof line,
                    "%s\n    {\"midi\": %d, \"onset\": %.6f, \"offset\": %.6f, \"velocity\": %d, \"releaseObservable\": true}",
                    i ? "," : "", s.midi, s.t, s.release, harness::velocityFor(s.level));
      labels << line;
    }
    labels << "\n  ]\n}\n";

    std::ofstream meta(dir / "meta.json");
    meta << "{\n  \"take\": \"" << t.name << "\",\n  \"description\": \"" << t.description << "\",\n"
         << "  \"instrument\": \"synth\",\n  \"background\": \"" << t.background << "\",\n"
         << "  \"durationSec\": " << t.durationSec << ",\n"
         << "  \"synth\": {\"seed\": " << t.seed << ", \"noiseDbfs\": -65, \"phoneMic\": true}\n}\n";

    if (!t.expected.empty()) {
      std::ofstream exp(dir / "expected.txt");
      exp << "# ms, then the MIDI numbers expected from then on\n";
      for (const auto& [ms, notes] : t.expected) {
        exp << ms;
        for (int m : notes) exp << ' ' << m;
        exp << '\n';
      }
    }
    if (t.polyphony) std::ofstream(dir / "replay.args") << "--polyphony\n";
    ++written;
  }
  std::printf("%d takes in %s\n", written, out.string().c_str());
  return written > 0 ? 0 : 1;
}
