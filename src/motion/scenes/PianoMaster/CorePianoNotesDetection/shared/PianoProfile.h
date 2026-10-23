#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

namespace piano {

/** How a key's tuning reference was obtained. */
enum KeySource : uint8_t {
  kKeyModel = 0,     // derived from the stretch / inharmonicity model
  kKeyMeasured = 1,  // struck during calibration
  kKeyRefined = 2,   // refined online while the user played
};

/**
 * The calibrated acoustic fingerprint of one piano, heard through one phone in
 * one room. Built by PianoCalibrator, used by Cascade, saved as JSON.
 */
struct PianoProfile {
  static constexpr int kVersion = 2;

  bool isCalibrated{false};
  int lowestMidi{21};   // playable range of the user's keyboard
  int highestMidi{108};
  float a4ReferenceHz{440.0f};
  float ambientNoiseDb{-60.0f};
  float calibratedGateDb{-48.0f};
  float minVelocityDb{-42.0f};  // softest calibration strike (hop RMS, dBFS)
  float maxVelocityDb{-6.0f};   // firmest calibration strike
  float meanInharmonicityB{0.00035f};
  float minOvertoneRatio{0.02f};  // smallest (E2+E3+E4)/E1 seen on a real strike, with margin
  std::array<float, 128> keyFreqHz{};
  std::array<float, 128> inharmonicityB{};
  std::array<uint8_t, 128> keySource{};

  static PianoProfile defaults() noexcept {
    PianoProfile p;
    for (int m = 0; m < 128; ++m) {
      p.keyFreqHz[m] = equalTempered(m, 440.0f);
      p.inharmonicityB[m] = defaultB(m);
      p.keySource[m] = kKeyModel;
    }
    return p;
  }

  static float equalTempered(int midi, float a4) noexcept {
    return a4 * std::pow(2.0f, static_cast<float>(midi - 69) / 12.0f);
  }

  /** Typical grand-piano string stiffness when nothing was measured. */
  static float defaultB(int midi) noexcept {
    if (midi >= 48) return std::min(0.02f, 0.0002f * std::exp(0.045f * static_cast<float>(midi - 48)));
    return 0.0002f * std::exp(0.03f * static_cast<float>(48 - midi));
  }

  float keyHz(int midi) const noexcept {
    if (midi < 0 || midi > 127) return equalTempered(midi, a4ReferenceHz);
    return keyFreqHz[midi] > 1.0f ? keyFreqHz[midi] : equalTempered(midi, a4ReferenceHz);
  }

  float keyB(int midi) const noexcept {
    if (midi < 0 || midi > 127) return 0.00035f;
    return inharmonicityB[midi];
  }

  float centsFromKey(float hz, int midi) const noexcept {
    return 1200.0f * std::log2(std::max(1e-3f, hz) / keyHz(midi));
  }

  /** The key whose calibrated pitch is closest to hz (handles detuned pianos). */
  int nearestKey(float hz) const noexcept {
    if (hz <= 0.0f) return -1;
    const int guess = static_cast<int>(std::lround(69.0f + 12.0f * std::log2(hz / a4ReferenceHz)));
    int best = -1;
    float bestAbs = 1e9f;
    for (int m = guess - 1; m <= guess + 1; ++m) {
      if (m < 0 || m > 127) continue;
      const float c = std::fabs(centsFromKey(hz, m));
      if (c < bestAbs) {
        bestAbs = c;
        best = m;
      }
    }
    return best;
  }

  bool inRange(int midi) const noexcept { return midi >= lowestMidi && midi <= highestMidi; }

  int measuredKeyCount() const noexcept {
    int n = 0;
    for (uint8_t s : keySource) n += (s == kKeyMeasured) ? 1 : 0;
    return n;
  }

  // ---- JSON (no library: a fixed, flat schema) ------------------------------

  std::string toJson() const {
    std::string s;
    s.reserve(6000);
    char buf[64];
    auto num = [&](const char* key, double v, bool comma = true) {
      std::snprintf(buf, sizeof buf, "\"%s\":%.9g", key, v);
      s += buf;
      if (comma) s += ',';
    };
    s += '{';
    num("version", kVersion);
    s += isCalibrated ? "\"isCalibrated\":true," : "\"isCalibrated\":false,";
    num("lowestMidi", lowestMidi);
    num("highestMidi", highestMidi);
    num("a4ReferenceHz", a4ReferenceHz);
    num("ambientNoiseDb", ambientNoiseDb);
    num("calibratedGateDb", calibratedGateDb);
    num("minVelocityDb", minVelocityDb);
    num("maxVelocityDb", maxVelocityDb);
    num("meanInharmonicityB", meanInharmonicityB);
    num("minOvertoneRatio", minOvertoneRatio);
    auto arr = [&](const char* key, auto const& a, bool comma) {
      s += '"';
      s += key;
      s += "\":[";
      for (std::size_t i = 0; i < a.size(); ++i) {
        std::snprintf(buf, sizeof buf, "%.9g", static_cast<double>(a[i]));
        s += buf;
        if (i + 1 < a.size()) s += ',';
      }
      s += ']';
      if (comma) s += ',';
    };
    arr("keyFreqHz", keyFreqHz, true);
    arr("inharmonicityB", inharmonicityB, true);
    arr("keySource", keySource, false);
    s += '}';
    return s;
  }

  /** Parses toJson() output. Returns false (and leaves `out` alone) on any problem. */
  static bool fromJson(const std::string& json, PianoProfile& out) {
    PianoProfile p = defaults();
    double v = 0;
    if (!readNumber(json, "version", v) || static_cast<int>(v) != kVersion) return false;
    p.isCalibrated = json.find("\"isCalibrated\":true") != std::string::npos;
    if (!readNumber(json, "lowestMidi", v)) return false;
    p.lowestMidi = std::clamp(static_cast<int>(v), 0, 127);
    if (!readNumber(json, "highestMidi", v)) return false;
    p.highestMidi = std::clamp(static_cast<int>(v), p.lowestMidi, 127);
    const struct {
      const char* key;
      float* field;
    } scalars[] = {
        {"a4ReferenceHz", &p.a4ReferenceHz},       {"ambientNoiseDb", &p.ambientNoiseDb},
        {"calibratedGateDb", &p.calibratedGateDb}, {"minVelocityDb", &p.minVelocityDb},
        {"maxVelocityDb", &p.maxVelocityDb},       {"meanInharmonicityB", &p.meanInharmonicityB},
        {"minOvertoneRatio", &p.minOvertoneRatio},
    };
    for (const auto& f : scalars) {
      if (!readNumber(json, f.key, v) || !std::isfinite(v)) return false;
      *f.field = static_cast<float>(v);
    }
    if (p.a4ReferenceHz < 380.0f || p.a4ReferenceHz > 500.0f) return false;
    if (!readArray(json, "keyFreqHz", p.keyFreqHz)) return false;
    if (!readArray(json, "inharmonicityB", p.inharmonicityB)) return false;
    std::array<float, 128> src{};
    if (!readArray(json, "keySource", src)) return false;
    for (int m = 0; m < 128; ++m) {
      if (!(p.keyFreqHz[m] > 1.0f && p.keyFreqHz[m] < 20000.0f)) return false;
      p.inharmonicityB[m] = std::clamp(p.inharmonicityB[m], 0.0f, 0.05f);
      p.keySource[m] = static_cast<uint8_t>(std::clamp(static_cast<int>(src[m]), 0, 2));
    }
    out = p;
    return true;
  }

private:
  static const char* findValue(const std::string& json, const char* key) {
    const std::string needle = std::string("\"") + key + "\":";
    const std::size_t at = json.find(needle);
    return at == std::string::npos ? nullptr : json.c_str() + at + needle.size();
  }

  static bool readNumber(const std::string& json, const char* key, double& out) {
    const char* p = findValue(json, key);
    if (p == nullptr) return false;
    char* end = nullptr;
    out = std::strtod(p, &end);
    return end != p;
  }

  template <typename Arr>
  static bool readArray(const std::string& json, const char* key, Arr& out) {
    const char* p = findValue(json, key);
    if (p == nullptr || *p != '[') return false;
    ++p;
    for (std::size_t i = 0; i < out.size(); ++i) {
      char* end = nullptr;
      const double v = std::strtod(p, &end);
      if (end == p || !std::isfinite(v)) return false;
      out[i] = static_cast<typename Arr::value_type>(v);
      p = end;
      if (i + 1 < out.size()) {
        if (*p != ',') return false;
        ++p;
      }
    }
    return *p == ']';
  }
};

} // namespace piano
