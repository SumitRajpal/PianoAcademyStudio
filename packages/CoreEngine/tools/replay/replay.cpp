// The harness runner (master 5.6): replays a take through an engine and writes
// its events, its rejection log and a run summary.
//
//   replay <take-folder | audio.wav> --out <run-folder> [--engine legacy]
//          [--polyphony] [--profile profile.json] [--expected expected.txt]
//          [--no-rejections]
//
// A take folder holds audio.wav (48 kHz). expected.txt has one line per change:
// a time in ms, then the MIDI numbers expected from then on (none: free play).
// A take folder's own expected.txt is used unless --expected names another.

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "../common/Wav.h"
#include "Replay.h"

namespace fs = std::filesystem;

namespace {

int usage() {
  std::fprintf(stderr,
               "usage: replay <take-folder | audio.wav> --out <run-folder> [--engine legacy] [--polyphony]\n"
               "              [--profile profile.json] [--expected expected.txt] [--no-rejections]\n");
  return 2;
}

std::string readText(const std::string& path) {
  std::ifstream in(path);
  if (!in) throw std::runtime_error("cannot open " + path);
  std::stringstream s;
  s << in.rdbuf();
  return s.str();
}

std::vector<harness::ExpectedChange> readExpected(const std::string& path) {
  std::vector<harness::ExpectedChange> out;
  std::istringstream lines(readText(path));
  std::string line;
  while (std::getline(lines, line)) {
    if (line.empty() || line[0] == '#') continue;
    std::istringstream words(line);
    harness::ExpectedChange c;
    if (!(words >> c.tMs)) continue;
    int m;
    while (words >> m) c.notes.push_back(m);
    out.push_back(std::move(c));
  }
  std::stable_sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return a.tMs < b.tMs; });
  return out;
}

double percentile(std::vector<double> v, double p) {
  if (v.empty()) return 0.0;
  std::sort(v.begin(), v.end());
  return v[std::min(v.size() - 1, static_cast<std::size_t>(p * static_cast<double>(v.size() - 1) + 0.5))];
}

}  // namespace

int main(int argc, char** argv) {
  std::string input, outDir, engine = "legacy", profilePath, expectedPath;
  harness::ReplayConfig config;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    auto value = [&](std::string& dst) {
      if (i + 1 >= argc) throw std::runtime_error(a + " needs a value");
      dst = argv[++i];
    };
    try {
      if (a == "--out") value(outDir);
      else if (a == "--engine") value(engine);
      else if (a == "--profile") value(profilePath);
      else if (a == "--expected") value(expectedPath);
      else if (a == "--polyphony") config.polyphony = true;
      else if (a == "--no-rejections") config.logRejections = false;
      else if (a.rfind("--", 0) == 0) return usage();
      else input = a;
    } catch (const std::exception& e) {
      std::fprintf(stderr, "%s\n", e.what());
      return usage();
    }
  }
  if (input.empty() || outDir.empty()) return usage();
  if (engine != "legacy") {
    std::fprintf(stderr, "unknown engine \"%s\" (only legacy, v1.2, exists yet)\n", engine.c_str());
    return 2;
  }
  try {
    const bool isTake = fs::is_directory(input);
    const std::string wavPath = isTake ? (fs::path(input) / "audio.wav").string() : input;
    if (expectedPath.empty() && isTake && fs::exists(fs::path(input) / "expected.txt")) {
      expectedPath = (fs::path(input) / "expected.txt").string();
    }
    if (!expectedPath.empty()) config.expected = readExpected(expectedPath);
    if (!profilePath.empty()) {
      if (!piano::PianoProfile::fromJson(readText(profilePath), config.profile)) {
        throw std::runtime_error(profilePath + " is not a calibration profile");
      }
      config.haveProfile = true;
    }
    const harness::Audio audio = harness::readWav(wavPath);
    if (audio.sampleRate != 48000) {
      throw std::runtime_error(wavPath + " is " + std::to_string(audio.sampleRate) +
                               " Hz; the engine runs at 48 kHz (resampling is Phase 1's)");
    }

    const harness::ReplayResult r = harness::replayLegacy(audio.samples, config);

    fs::create_directories(outDir);
    std::FILE* ev = std::fopen((fs::path(outDir) / "events.jsonl").string().c_str(), "w");
    for (const auto& e : r.events) {
      std::fprintf(ev, "{\"type\":\"%s\",\"midi\":%d,\"t\":%.6f,\"hop\":%d,\"cents\":%.3f,\"velocity\":%.4f}\n",
                   e.e.type == piano::NoteEvent::NoteOn ? "on" : "off", e.e.midi, e.e.tMs / 1000.0, e.hop,
                   static_cast<double>(e.e.cents), static_cast<double>(e.e.velocity));
    }
    std::fclose(ev);
    std::FILE* rj = std::fopen((fs::path(outDir) / "rejections.jsonl").string().c_str(), "w");
    for (const auto& x : r.rejections) {
      std::fprintf(rj, "{\"t\":%.6f,\"hop\":%d,\"midi\":%d,\"gate\":\"%s\",\"measured\":%.4g,\"threshold\":%.4g}\n",
                   x.r.tMs / 1000.0, x.hop, x.r.midi, x.r.gate, static_cast<double>(x.r.measured),
                   static_cast<double>(x.r.threshold));
    }
    std::fclose(rj);
    double mean = 0.0;
    for (double us : r.hopUs) mean += us;
    mean = r.hopUs.empty() ? 0.0 : mean / static_cast<double>(r.hopUs.size());
    std::ofstream info(fs::path(outDir) / "run.json");
    info << "{\n  \"engine\": \"" << engine << "\",\n"
         << "  \"take\": \"" << fs::path(input).filename().string() << "\",\n"
         << "  \"durationSec\": " << static_cast<double>(audio.samples.size()) / 48000.0 << ",\n"
         << "  \"hops\": " << r.hops << ",\n"
         << "  \"polyphony\": " << (config.polyphony ? "true" : "false") << ",\n"
         << "  \"profile\": " << (config.haveProfile ? "\"" + fs::path(profilePath).filename().string() + "\"" : "null")
         << ",\n"
         << "  \"expectedChanges\": " << config.expected.size() << ",\n"
         << "  \"computeUsPerHop\": {\"mean\": " << mean << ", \"p99\": " << percentile(r.hopUs, 0.99)
         << "}\n}\n";
    std::printf("%s: %d hops, %zu events, %zu rejections\n", fs::path(input).filename().string().c_str(), r.hops,
                r.events.size(), r.rejections.size());
  } catch (const std::exception& e) {
    std::fprintf(stderr, "replay: %s\n", e.what());
    return 1;
  }
  return 0;
}
