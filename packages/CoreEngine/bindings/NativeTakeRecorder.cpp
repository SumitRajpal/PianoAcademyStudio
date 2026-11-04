#include "NativeTakeRecorder.h"

#if HAS_APP_SPECS_JSI

#include <algorithm>
#include <cctype>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <sstream>
#include <system_error>

namespace facebook {
namespace react {

namespace {

namespace fs = std::filesystem;

/** A take needs 11.5 MB a minute; below this, no take starts. */
constexpr double kMinFreeBytes = 500.0 * 1024 * 1024;

/**
 * Take ids are the folder names the app makes, such as
 * "2026-11-05_101530_ladder": letters, digits, '-', '_' and '.', and never
 * a path of their own.
 */
bool validId(const std::string& id) {
  if (id.empty() || id.size() > 120 || id == "." || id == "..") return false;
  return std::all_of(id.begin(), id.end(), [](char c) {
    return std::isalnum(static_cast<unsigned char>(c)) != 0 || c == '-' || c == '_' || c == '.';
  });
}

/** The open take's id. Kept outside the module, which a JS reload recreates while the recorder keeps going. */
std::string& currentTakeId() {
  static std::string id;
  return id;
}

double dbfs(float peak) { return peak > 0.0f ? 20.0 * std::log10(static_cast<double>(peak)) : -200.0; }

std::string readText(const fs::path& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return {};
  std::ostringstream text;
  text << in.rdbuf();
  return text.str();
}

}  // namespace

NativeTakeRecorder::NativeTakeRecorder(std::shared_ptr<CallInvoker> jsInvoker, piano::capture::TakePlatform platform)
    : NativeTakeRecorderCxxSpec<NativeTakeRecorder>(std::move(jsInvoker)), platform_(std::move(platform)) {
  std::error_code ec;
  fs::create_directories(platform_.takesFolder, ec);
  piano::capture::takeRecorder();  // built here, never on the audio thread
}

std::string NativeTakeRecorder::takesFolder(jsi::Runtime& /*rt*/) { return platform_.takesFolder; }

double NativeTakeRecorder::freeSpaceBytes(jsi::Runtime& /*rt*/) {
  std::error_code ec;
  const fs::space_info space = fs::space(platform_.takesFolder, ec);
  return ec ? 0.0 : static_cast<double>(space.available);
}

NativeTakeRecorderTakeDeviceCxx NativeTakeRecorder::device(jsi::Runtime& /*rt*/) {
  const piano::capture::TakeDeviceInfo d = platform_.device ? platform_.device() : piano::capture::TakeDeviceInfo{};
  return {d.model,
          d.systemVersion,
          d.inputPort,
          d.inputPortType,
          d.inputDataSource,
          d.hardwareSampleRate,
          d.ioBufferMs,
          d.inputLatencyMs};
}

bool NativeTakeRecorder::startTake(jsi::Runtime& rt, std::string id) {
  auto& recorder = piano::capture::takeRecorder();
  if (!validId(id) || recorder.status().recording || freeSpaceBytes(rt) < kMinFreeBytes) return false;
  const fs::path dir = fs::path(platform_.takesFolder) / id;
  std::error_code ec;
  if (fs::exists(dir, ec)) return false;  // never overwrite a take
  fs::create_directories(dir, ec);
  if (ec) return false;
  if (!recorder.start((dir / "audio.wav").string())) {
    fs::remove_all(dir, ec);
    return false;
  }
  currentTakeId() = id;
  if (platform_.keepScreenAwake) platform_.keepScreenAwake(true);
  return true;
}

NativeTakeRecorderTakeStatsCxx NativeTakeRecorder::stopTake(jsi::Runtime& /*rt*/) {
  const piano::capture::TakeStats stats = piano::capture::takeRecorder().stop();
  if (platform_.keepScreenAwake) platform_.keepScreenAwake(false);
  NativeTakeRecorderTakeStatsCxx out{};
  out.id = currentTakeId();
  out.samples = static_cast<double>(stats.samples);
  out.durationSec = static_cast<double>(stats.samples) / piano::capture::TakeRecorder::kSampleRate;
  out.peakDbfs = dbfs(stats.peak);
  out.clippedSamples = static_cast<double>(stats.clippedSamples);
  out.droppedSamples = static_cast<double>(stats.droppedSamples);
  for (const auto& gap : stats.gaps) {
    out.gapPositions.push_back(static_cast<double>(gap.position));
    out.gapLengths.push_back(static_cast<double>(gap.length));
  }
  out.stopReason = piano::capture::stopReasonName(stats.stopReason);
  currentTakeId().clear();
  return out;
}

NativeTakeRecorderTakeStatusCxx NativeTakeRecorder::getTakeStatus(jsi::Runtime& /*rt*/) {
  const piano::capture::TakeStatus s = piano::capture::takeRecorder().status();
  return {s.recording,
          s.capturing,
          s.recording ? currentTakeId() : std::string{},
          static_cast<double>(s.samples),
          dbfs(s.peak),
          static_cast<double>(s.clippedSamples),
          static_cast<double>(s.droppedSamples),
          piano::capture::stopReasonName(s.stopReason)};
}

bool NativeTakeRecorder::saveTakeMeta(jsi::Runtime& /*rt*/, std::string id, std::string json) {
  if (!validId(id)) return false;
  const fs::path dir = fs::path(platform_.takesFolder) / id;
  std::error_code ec;
  if (!fs::is_directory(dir, ec)) return false;
  std::ofstream out(dir / "meta.json", std::ios::binary | std::ios::trunc);
  out << json;
  return static_cast<bool>(out);
}

std::vector<NativeTakeRecorderStoredTakeCxx> NativeTakeRecorder::listTakes(jsi::Runtime& /*rt*/) {
  std::vector<NativeTakeRecorderStoredTakeCxx> takes;
  std::error_code ec;
  for (fs::directory_iterator it(platform_.takesFolder, ec), end; !ec && it != end; it.increment(ec)) {
    const std::string id = it->path().filename().string();
    if (!it->is_directory(ec) || !validId(id)) continue;
    std::error_code sizeError;
    const auto bytes = fs::file_size(it->path() / "audio.wav", sizeError);
    takes.push_back({id, sizeError ? 0.0 : static_cast<double>(bytes), readText(it->path() / "meta.json")});
  }
  // Ids start with the date and time, so the newest sorts last; show it first.
  std::sort(takes.begin(), takes.end(), [](const auto& a, const auto& b) { return a.id > b.id; });
  return takes;
}

bool NativeTakeRecorder::deleteTake(jsi::Runtime& /*rt*/, std::string id) {
  if (!validId(id)) return false;
  if (piano::capture::takeRecorder().status().recording && id == currentTakeId()) return false;
  std::error_code ec;
  return fs::remove_all(fs::path(platform_.takesFolder) / id, ec) > 0 && !ec;
}

}  // namespace react
}  // namespace facebook

#endif  // HAS_APP_SPECS_JSI
