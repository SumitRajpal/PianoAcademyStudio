#pragma once

#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

#include "Goertzel.h"
#include "Onset.h"
#include "PianoProfile.h"

namespace piano {

struct CalibrationOptions {
  bool fullMode{false};  // false: split-scale anchors (~6-7 keys); true: + the chromatic middle octave
  int lowestMidi{21};    // the user's keyboard
  int highestMidi{108};
};

enum CalibrationState : int {
  kCalTooShort = -3,      // the key was released before it could be measured
  kCalNotPiano = -2,      // whistle, voice, knock... not a string
  kCalWrongKey = -1,      // detectedMidi was played instead of currentMidi
  kCalMeasuringNoise = 0, // stay quiet
  kCalWaitStrike1 = 1,    // play currentMidi (soft)
  kCalWaitStrike2 = 2,    // play currentMidi again (firm)
  kCalKeyDone = 3,        // measuredMidi finished; now play currentMidi (soft)
  kCalAllDone = 4,
};

struct CalibrationProgressEvent {
  int state{kCalMeasuringNoise};
  int currentMidi{60};   // the key to play now
  int keyIndex{0};       // index of currentMidi in the sequence
  int totalKeys{0};
  int strikeNumber{1};   // the strike expected now (1 soft, 2 firm)
  int measuredMidi{-1};  // the key the measurement fields describe
  int detectedMidi{-1};  // kCalWrongKey: the key actually played
  float measuredFreqHz{0.0f};
  float centsOffset{0.0f};  // vs. equal temperament at A4 = 440 Hz
  float strikeRmsDb{-120.0f};
  float measuredB{0.0f};
};

/**
 * v1.1 split-scale two-strike calibrator.
 *
 * Anchors span the user's keyboard (C keys in range plus A4; the full mode
 * adds the chromatic middle octave). Each key is struck twice (soft, firm).
 * A strike is a hammer onset with a rising envelope, so a key still ringing
 * from the previous strike never counts. The analysis waits until its window
 * holds only the string's tone after the attack, then fits f0 and the string
 * stiffness B across up to 10 partials. Wrong keys (semitones, octaves) and
 * non-piano sounds are reported instead of measured.
 *
 * Owned and called by the analysis thread only.
 */
class PianoCalibrator {
public:
  static constexpr int kMaxKeys = 24;
  static constexpr int kNoiseHops = 112;  // ~0.6 s of room noise
  static constexpr int kMaxPartials = 10;

  PianoCalibrator() : hann4096_(4096), hann8192_(8192), buf_(8192 + 512, 0.0f), windowed_(8192, 0.0f), hop_(256, 0.0f), w1024_(1024, 0.0f) {
    profile_ = PianoProfile::defaults();
  }

  /** The keys to calibrate, low to high, inside the keyboard range. */
  static int buildSequence(const CalibrationOptions& o, std::array<int, kMaxKeys>& out) {
    const int lo = std::clamp(std::min(o.lowestMidi, o.highestMidi), 21, 108);
    const int hi = std::clamp(std::max(o.lowestMidi, o.highestMidi), 21, 108);
    int keys[kMaxKeys];
    int n = 0;
    auto add = [&](int m) {
      if (m < lo || m > hi || n >= kMaxKeys) return;
      for (int i = 0; i < n; ++i)
        if (keys[i] == m) return;
      keys[n++] = m;
    };
    for (int m : {24, 36, 48, 60, 69, 72, 84}) add(m);
    if (o.fullMode) {
      for (int m = 61; m <= 71; ++m) add(m);
    }
    // Small keyboards: make sure both ends are anchored.
    if (n < 3) {
      add(lo);
      add(hi);
    }
    std::sort(keys, keys + n);
    for (int i = 0; i < n; ++i) out[static_cast<std::size_t>(i)] = keys[i];
    return n;
  }

  void start(int sampleRate, const CalibrationOptions& options) noexcept {
    sr_ = sampleRate;
    options_ = options;
    totalKeys_ = buildSequence(options, sequence_);
    profile_ = PianoProfile::defaults();
    profile_.lowestMidi = std::clamp(std::min(options.lowestMidi, options.highestMidi), 21, 108);
    profile_.highestMidi = std::clamp(std::max(options.lowestMidi, options.highestMidi), 21, 108);
    keyIdx_ = 0;
    strikeNumber_ = 1;
    noiseHops_ = 0;
    state_ = State::MeasuringNoise;
    onset_.reset();
    preWindow_ = 0;
    refractory_ = 0;
    results_ = {};
    measured_.fill(false);
    minObservedOvertone_ = 1e9f;
    minStrikeDb_ = 0.0f;
    maxStrikeDb_ = -120.0f;
  }

  void stop() noexcept { state_ = State::Idle; }
  bool isActive() const noexcept { return state_ != State::Idle && state_ != State::Done; }
  bool isDone() const noexcept { return state_ == State::Done; }
  const PianoProfile& profile() const noexcept { return profile_; }
  int totalKeys() const noexcept { return totalKeys_; }
  int sequenceKey(int i) const noexcept { return sequence_[static_cast<std::size_t>(i)]; }

  void onDiscontinuity() noexcept {
    onset_.reset();
    if (state_ == State::Settling) state_ = State::WaitStrike;
  }

  /** One hop. Returns true when `ev` holds an event for the UI. */
  template <class Ring>
  bool processHop(const Ring& ring, CalibrationProgressEvent& ev) noexcept {
    if (state_ == State::Idle || state_ == State::Done) return false;
    ring.peekWindow(hop_.data(), 256, 256);
    ring.peekWindow(w1024_.data(), 1024, 256);
    const float hopDb = rmsDb(hop_.data(), 256);
    const float levelDb = rmsDb(w1024_.data(), 1024);
    const bool onset = onset_.process(w1024_.data() + 1024 - OnsetDetector::kFrame).onset;
    if (refractory_ > 0) --refractory_;

    switch (state_) {
      case State::MeasuringNoise:
        return measureNoise(hopDb, levelDb, onset, ev);
      case State::WaitStrike: {
        // The onset detector does not fire on a ringing note, so a soft strike
        // over a louder ring still counts while the ring itself never does.
        const bool strike = onset && refractory_ == 0 && levelDb > profile_.calibratedGateDb + 6.0f;
        if (strike) {
          state_ = State::Settling;
          settleHops_ = 0;
          peakDb_ = levelDb;
          snapshotPreStrike(ring);
        }
        return false;
      }
      case State::Settling:
        return settle(ring, levelDb, onset, ev);
      default:
        return false;
    }
  }

private:
  enum class State { Idle, MeasuringNoise, WaitStrike, Settling, Done };

  struct StrikeResult {
    float f0{0.0f};
    float B{0.0f};
    float levelDb{-120.0f};
    bool hasB{false};
  };

  struct KeyResults {
    std::array<StrikeResult, kMaxKeys> s1{};
    std::array<StrikeResult, kMaxKeys> s2{};
  };

  struct Analysis {
    int status{0};  // 0 ok, kCalWrongKey, kCalNotPiano
    int detected{-1};
    float f0{0.0f};
    float B{0.0f};
    bool hasB{false};
    float overtoneRatio{0.0f};
  };

  static float rmsDb(const float* x, int n) noexcept {
    float s = 0.0f;
    for (int i = 0; i < n; ++i) s += x[i] * x[i];
    return 10.0f * std::log10(s / static_cast<float>(n) + 1e-12f);
  }

  int target() const noexcept { return sequence_[static_cast<std::size_t>(std::min(keyIdx_, totalKeys_ - 1))]; }

  void fillEvent(CalibrationProgressEvent& ev, int state) const noexcept {
    ev = {};
    ev.state = state;
    ev.currentMidi = target();
    ev.keyIndex = std::min(keyIdx_, totalKeys_ - 1);
    ev.totalKeys = totalKeys_;
    ev.strikeNumber = strikeNumber_;
  }

  bool measureNoise(float hopDb, float levelDb, bool onset, CalibrationProgressEvent& ev) noexcept {
    if (noiseHops_ == 0) {
      noiseDb_[0] = hopDb;
      noiseHops_ = 1;
      fillEvent(ev, kCalMeasuringNoise);
      return true;  // the UI shows "stay quiet" for the whole phase
    }
    // Someone played or knocked: measure again from now.
    if (onset && levelDb > median(noiseDb_.data(), noiseHops_) + 10.0f) {
      noiseHops_ = 1;
      noiseDb_[0] = hopDb;
      return false;
    }
    noiseDb_[static_cast<std::size_t>(noiseHops_++)] = hopDb;
    if (noiseHops_ < kNoiseHops) return false;
    profile_.ambientNoiseDb = median(noiseDb_.data(), noiseHops_);
    profile_.calibratedGateDb = std::clamp(profile_.ambientNoiseDb + 6.0f, -72.0f, -36.0f);
    state_ = State::WaitStrike;
    refractory_ = 0;
    fillEvent(ev, kCalWaitStrike1);
    ev.strikeRmsDb = profile_.ambientNoiseDb;
    return true;
  }

  template <class Ring>
  bool settle(const Ring& ring, float levelDb, bool onset, CalibrationProgressEvent& ev) noexcept {
    // Struck again before we measured: start over from the newer strike.
    if (onset && levelDb > peakDb_ + 3.0f) {
      settleHops_ = 0;
      peakDb_ = levelDb;
      snapshotPreStrike(ring);
      return false;
    }
    peakDb_ = std::max(peakDb_, levelDb);
    ++settleHops_;
    const int t = target();
    const int window = t < 48 ? 8192 : 4096;
    // Skip the first ~21 ms of attack, then wait for a full window of string tone.
    const int needed = (1024 + window) / 256;
    if (levelDb < peakDb_ - 30.0f) {
      state_ = State::WaitStrike;
      refractory_ = 8;
      fillEvent(ev, kCalTooShort);
      return true;
    }
    if (settleHops_ < needed) return false;

    ring.peekWindow(buf_.data(), static_cast<std::size_t>(window), 256);
    const Analysis a = analyze(buf_.data(), window, t);
    state_ = State::WaitStrike;
    refractory_ = 8;
    if (a.status != 0) {
      fillEvent(ev, a.status);
      ev.detectedMidi = a.detected;
      ev.measuredFreqHz = a.f0;
      ev.strikeRmsDb = peakDb_;
      return true;
    }

    StrikeResult r{a.f0, a.B, peakDb_, a.hasB};
    if (a.f0 < 1100.0f) minObservedOvertone_ = std::min(minObservedOvertone_, a.overtoneRatio);
    minStrikeDb_ = std::min(minStrikeDb_, peakDb_);
    maxStrikeDb_ = std::max(maxStrikeDb_, peakDb_);
    const float cents = 1200.0f * std::log2(a.f0 / PianoProfile::equalTempered(t, 440.0f));

    if (strikeNumber_ == 1) {
      results_.s1[static_cast<std::size_t>(keyIdx_)] = r;
      strikeNumber_ = 2;
      fillEvent(ev, kCalWaitStrike2);
    } else {
      results_.s2[static_cast<std::size_t>(keyIdx_)] = r;
      finalizeKey(keyIdx_);
      ++keyIdx_;
      strikeNumber_ = 1;
      if (keyIdx_ >= totalKeys_) {
        finalizeProfile();
        state_ = State::Done;
        keyIdx_ = totalKeys_ - 1;
        fillEvent(ev, kCalAllDone);
      } else {
        fillEvent(ev, kCalKeyDone);  // currentMidi is already the next key
      }
    }
    ev.measuredMidi = t;
    ev.measuredFreqHz = a.f0;
    ev.centsOffset = cents;
    ev.strikeRmsDb = peakDb_;
    ev.measuredB = a.B;
    return true;
  }

  // The analysis window as it was just before the strike (ending 2 hops
  // before the strike hop), so whatever was still ringing can be told apart
  // from what the strike added.
  template <class Ring>
  void snapshotPreStrike(const Ring& ring) noexcept {
    const int window = target() < 48 ? 8192 : 4096;
    ring.peekWindow(buf_.data(), static_cast<std::size_t>(window) + 512, 256);
    (window >= 8192 ? hann8192_ : hann4096_).apply(buf_.data(), preWindowed_.data());
    preWindow_ = window;
  }

  // ---- analysis -----------------------------------------------------------------

  float powerAt(int n, float hz) const noexcept {
    return Goertzel::magnitudeSquared(windowed_.data(), n, hz, sr_);
  }

  // Power the strike added at hz (now minus just before the strike).
  float newPowerAt(int n, float hz, float nowPower) const noexcept {
    if (preWindow_ != n) return nowPower;
    return std::max(0.0f, nowPower - Goertzel::magnitudeSquared(preWindowed_.data(), n, hz, sr_));
  }

  // Best peak within +/- rangeCents of hz: grid search, then a log-parabola.
  float findPeak(int n, float hz, float rangeCents, float& power) const noexcept {
    const float binHz = static_cast<float>(sr_) / static_cast<float>(n);
    const float spanHz = hz * (std::pow(2.0f, rangeCents / 1200.0f) - 1.0f);
    const float step = std::max(0.05f, std::min(binHz * 0.25f, spanHz / 4.0f));
    float best = hz;
    float bestP = -1.0f;
    for (float f = hz - spanHz; f <= hz + spanHz + 1e-3f; f += step) {
      const float p = powerAt(n, f);
      if (p > bestP) {
        bestP = p;
        best = f;
      }
    }
    return Goertzel::refinePeakHz(windowed_.data(), n, best, sr_, &power);
  }

  // Harmonic salience of a key hypothesis: the partial amplitudes the strike
  // added. `partials` counts the partials that carry a real share (a string
  // excites many; a whistle or knock lands on one or two).
  float salience(int n, int midi, int maxH, int* partials = nullptr) const noexcept {
    const float f0 = PianoProfile::equalTempered(midi, 440.0f);
    const float B = PianoProfile::defaultB(midi);
    float amps[16] = {};
    float s = 0.0f, top = 0.0f;
    int count = 0;
    for (int h = 1; h <= maxH && h <= 16; ++h) {
      const float fh = Goertzel::inharmonicPartial(f0, h, B);
      if (fh >= 6000.0f) break;
      float p = 0.0f;
      const float at = findPeak(n, fh, 45.0f, p);
      amps[count] = std::sqrt(newPowerAt(n, at, p));
      s += amps[count];
      top = std::max(top, amps[count]);
      ++count;
    }
    if (partials != nullptr) {
      *partials = 0;
      for (int i = 0; i < count; ++i) *partials += amps[i] >= 0.1f * top ? 1 : 0;
    }
    return s;
  }

  Analysis analyze(const float* x, int n, int t) noexcept {
    Analysis a;
    const HannWindow& hw = n >= 8192 ? hann8192_ : hann4096_;
    const float frameEnergy = hw.apply(x, windowed_.data());
    const float fNom = PianoProfile::equalTempered(t, 440.0f);
    if (frameEnergy < 1e-9f) {
      a.status = kCalNotPiano;
      return a;
    }

    // 1. Partials, low to high, each searched near the prediction of the fit so far.
    float hs[kMaxPartials + 1] = {};
    float fs[kMaxPartials + 1] = {};
    float ps[kMaxPartials + 1] = {};
    bool use[kMaxPartials + 1] = {};
    int count = 0;
    float f0 = fNom;
    float B = PianoProfile::defaultB(t);
    float maxP = 0.0f;
    for (int h = 1; h <= kMaxPartials; ++h) {
      const float predicted = Goertzel::inharmonicPartial(f0, h, B);
      if (predicted >= std::min(6000.0f, 0.45f * static_cast<float>(sr_))) break;
      float p = 0.0f;
      const float fh = findPeak(n, predicted, h <= 2 ? 70.0f : 25.0f, p);
      hs[count] = static_cast<float>(h);
      fs[count] = fh;
      ps[count] = newPowerAt(n, fh, p);  // what this strike added, not what was ringing
      ++count;
      maxP = std::max(maxP, p);
      for (int i = 0; i < count; ++i) use[i] = ps[i] >= maxP * 3e-5f;  // within 45 dB of the strongest
      fit(hs, fs, ps, use, count, f0, B);
    }

    // 2. Drop partials the fit cannot explain (noise peaks), then refit.
    int good = 0;
    for (int i = 0; i < count; ++i) {
      const float model = Goertzel::inharmonicPartial(f0, static_cast<int>(hs[i]), B);
      use[i] = use[i] && std::fabs(1200.0f * std::log2(fs[i] / model)) <= 10.0f;
      good += use[i] ? 1 : 0;
    }
    fit(hs, fs, ps, use, count, f0, B);

    // 3. Wrong key first (so the user hears which key they played): a neighbour
    //    or an octave explains what the strike added better than the target.
    const float own = salience(n, t, 8);
    int bestOther = -1;
    int bestOtherPartials = 0;
    float bestOtherSal = 0.0f;
    for (int d : {-2, -1, 1, 2, -12}) {
      const int m = t + d;
      if (m < 21 || m > 108) continue;
      int partials = 0;
      const float s = salience(n, m, 8, &partials);
      if (s > bestOtherSal) {
        bestOtherSal = s;
        bestOther = m;
        bestOtherPartials = partials;
      }
    }
    if (bestOther >= 0 && bestOtherSal > 1.25f * own && bestOtherPartials >= 3) {
      a.status = kCalWrongKey;
      a.detected = bestOther;
      return a;
    }
    // The octave above shares only the even partials of the target.
    float odd = 0.0f, even = 0.0f;
    for (int i = 0; i < count; ++i) {
      if (hs[i] > 6.0f) continue;
      (static_cast<int>(hs[i]) % 2 ? odd : even) += std::sqrt(ps[i]);
    }
    if (t + 12 <= 108 && good >= 3 && odd < 0.2f * even) {
      a.status = kCalWrongKey;
      a.detected = t + 12;
      return a;
    }

    // 4. Is it a string at all? Several partials, overtones present, and the
    // window's energy concentrated on the partial comb (not broadband noise).
    float combPower = 0.0f;
    float e[5] = {0, 0, 0, 0, 0};
    for (int i = 0; i < count; ++i) {
      if (use[i]) combPower += ps[i];
      if (hs[i] <= 4.0f) e[static_cast<int>(hs[i])] = ps[i];
    }
    const float combRatio = 8.0f * combPower / (static_cast<float>(n) * frameEnergy);
    a.overtoneRatio = (e[2] + e[3] + e[4]) / (e[1] + 1e-20f);
    const bool pureTone = fNom < 1100.0f && a.overtoneRatio < 0.003f;
    if (good < 3 || pureTone || combRatio < 0.2f) {
      a.status = kCalNotPiano;
      a.f0 = f0;
      return a;
    }

    // 5. f0 must be this key, not a neighbour (the fit can drift on noise).
    if (std::fabs(1200.0f * std::log2(f0 / fNom)) > 60.0f) {
      a.status = kCalWrongKey;
      a.detected = static_cast<int>(std::lround(69.0f + 12.0f * std::log2(f0 / 440.0f)));
      return a;
    }
    a.f0 = f0;
    a.B = B;
    a.hasB = good >= 3;
    return a;
  }

  // Weighted least squares on (f_h / h)^2 = f0^2 + f0^2 B h^2, amplitude weighted.
  // Fewer than 3 partials cannot pin down B: then only f0 is fitted, at the current B.
  static void fit(const float* hs, const float* fs, const float* ps, const bool* use, int count, float& f0,
                  float& B) noexcept {
    double sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, sf = 0;
    int used = 0;
    for (int i = 0; i < count; ++i) {
      if (!use[i]) continue;
      const double h = hs[i];
      const double y = (fs[i] / h) * (fs[i] / h);
      const double x = h * h;
      const double w = std::sqrt(static_cast<double>(ps[i]));
      sw += w;
      sx += w * x;
      sy += w * y;
      sxx += w * x * x;
      sxy += w * x * y;
      sf += w * fs[i] / (h * std::sqrt(1.0 + B * x));
      ++used;
    }
    if (used == 0 || sw <= 0) return;
    if (used < 3) {
      f0 = static_cast<float>(sf / sw);
      return;
    }
    const double det = sw * sxx - sx * sx;
    if (std::fabs(det) < 1e-12) return;
    const double b = (sw * sxy - sx * sy) / det;
    const double a = (sy - b * sx) / sw;
    if (a <= 0) return;
    f0 = static_cast<float>(std::sqrt(a));
    B = std::clamp(static_cast<float>(b / a), 0.0f, 0.05f);
  }

  void finalizeKey(int idx) noexcept {
    const int m = sequence_[static_cast<std::size_t>(idx)];
    const StrikeResult& a = results_.s1[static_cast<std::size_t>(idx)];
    const StrikeResult& b = results_.s2[static_cast<std::size_t>(idx)];
    const float diff = std::fabs(1200.0f * std::log2(a.f0 / b.f0));
    // Two agreeing strikes are averaged; otherwise trust the firm one.
    profile_.keyFreqHz[m] = diff < 5.0f ? std::sqrt(a.f0 * b.f0) : b.f0;
    if (a.hasB && b.hasB) {
      profile_.inharmonicityB[m] = 0.35f * a.B + 0.65f * b.B;
    } else if (b.hasB || a.hasB) {
      profile_.inharmonicityB[m] = b.hasB ? b.B : a.B;
    }
    profile_.keySource[m] = kKeyMeasured;
    measured_[m] = true;
  }

  void finalizeProfile() noexcept {
    // Concert pitch of this piano.
    if (measured_[69]) {
      profile_.a4ReferenceHz = profile_.keyFreqHz[69];
    } else {
      double ratio = 0.0;
      int n = 0;
      for (int m = 55; m <= 81; ++m) {
        if (!measured_[m]) continue;
        ratio += profile_.keyFreqHz[m] / PianoProfile::equalTempered(m, 440.0f);
        ++n;
      }
      profile_.a4ReferenceHz = n > 0 ? static_cast<float>(440.0 * ratio / n) : 440.0f;
    }

    // Measured anchors, low to high.
    int anchors[kMaxKeys];
    int na = 0;
    for (int m = 21; m <= 108; ++m)
      if (measured_[m]) anchors[na++] = m;
    if (na == 0) return;

    // String stiffness: ln B piecewise linear between anchors, extended with
    // the end segments' slopes (clamped to what real pianos show).
    std::array<float, 128> lnB{};
    for (int i = 0; i < na; ++i) lnB[anchors[i]] = std::log(std::max(1e-6f, profile_.inharmonicityB[anchors[i]]));
    for (int i = 0; i + 1 < na; ++i) {
      const int a = anchors[i], b = anchors[i + 1];
      for (int m = a + 1; m < b; ++m) {
        const float t = static_cast<float>(m - a) / static_cast<float>(b - a);
        lnB[m] = lnB[a] + t * (lnB[b] - lnB[a]);
      }
    }
    float trebleSlope = 0.045f;
    if (na >= 2 && anchors[na - 2] >= 60) {
      trebleSlope = std::clamp((lnB[anchors[na - 1]] - lnB[anchors[na - 2]]) / static_cast<float>(anchors[na - 1] - anchors[na - 2]), 0.02f, 0.07f);
    }
    float bassSlope = 0.03f;  // per semitone going down
    if (na >= 2 && anchors[1] <= 48) {
      bassSlope = std::clamp((lnB[anchors[0]] - lnB[anchors[1]]) / static_cast<float>(anchors[1] - anchors[0]), 0.0f, 0.06f);
    }
    for (int m = anchors[na - 1] + 1; m <= 108; ++m) lnB[m] = lnB[anchors[na - 1]] + trebleSlope * static_cast<float>(m - anchors[na - 1]);
    for (int m = anchors[0] - 1; m >= 21; --m) lnB[m] = lnB[anchors[0]] + bassSlope * static_cast<float>(anchors[0] - m);
    for (int m = 21; m <= 108; ++m) {
      if (!measured_[m]) profile_.inharmonicityB[m] = std::clamp(std::exp(lnB[m]), 0.00002f, 0.03f);
    }
    profile_.meanInharmonicityB = profile_.inharmonicityB[60];

    // Tuning: measured offsets interpolated between anchors; beyond them the
    // stretch a tuner builds octave by octave (4:2 octaves up, 6:3 down).
    std::array<float, 128> cents{};
    const float a4 = profile_.a4ReferenceHz;
    auto centsOf = [&](int m) { return 1200.0f * std::log2(profile_.keyFreqHz[m] / PianoProfile::equalTempered(m, a4)); };
    for (int i = 0; i < na; ++i) cents[anchors[i]] = centsOf(anchors[i]);
    for (int i = 0; i + 1 < na; ++i) {
      const int a = anchors[i], b = anchors[i + 1];
      for (int m = a + 1; m < b; ++m) {
        const float t = static_cast<float>(m - a) / static_cast<float>(b - a);
        cents[m] = cents[a] + t * (cents[b] - cents[a]);
      }
    }
    const float kStretch = 600.0f / std::log(2.0f);  // cents per unit of (1 + x) for small x
    const auto& B = profile_.inharmonicityB;
    for (int m = anchors[na - 1] + 1; m <= 108; ++m) {
      const int l = m - 12;
      const float base = l >= 21 ? cents[l] : cents[anchors[na - 1]];
      cents[m] = l >= 21 ? base + kStretch * (16.0f * B[l] - 4.0f * B[m]) : base;
    }
    for (int m = anchors[0] - 1; m >= 21; --m) {
      const int u = m + 12;
      cents[m] = u <= 108 ? cents[u] + kStretch * (9.0f * B[u] - 36.0f * B[m]) : cents[anchors[0]];
    }
    for (int m = 21; m <= 108; ++m) {
      if (!measured_[m]) profile_.keyFreqHz[m] = PianoProfile::equalTempered(m, a4) * std::pow(2.0f, cents[m] / 1200.0f);
    }

    profile_.minOvertoneRatio = minObservedOvertone_ < 1e8f ? std::clamp(0.5f * minObservedOvertone_, 0.003f, 0.05f) : 0.01f;
    profile_.minVelocityDb = minStrikeDb_;
    profile_.maxVelocityDb = std::max(maxStrikeDb_, minStrikeDb_ + 6.0f);
    profile_.isCalibrated = true;
  }

  static float median(const float* v, int n) noexcept {
    float tmp[kNoiseHops];
    std::copy(v, v + n, tmp);
    std::nth_element(tmp, tmp + n / 2, tmp + n);
    return tmp[n / 2];
  }

  int sr_{48000};
  CalibrationOptions options_{};
  std::array<int, kMaxKeys> sequence_{};
  int totalKeys_{0};
  int keyIdx_{0};
  int strikeNumber_{1};
  State state_{State::Idle};
  int noiseHops_{0};
  std::array<float, kNoiseHops> noiseDb_{};
  OnsetDetector onset_;
  int refractory_{0};
  int settleHops_{0};
  float peakDb_{-120.0f};
  KeyResults results_{};
  std::array<bool, 128> measured_{};
  float minObservedOvertone_{1e9f};
  float minStrikeDb_{0.0f};
  float maxStrikeDb_{-120.0f};
  PianoProfile profile_{};
  HannWindow hann4096_;
  HannWindow hann8192_;
  std::vector<float> buf_;
  std::vector<float> windowed_;
  std::vector<float> preWindowed_ = std::vector<float>(8192, 0.0f);
  int preWindow_{0};
  std::vector<float> hop_;
  std::vector<float> w1024_;
};

} // namespace piano
