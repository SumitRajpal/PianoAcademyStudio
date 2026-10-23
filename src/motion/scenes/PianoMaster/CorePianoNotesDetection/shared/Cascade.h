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
#include "Mpm.h"
#include "Onset.h"
#include "PianoProfile.h"
#include "PolyEstimator.h"
#include "SampleRing.h"

// Debug-only: define PIANO_CASCADE_TRACE(...) as printf before including this
// header to log every decision (the test suite does this with --trace).
#ifndef PIANO_CASCADE_TRACE
#define PIANO_CASCADE_TRACE(...) ((void)0)
#endif

namespace piano {

struct NoteEvent {
  enum Type : uint8_t { NoteOff = 0, NoteOn = 1 } type;
  int midi{0};
  float cents{0.0f};
  float velocity{0.0f};
  double tMs{0.0};
};

struct CascadeConfig {
  int sampleRate{48000};
  int hopSize{256};                   // 5.333 ms per hop @ 48 kHz
  float gateRmsDb{-48.0f};            // silence gate before calibration
  float mpmClarityShort{0.88f};       // accept a 1024-sample MPM pitch
  float mpmClarityLong{0.80f};        // accept the escalated 4096-sample pitch
  float goertzelVerifyRatio{0.10f};   // fundamental + 2nd partial share of the frame
  int confirmHops{2};                 // consecutive agreeing hops before NoteOn
  bool polyphonyEnabled{false};       // blind chord mode

  // v1.1 calibrated acoustic fingerprint
  bool strictCalibrationFilter{true}; // range + pitch-grid gates once calibrated
  int onsetWindowHops{12};            // a note must be confirmed within ~64 ms of its strike
  int onsetWindowHopsBass{28};        // bass waits for the 4096-sample window (~150 ms)
  float newNoteRiseDb{6.0f};          // a struck note's own partials rise at least this much
  int restrikeFirstHop{6};            // decide re-strikes after a clap or knock would have died away
  int restrikeLastHop{10};            // (lesson mode: the window in which a re-strike is looked for)
  float minOvertoneRatio{0.01f};      // (E2+E3+E4)/E1 below this = pure tone (whistle)
  float overtoneGateMaxHz{1100.0f};   // full-strength gate below ~C6, where piano overtones are reliable
  float overtoneGateSoftMaxHz{2000.0f}; // a gentler gate (x0.3) up to ~B6, where whistles live
  float maxAttackDropDb{6.0f};        // fell this far from the strike's peak, back to the background = knock
  float releaseDropDb{30.0f};         // a note is over once its partials fall this far below their peak
  float gridLockMeasuredCents{25.0f}; // |cents| allowed for measured / refined keys
  float gridLockModelCents{40.0f};    // |cents| allowed for keys derived from the model
  float refineRate{0.1f};             // online refinement step for a key's pitch
  float expectedOnScore{0.12f};       // lesson mode: note present (a lone note scores ~0.38, each note of a triad ~0.2)
  float expectedOffScore{0.06f};      // lesson mode: note gone (hysteresis)
  int expectedOffHops{4};             // consecutive absent hops before NoteOff
};

/**
 * Four-stage gated cascade (v1.1).
 *
 * Stage 1: RMS gate (silence costs < 1 us) and hammer-onset detection.
 * Stage 2: Pitch. Out of silence: MPM (FFT NSDF), 1024 samples, escalating
 *          to 4096 below 130 Hz. Over notes still ringing (trills, legato,
 *          pedal, repeated notes): new-energy harmonic salience, the key whose
 *          partials grew the most since the strike.
 * Stage 3: Harmonic verification and the calibrated fingerprint gates:
 *          the note's own partials rose with the strike, overtones present
 *          (rejects whistles), string-like decay (rejects knocks), calibrated
 *          range and pitch grid.
 * Stage 4: Lesson mode (expected notes) or blind chords, with per-note
 *          hysteresis.
 *
 * Note changes need a hammer strike: a ringing note cannot turn into another
 * note on its own (no flicker on held notes, no notes from sung glides). A
 * strike whose new energy lands on a ringing note's partials re-triggers it.
 *
 * Owned and called by the analysis thread only.
 */
class Cascade {
public:
  static constexpr int kMaxExpected = 32;
  static constexpr int kMaxRinging = 3;

  explicit Cascade(CascadeConfig config = {})
      : config_(config),
        profile_(PianoProfile::defaults()),
        mpm_(4096),
        poly_(2048),
        hann1024_(1024),
        hann2048_(2048),
        hann4096_(4096),
        hop_(static_cast<std::size_t>(config.hopSize), 0.0f),
        w1024_(1024, 0.0f),
        w2048_(2048, 0.0f),
        w4096_(4096, 0.0f),
        win1024_(1024, 0.0f),
        windowed_(4096, 0.0f),
        pre_(4096 + 512, 0.0f),
        preWin_(4096, 0.0f),
        fft2048_(2048),
        fft4096_(4096),
        specRe_(2049, 0.0f),
        specIm_(2049, 0.0f),
        preMag2048_(1025, 0.0f),
        nowMag2048_(1025, 0.0f),
        preMag4096_(2049, 0.0f),
        nowMag4096_(2049, 0.0f) {
    reset();
  }

  void setConfig(const CascadeConfig& config) {
    config_ = config;
    hop_.assign(static_cast<std::size_t>(config_.hopSize), 0.0f);
  }
  const CascadeConfig& getConfig() const noexcept { return config_; }

  void setExpectedNotes(const std::vector<int>& notes) noexcept {
    std::array<int, kMaxExpected> next{};
    int count = 0;
    for (int m : notes) {
      if (m < 21 || m > 108 || count >= kMaxExpected) continue;
      if (std::find(next.begin(), next.begin() + count, m) != next.begin() + count) continue;
      next[static_cast<std::size_t>(count++)] = m;
    }
    expected_ = next;
    expectedCount_ = count;
    releaseUntracked_ = true;
  }

  int expectedCount() const noexcept { return expectedCount_; }

  void setPolyphony(bool enabled) noexcept {
    if (config_.polyphonyEnabled != enabled) releaseUntracked_ = true;
    config_.polyphonyEnabled = enabled;
  }
  bool isPolyphonyEnabled() const noexcept { return config_.polyphonyEnabled; }

  void setProfile(const PianoProfile& profile) noexcept {
    profile_ = profile;
    refineCount_.fill(0);
  }
  const PianoProfile& getProfile() const noexcept { return profile_; }

  /** True once after online refinement changed the profile. */
  bool takeProfileDirty() noexcept {
    const bool d = profileDirty_;
    profileDirty_ = false;
    return d;
  }

  void reset() noexcept {
    onset_.reset();
    activeMidi_ = -1;
    candidate_ = {};
    lastPeriod_ = 0.0f;
    lastConfirmedOnset_ = -1;
    silenceHops_ = 3;
    onsetSerial_ = 0;
    hopsSinceOnset_ = kFar;
    peakSinceOnsetDb_ = -120.0f;
    levelDb_ = -120.0f;
    snapshotPending_ = false;
    preN_ = 0;
    snapCount_ = 0;
    ringingCount_ = 0;
    noteOn_.fill(false);
    noteOnset_.fill(-1);
    presentHops_.fill(0);
    absentHops_.fill(0);
    releaseUntracked_ = false;
  }

  /** NoteOffs for everything sounding (before calibration takes over the mic). */
  void releaseEverything(std::vector<NoteEvent>& out, double tMs) noexcept {
    out.clear();
    releaseAll(out, tMs);
  }

  /** Audio was skipped (backlog drop): start the strike history afresh. */
  void onDiscontinuity() noexcept {
    onset_.reset();
    candidate_ = {};
    hopsSinceOnset_ = kFar;
    preN_ = 0;
    snapCount_ = 0;
  }

  /** Process the hop at the ring's read cursor (~5.33 ms). Never allocates. */
  template <class Ring>
  void processHop(const Ring& ring, std::vector<NoteEvent>& out, double tMs) noexcept {
    out.clear();
    const std::size_t hop = static_cast<std::size_t>(config_.hopSize);
    ring.peekWindow(hop_.data(), hop, hop);
    const float hopDb = rmsDb(hop_.data(), config_.hopSize);
    // Still silent: everything was released when the silence began, so the
    // hop costs one RMS (well under a microsecond).
    pushHopLevel(hopDb);
    if (hopDb < gateDb() && silenceHops_ >= 3) {
      silenceHops_ = std::min(silenceHops_ + 1, kFar);
      return;
    }
    if (silenceHops_ >= 3) {
      // Leaving silence (those hops skipped the onset detector): measure this
      // strike against the quiet frame that ends one hop earlier.
      ring.peekWindow(w1024_.data(), OnsetDetector::kFrame + hop, hop);
      onset_.prime(w1024_.data());
    }
    ring.peekWindow(w1024_.data(), 1024, hop);
    hopDb_ = hopDb;
    levelDb_ = rmsDb(w1024_.data(), 1024);

    if (releaseUntracked_) {
      releaseNotesNoLongerTracked(out, tMs);
      releaseUntracked_ = false;
    }

    // Stage 1: hammer onset. A sound appearing well above the gate out of
    // silence is a strike too (but not a decaying note wavering at the gate).
    const OnsetResult on = onset_.process(w1024_.data() + 1024 - OnsetDetector::kFrame);
    const bool loud = hopDb >= gateDb();
    const bool strike = loud && (on.onset || (silenceHops_ >= 3 && hopDb >= gateDb() + 10.0f));
    if (strike) {
      PIANO_CASCADE_TRACE("[t=%.0f] strike #%d (flux %.1f / thr %.1f)\n", tMs, onsetSerial_ + 1, on.flux, on.threshold);
      ++onsetSerial_;
      strikeFlux_ = on.onset ? on.flux : 0.0f;
      strikeThreshold_ = std::max(1e-3f, on.threshold);
      hopsSinceOnset_ = 0;
      peakSinceOnsetDb_ = levelDb_;
      peakHopSinceOnsetDb_ = hopDb;
      // The background before the strike: the quietest of the hops before it.
      preStrikeHopDb_ = std::min(hopHist_[1], std::min(hopHist_[2], hopHist_[3]));
      snapshotPending_ = true;
    } else {
      hopsSinceOnset_ = std::min(hopsSinceOnset_ + 1, kFar);
      peakSinceOnsetDb_ = std::max(peakSinceOnsetDb_, levelDb_);
      peakHopSinceOnsetDb_ = std::max(peakHopSinceOnsetDb_, hopDb);
    }
    if (hopsSinceOnset_ == 3) postAttackDb_ = levelDb_;

    if (!loud) {
      if (++silenceHops_ >= 3) {
        releaseAll(out, tMs);
        hopsSinceOnset_ = kFar;  // after silence, only a new strike starts a note
      }
      candidate_ = {};
      lastPeriod_ = 0.0f;
      return;
    }
    silenceHops_ = 0;

    if (expectedCount_ > 0) {
      processExpected(ring, out, tMs);
    } else if (config_.polyphonyEnabled) {
      processBlind(ring, out, tMs);
    } else {
      processMono(ring, out, tMs);
    }
  }

private:
  static constexpr int kFar = 1 << 20;

  struct Candidate {
    int midi{-1};
    int count{0};
    float cents{0.0f};
    int onset{-1};
  };

  struct Ringing {
    int midi{-1};
    float peakDb{-120.0f};
  };

  static float rmsDb(const float* x, int n) noexcept {
    float s = 0.0f;
    for (int i = 0; i < n; ++i) s += x[i] * x[i];
    return 10.0f * std::log10(s / static_cast<float>(n) + 1e-12f);
  }

  float gateDb() const noexcept {
    return profile_.isCalibrated ? profile_.calibratedGateDb : config_.gateRmsDb;
  }

  bool strict() const noexcept { return profile_.isCalibrated && config_.strictCalibrationFilter; }

  int strikeWindowFor(int midi) const noexcept {
    return midi < 48 ? config_.onsetWindowHopsBass : config_.onsetWindowHops;
  }

  // A clap or knock, not a string: either it fell straight back to the
  // background that was there before the strike (silence, or the notes
  // ringing under it), or it keeps dying fast after the attack (a string
  // decays well under 0.2 dB per hop once the hammer's attack is over).
  bool isTransient(int midi) const noexcept {
    const float drop = midi < 48 ? peakSinceOnsetDb_ - levelDb_ : peakHopSinceOnsetDb_ - hopDb_;
    const bool fellBack = drop > config_.maxAttackDropDb && hopDb_ - preStrikeHopDb_ < 10.0f;
    const bool dyingFast = hopsSinceOnset_ >= 6 &&
                           (postAttackDb_ - levelDb_) / static_cast<float>(hopsSinceOnset_ - 3) > 0.6f;
    return fellBack || dyingFast;
  }

  void pushHopLevel(float db) noexcept {
    for (std::size_t i = hopHist_.size() - 1; i > 0; --i) hopHist_[i] = hopHist_[i - 1];
    hopHist_[0] = db;
  }

  float velocityFor(float levelDb) const noexcept {
    float lo = gateDb();
    float hi = lo + 40.0f;
    if (profile_.isCalibrated) {
      lo = profile_.minVelocityDb - 6.0f;
      hi = std::max(lo + 6.0f, profile_.maxVelocityDb);
    }
    return std::clamp((levelDb - lo) / (hi - lo), 0.05f, 1.0f);
  }

  float partialHz(int midi, int h) const noexcept {
    return Goertzel::inharmonicPartial(profile_.keyHz(midi), h, profile_.keyB(midi));
  }

  // Level of a note's first three partials.
  float noteLevelDb(const float* windowed, int n, int midi) const noexcept {
    float e = 0.0f;
    for (int h = 1; h <= 3; ++h) {
      const float fh = partialHz(midi, h);
      if (fh >= 0.45f * static_cast<float>(config_.sampleRate)) break;
      e += Goertzel::magnitudeSquared(windowed, n, fh, config_.sampleRate);
    }
    return 10.0f * std::log10(e / static_cast<float>(n) + 1e-12f);
  }

  // The analysis window as it was just before the strike (ends 2 hops before
  // the strike hop, so the attack is not in it).
  template <class Ring>
  void takeSnapshot(const Ring& ring, int n) noexcept {
    const std::size_t extra = 2 * static_cast<std::size_t>(config_.hopSize);
    ring.peekWindow(pre_.data(), static_cast<std::size_t>(n) + extra, static_cast<std::size_t>(config_.hopSize));
    (n == 4096 ? hann4096_ : n == 2048 ? hann2048_ : hann1024_).apply(pre_.data(), preWin_.data());
    preN_ = n;
    snapshotPending_ = false;
  }

  // How much a note's first three partials rose since the snapshot.
  float riseSinceStrike(const float* windowedNow, int n, int midi) const noexcept {
    if (preN_ != n) return 99.0f;  // no snapshot: treat as new (start of stream)
    return noteLevelDb(windowedNow, n, midi) - noteLevelDb(preWin_.data(), n, midi);
  }

  // MPM locks onto the composite period; stretched treble partials can make it
  // pick two periods (an octave low). If the "fundamental" and 3rd partial are
  // empty while the 2nd is strong, the note is really an octave up.
  float correctOctaveUp(const float* windowed, int n, float f) const noexcept {
    const int sr = config_.sampleRate;
    if (2.0f * f > 4500.0f) return f;
    const float e1 = Goertzel::magnitudeSquared(windowed, n, f, sr);
    const float e2 = Goertzel::magnitudeSquared(windowed, n, 2.0f * f, sr);
    const float e3 = (3.0f * f < 0.45f * static_cast<float>(sr)) ? Goertzel::magnitudeSquared(windowed, n, 3.0f * f, sr) : 0.0f;
    return (e2 > 10.0f * e1 && e2 > 10.0f * e3) ? 2.0f * f : f;
  }

  float overtoneRatio(const float* windowed, int n, int midi) const noexcept {
    const int sr = config_.sampleRate;
    float e[5] = {0, 0, 0, 0, 0};
    for (int h = 1; h <= 4; ++h) {
      const float fh = partialHz(midi, h);
      if (fh >= 0.45f * static_cast<float>(sr)) break;
      Goertzel::refinePeakHz(windowed, n, fh, sr, &e[h]);  // peak power near the partial
    }
    return (e[2] + e[3] + e[4]) / (e[1] + 1e-20f);
  }

  // Tuner-grade cents: refine the first partials' peaks (MPM itself reads a
  // stretched string sharp) and convert back to the fundamental.
  float fineCents(const float* windowed, int n, int midi) const noexcept {
    const int sr = config_.sampleRate;
    float sum = 0.0f;
    float sumW = 0.0f;
    for (int h = 1; h <= 3; ++h) {
      const float fh = partialHz(midi, h);
      if (fh >= 0.45f * static_cast<float>(sr)) break;
      float power = 0.0f;
      const float est = Goertzel::refinePeakHz(windowed, n, fh, sr, &power);
      const float w = std::sqrt(power);
      sum += w * 1200.0f * std::log2(est / fh);
      sumW += w;
    }
    return sumW > 0.0f ? sum / sumW : 0.0f;
  }

  void emit(std::vector<NoteEvent>& out, NoteEvent::Type type, int midi, float cents, float velocity, double tMs) const {
    out.push_back({type, midi, cents, velocity, tMs});
  }

  void refineKey(int midi, float cents) noexcept {
    if (!profile_.isCalibrated || std::fabs(cents) > 30.0f) return;
    profile_.keyFreqHz[static_cast<std::size_t>(midi)] *= std::pow(2.0f, config_.refineRate * cents / 1200.0f);
    auto& count = refineCount_[static_cast<std::size_t>(midi)];
    if (count < 255) ++count;
    if (profile_.keySource[static_cast<std::size_t>(midi)] == kKeyModel && count >= 3) {
      profile_.keySource[static_cast<std::size_t>(midi)] = kKeyRefined;
    }
    profileDirty_ = true;
  }

  // ---- free mode: ringing notes ---------------------------------------------------

  int findRinging(int midi) const noexcept {
    for (int i = 0; i < ringingCount_; ++i)
      if (ringing_[static_cast<std::size_t>(i)].midi == midi) return i;
    return -1;
  }

  bool wasRinging(int midi) const noexcept {
    for (int i = 0; i < snapCount_; ++i)
      if (snapMidis_[static_cast<std::size_t>(i)] == midi) return true;
    return findRinging(midi) >= 0;
  }

  void startRinging(int midi, float levelDb) noexcept {
    int idx = findRinging(midi);
    if (idx < 0) {
      if (ringingCount_ == kMaxRinging) --ringingCount_;  // forget the oldest
      for (int i = ringingCount_; i > 0; --i) ringing_[static_cast<std::size_t>(i)] = ringing_[static_cast<std::size_t>(i - 1)];
      ++ringingCount_;
      idx = 0;
    }
    ringing_[static_cast<std::size_t>(idx)] = {midi, levelDb};
  }

  // Drops notes that have died away; releases the active one when it does.
  void updateRinging(std::vector<NoteEvent>& out, double tMs) noexcept {
    int kept = 0;
    for (int i = 0; i < ringingCount_; ++i) {
      Ringing r = ringing_[static_cast<std::size_t>(i)];
      const float lvl = noteLevelDb(win1024_.data(), 1024, r.midi);
      r.peakDb = std::max(r.peakDb, lvl);
      if (lvl < r.peakDb - config_.releaseDropDb) {
        if (r.midi == activeMidi_) releaseMono(out, tMs);
        continue;
      }
      ringing_[static_cast<std::size_t>(kept++)] = r;
    }
    ringingCount_ = kept;
  }

  // Hann-windowed magnitude spectrum of the n samples ending `endOffset`
  // samples before the newest hop's end.
  template <class Ring>
  void magnitudeSpectrum(const Ring& ring, int n, std::size_t endOffset, float* mag) noexcept {
    ring.peekWindow(pre_.data(), static_cast<std::size_t>(n) + endOffset, static_cast<std::size_t>(config_.hopSize));
    (n == 4096 ? hann4096_ : hann2048_).apply(pre_.data(), windowed_.data());
    RealFft& fft = n == 4096 ? fft4096_ : fft2048_;
    fft.forward(windowed_.data(), specRe_.data(), specIm_.data());
    for (int k = 0; k <= n / 2; ++k) {
      const std::size_t kk = static_cast<std::size_t>(k);
      mag[kk] = std::sqrt(specRe_[kk] * specRe_[kk] + specIm_[kk] * specIm_[kk]);
    }
  }

  // Harmonic salience of one key: its first 8 partials, weighted 1/sqrt(h).
  // With `before`, only what grew since then counts (new energy). With
  // `blocked`, partials in blocked bins (another key's) are skipped.
  float keySalience(int n, const float* now, const float* before, int m, const uint8_t* blocked = nullptr) const noexcept {
    const float binHz = static_cast<float>(config_.sampleRate) / static_cast<float>(n);
    const int bins = n / 2;
    float s = 0.0f;
    for (int h = 1; h <= 8; ++h) {
      const int k = static_cast<int>(partialHz(m, h) / binHz);
      if (k + 1 >= bins) break;
      const std::size_t k0 = static_cast<std::size_t>(k), k1 = k0 + 1;
      if (blocked != nullptr && (blocked[k0] || blocked[k1])) continue;
      const float d = before != nullptr ? std::max(now[k0] - before[k0], now[k1] - before[k1]) : std::max(now[k0], now[k1]);
      if (d > 0.0f) s += d / std::sqrt(static_cast<float>(h));
    }
    return s;
  }

  // New-energy harmonic salience of every key: how much its partials grew
  // since the strike. The struck key collects all its partials; the octave
  // below only half of them (weighted lower), the octave above only the even
  // ones. Fills sal_; returns the best key (or -1), the strongest unrelated
  // competitor and the median (the floor).
  int newEnergySalience(int n, const float* now, const float* before, float& best, float& second, float& floor,
                        bool* restruck = nullptr) noexcept {
    if (restruck != nullptr) *restruck = false;
    int bestMidi = -1;
    best = 0.0f;
    const int lo = strict() ? profile_.lowestMidi : 21;
    const int hi = strict() ? profile_.highestMidi : 108;
    for (int m = lo; m <= hi; ++m) {
      const float s = keySalience(n, now, before, m);
      sal_[static_cast<std::size_t>(m)] = s;
      if (s > best) {
        best = s;
        bestMidi = m;
      }
    }
    // Competitors count only their own partials: those not shared with the
    // best key (octaves, fifths, thirds share some) and not its next-door
    // neighbours (they share its low partials' bins at this resolution).
    second = 0.0f;
    if (bestMidi >= 0) {
      std::fill(blocked_.begin(), blocked_.begin() + n / 2 + 1, uint8_t{0});
      const float binHz = static_cast<float>(config_.sampleRate) / static_cast<float>(n);
      for (int h = 1; h <= 32; ++h) {
        const int k = static_cast<int>(partialHz(bestMidi, h) / binHz);
        if (k + 2 >= n / 2) break;
        for (int j = std::max(0, k - 1); j <= k + 2; ++j) blocked_[static_cast<std::size_t>(j)] = 1;
      }
      for (int m = lo; m <= hi; ++m) {
        if (std::abs(m - bestMidi) <= 2) continue;
        second = std::max(second, keySalience(n, now, before, m, blocked_.data()));
      }
    }
    int count = 0;
    for (int m = lo; m <= hi; ++m) tmp_[static_cast<std::size_t>(count++)] = sal_[static_cast<std::size_t>(m)];
    std::nth_element(tmp_.begin(), tmp_.begin() + count / 2, tmp_.begin() + count);
    floor = tmp_[static_cast<std::size_t>(count / 2)];

    // A ringing note struck again: its own partials (those the winning key
    // does not share) got real new energy too. A new key struck over it adds
    // nothing there (the ringing note's own partials only decay; a new octave
    // adds nothing to its odd partials). For the octave, twelfth and double
    // octave, a genuinely new key also dominates its own bins (most of what is
    // in them is new); a re-strike's leftovers do not.
    for (int i = 0; i < snapCount_ && bestMidi >= 0; ++i) {
      const int r = snapMidis_[static_cast<std::size_t>(i)];
      if (r == bestMidi) {
        if (restruck != nullptr) *restruck = true;
        break;
      }
      const int d = bestMidi - r;
      const bool harmonic = d == 12 || d == 19 || d == 24;
      const float share = best / std::max(1e-9f, keySalience(n, now, nullptr, bestMidi));
      if (keySalience(n, now, before, r, blocked_.data()) >= 0.25f * best || (harmonic && share < 0.4f)) {
        bestMidi = r;
        best = sal_[static_cast<std::size_t>(r)];
        if (restruck != nullptr) *restruck = true;
        break;
      }
    }
    return bestMidi;
  }

  // Did this strike add real energy to key m's partials (not just noise
  // wiggles on a decaying sustain)? A hard strike on the note already playing
  // may add little net energy (the new vibration partly cancels the old one).
  bool hasNewEnergy(int n, const float* now, int m, float floor, bool sounding = false) const noexcept {
    const float added = sal_[static_cast<std::size_t>(m)];
    const bool hardStrikeOnActive = (sounding || m == activeMidi_) && strikeFlux_ >= 3.0f * strikeThreshold_;
    return added >= 4.0f * floor && added >= (hardStrikeOnActive ? 0.04f : 0.12f) * keySalience(n, now, nullptr, m);
  }

  // ---- free single-note mode --------------------------------------------------------

  template <class Ring>
  void processMono(const Ring& ring, std::vector<NoteEvent>& out, double tMs) noexcept {
    const int sr = config_.sampleRate;
    const std::size_t hop = static_cast<std::size_t>(config_.hopSize);
    hann1024_.apply(w1024_.data(), win1024_.data());
    if (snapshotPending_) {
      takeSnapshot(ring, 1024);
      snapCount_ = ringingCount_;
      for (int i = 0; i < ringingCount_; ++i) snapMidis_[static_cast<std::size_t>(i)] = ringing_[static_cast<std::size_t>(i)].midi;
      if (snapCount_ > 0) {
        // Spectra from just before the strike, for the new-energy salience.
        magnitudeSpectrum(ring, 2048, 2 * hop, preMag2048_.data());
        magnitudeSpectrum(ring, 4096, 2 * hop, preMag4096_.data());
      }
    }
    updateRinging(out, tMs);

    // Without a recent strike a ringing note cannot become another note.
    if (hopsSinceOnset_ > config_.onsetWindowHopsBass) {
      candidate_ = {};
      return;
    }
    if (snapCount_ > 0) {
      processOverlap(ring, out, tMs);
      return;
    }

    // Nothing was ringing: a single note out of silence. Plain MPM.
    MpmResult r;
    if (lastPeriod_ > 0.0f && hopsSinceOnset_ > 1) {
      r = mpm_.evaluateWarmTracking(w1024_.data(), 1024, lastPeriod_, sr, config_.mpmClarityShort);
      if (r.valid && r.frequency < 130.0f) r.valid = false;  // bass always uses the long window
    }
    int n = 1024;
    bool longWindow = false;
    if (!r.valid) {
      r = mpm_.analyze(w1024_.data(), 1024, sr, config_.mpmClarityShort);
      if (!r.valid || r.frequency < 130.0f) {
        ring.peekWindow(w4096_.data(), 4096, hop);
        r = mpm_.analyze(w4096_.data(), 4096, sr, config_.mpmClarityLong);
        longWindow = true;
        n = 4096;
      }
    }
    if (!r.valid) {
      candidate_ = {};
      lastPeriod_ = 0.0f;
      return;
    }
    lastPeriod_ = r.period;
    if (!longWindow) std::copy(w1024_.begin(), w1024_.end(), w4096_.begin());
    (n == 4096 ? hann4096_ : hann1024_).apply(w4096_.data(), windowed_.data());
    const float f = correctOctaveUp(windowed_.data(), n, r.frequency);
    const int midi = profile_.nearestKey(f);
    if (midi < 21 || midi > 108 || hopsSinceOnset_ > strikeWindowFor(midi) || findRinging(midi) >= 0) {
      candidate_ = {};
      return;
    }
    if (strict() && !profile_.inRange(midi)) {
      candidate_ = {};
      return;
    }
    const float rise = riseSinceStrike(win1024_.data(), 1024, midi);
    PIANO_CASCADE_TRACE("[t=%.0f]   hop+%d mpm f=%.1f -> %d rise %.1f dB\n", tMs, hopsSinceOnset_, f, midi, rise);
    if (rise < config_.newNoteRiseDb) {
      candidate_ = {};
      return;
    }
    const float* vbuf = w4096_.data();
    int vn = n;
    if (midi < 48 && n < 4096) {
      ring.peekWindow(w2048_.data(), 2048, hop);  // enough cycles to verify a bass note
      vbuf = w2048_.data();
      vn = 2048;
    }
    // Verify at the key's own pitch: MPM reads stretched treble strings sharp
    // (a whole bin, in the top octave), where an unwindowed Goertzel is near null.
    if (!Goertzel::verifyHarmonics(vbuf, vn, profile_.keyHz(midi), sr, config_.goertzelVerifyRatio, profile_.keyB(midi))) {
      PIANO_CASCADE_TRACE("[t=%.0f]   %d fails harmonic verification\n", tMs, midi);
      candidate_ = {};
      return;
    }
    const float cents = fineCents(windowed_.data(), n, midi);
    if (!countCandidate(midi, cents)) return;
    if (!passesGates(f, n, midi, cents, true)) {
      PIANO_CASCADE_TRACE("[t=%.0f]   %d fails a fingerprint gate (transient %d)\n", tMs, midi, isTransient(midi) ? 1 : 0);
      return;
    }
    confirm(out, tMs, midi, cents);
  }

  // Notes were ringing at the strike: find what the strike added.
  template <class Ring>
  void processOverlap(const Ring& ring, std::vector<NoteEvent>& out, double tMs) noexcept {
    if (hopsSinceOnset_ < 2) return;  // let the new strike fill the window first
    magnitudeSpectrum(ring, 2048, 0, nowMag2048_.data());
    float best = 0.0f, second = 0.0f, floor = 0.0f;
    int midi = newEnergySalience(2048, nowMag2048_.data(), preMag2048_.data(), best, second, floor);
    int n = 2048;
    bool ok = midi >= 0 && best >= 1.25f * second && hasNewEnergy(2048, nowMag2048_.data(), midi, floor);
    if (midi >= 0 && midi < 48) {
      // Bass partials sit a few bins apart even at 4096 samples, so salience
      // cannot pick a bass key; it only verifies. MPM proposes the key once the
      // long window holds enough of the strike.
      if (hopsSinceOnset_ < 8) return;
      magnitudeSpectrum(ring, 4096, 0, nowMag4096_.data());
      newEnergySalience(4096, nowMag4096_.data(), preMag4096_.data(), best, second, floor);
      ring.peekWindow(w4096_.data(), 4096, static_cast<std::size_t>(config_.hopSize));
      const MpmResult r = mpm_.analyze(w4096_.data(), 4096, config_.sampleRate, config_.mpmClarityLong);
      const int proposed = r.valid ? profile_.nearestKey(r.frequency) : -1;
      n = 4096;
      midi = proposed;
      ok = false;
      if (proposed >= 21 && proposed <= 108) {
        const float added = sal_[static_cast<std::size_t>(proposed)];
        // A ringing bass note struck again, or a new one; dense bass partials
        // raise the median, so the floor test is relaxed here.
        ok = added >= 2.0f * floor && added >= 0.04f * keySalience(4096, nowMag4096_.data(), nullptr, proposed) &&
             (wasRinging(proposed) || added >= 0.6f * best);
      }
      // magnitudeSpectrum left windowed_ = this window, Hann-windowed (fineCents needs it).
      hann4096_.apply(w4096_.data(), windowed_.data());
    }
    PIANO_CASCADE_TRACE("[t=%.0f]   hop+%d salience best %d (%.2f) second %.2f floor %.2f ok %d\n", tMs, hopsSinceOnset_, midi,
                        best, second, floor, ok ? 1 : 0);
    if (!ok) {
      candidate_ = {};
      return;
    }
    if (hopsSinceOnset_ > strikeWindowFor(midi)) {
      candidate_ = {};
      return;
    }
    // Struck again while ringing: decide once a clap or knock would have gone.
    const bool restrike = wasRinging(midi);
    if (restrike && hopsSinceOnset_ < config_.restrikeFirstHop) return;

    // A string's new energy holds (or builds while the window fills); a knock
    // or clap under the ringing notes dies within a few hops.
    const float added = sal_[static_cast<std::size_t>(midi)];
    if (candidate_.midi == midi && candidate_.onset == onsetSerial_ && added < 0.8f * candidateEnergy_) {
      candidate_ = {};
      return;
    }
    candidateEnergy_ = added;
    // windowed_ holds the Hann-windowed current window (magnitudeSpectrum).
    const float cents = fineCents(windowed_.data(), n, midi);
    if (!countCandidate(midi, cents)) return;
    if (!passesGates(profile_.keyHz(midi), n, midi, cents, !restrike)) return;
    confirm(out, tMs, midi, cents);
  }

  bool countCandidate(int midi, float cents) noexcept {
    if (candidate_.midi == midi && candidate_.onset == onsetSerial_ && std::fabs(cents - candidate_.cents) < 18.0f) {
      ++candidate_.count;
      candidate_.cents = cents;
    } else {
      candidate_ = {midi, 1, cents, onsetSerial_};
    }
    return candidate_.count >= config_.confirmHops && lastConfirmedOnset_ != onsetSerial_;
  }

  // Stage 3 fingerprint gates on a confirmed candidate. windowed_ holds the
  // Hann-windowed window of n samples the candidate was found in.
  bool passesGates(float f, int n, int midi, float cents, bool checkTone) const noexcept {
    if (checkTone && f < config_.overtoneGateSoftMaxHz) {
      float minRatio = strict() ? profile_.minOvertoneRatio : config_.minOvertoneRatio;
      if (f >= config_.overtoneGateMaxHz) minRatio *= 0.3f;  // high notes' overtones are weaker
      if (overtoneRatio(windowed_.data(), n, midi) < minRatio) return false;  // pure tone: whistle, sine
    }
    if (isTransient(midi)) return false;  // a knock or clap
    if (strict()) {
      const float window = profile_.keySource[static_cast<std::size_t>(midi)] == kKeyModel
                               ? config_.gridLockModelCents
                               : config_.gridLockMeasuredCents;
      if (std::fabs(cents) > window) return false;  // between the piano's keys: voice, other instrument
    }
    return true;
  }

  void confirm(std::vector<NoteEvent>& out, double tMs, int midi, float cents) noexcept {
    if (activeMidi_ >= 0) {
      emit(out, NoteEvent::NoteOff, activeMidi_, 0.0f, 0.0f, tMs);
    }
    activeMidi_ = midi;
    lastConfirmedOnset_ = onsetSerial_;
    candidate_ = {};
    startRinging(midi, noteLevelDb(win1024_.data(), 1024, midi));
    emit(out, NoteEvent::NoteOn, midi, cents, velocityFor(peakSinceOnsetDb_), tMs);
    refineKey(midi, cents);
  }

  void releaseMono(std::vector<NoteEvent>& out, double tMs) noexcept {
    if (activeMidi_ >= 0) {
      emit(out, NoteEvent::NoteOff, activeMidi_, 0.0f, 0.0f, tMs);
      activeMidi_ = -1;
    }
  }

  // ---- lesson mode: expected notes ----------------------------------------------

  template <class Ring>
  void processExpected(const Ring& ring, std::vector<NoteEvent>& out, double tMs) noexcept {
    const int sr = config_.sampleRate;
    bool needLong = false;
    for (int i = 0; i < expectedCount_; ++i) needLong |= expected_[static_cast<std::size_t>(i)] < 48;
    const int n = needLong ? 4096 : 2048;
    float* buf = needLong ? w4096_.data() : w2048_.data();
    ring.peekWindow(buf, static_cast<std::size_t>(n), static_cast<std::size_t>(config_.hopSize));
    if (snapshotPending_) {
      takeSnapshot(ring, n);
      snapCount_ = 0;
      magnitudeSpectrum(ring, 2048, 2 * static_cast<std::size_t>(config_.hopSize), preMag2048_.data());
    }
    poly_.scoreExpectedNotes(buf, n, sr, expected_.data(), expectedCount_, profile_, scores_.data());
    (needLong ? hann4096_ : hann2048_).apply(buf, windowed_.data());
    // Re-strikes are judged on the new energy since the strike, once a clap
    // or knock would have died away (a longer window needs longer to fill).
    const int restrikeFirst = config_.restrikeFirstHop * n / 2048;
    const int restrikeLast = config_.restrikeLastHop * n / 2048;
    bool haveNewEnergy = false;
    float best = 0.0f, second = 0.0f, floor = 0.0f;
    int bestMidi = -1;
    if (hopsSinceOnset_ >= restrikeFirst && hopsSinceOnset_ <= restrikeLast) {
      magnitudeSpectrum(ring, 2048, 0, nowMag2048_.data());
      bestMidi = newEnergySalience(2048, nowMag2048_.data(), preMag2048_.data(), best, second, floor);
      haveNewEnergy = true;
      // magnitudeSpectrum overwrote windowed_: restore this mode's window.
      (needLong ? hann4096_ : hann2048_).apply(buf, windowed_.data());
    }

    // This strike put new energy on m's own partials (not merely on partials
    // it shares with another key struck now).
    auto struckNow = [&](int m) {
      return haveNewEnergy && bestMidi >= 0 && hasNewEnergy(2048, nowMag2048_.data(), m, floor, true) &&
             (bestMidi == m || keySalience(2048, nowMag2048_.data(), preMag2048_.data(), m, blocked_.data()) >= 0.25f * best);
    };

    for (int i = 0; i < expectedCount_; ++i) {
      const std::size_t ii = static_cast<std::size_t>(i);
      const int m = expected_[ii];
      const std::size_t mm = static_cast<std::size_t>(m);
      const float score = scores_[ii].score;
      const bool fresh = hopsSinceOnset_ <= strikeWindowFor(m);
      if (fresh) {
        PIANO_CASCADE_TRACE("[t=%.0f]   hop+%d expected %d score %.2f rise %.1f on=%d\n", tMs, hopsSinceOnset_, m, score,
                            riseSinceStrike(windowed_.data(), n, m), noteOn_[mm] ? 1 : 0);
      }
      if (!noteOn_[mm]) {
        // Struck now: present, and its own partials rose with the strike or
        // took the strike's new energy (a note that was already ringing when
        // it became expected does neither).
        if (score >= config_.expectedOnScore && fresh &&
            (riseSinceStrike(windowed_.data(), n, m) >= config_.newNoteRiseDb || struckNow(m))) {
          if (++presentHops_[mm] >= config_.confirmHops && !isTransient(m)) {
            noteOn_[mm] = true;
            noteOnset_[mm] = onsetSerial_;
            absentHops_[mm] = 0;
            emit(out, NoteEvent::NoteOn, m, 0.0f, velocityFor(peakSinceOnsetDb_), tMs);
          }
        } else {
          presentHops_[mm] = 0;
        }
        continue;
      }
      // A re-strike can briefly cancel the ringing vibration: no release for a
      // low score until its re-strike window has passed.
      if (score < config_.expectedOffScore && hopsSinceOnset_ > restrikeLast) {
        if (++absentHops_[mm] >= config_.expectedOffHops) {
          noteOn_[mm] = false;
          presentHops_[mm] = 0;
          emit(out, NoteEvent::NoteOff, m, 0.0f, 0.0f, tMs);
        }
        continue;
      }
      absentHops_[mm] = 0;
      // Struck again while ringing.
      if (noteOnset_[mm] != onsetSerial_ && struckNow(m)) {
        noteOnset_[mm] = onsetSerial_;
        emit(out, NoteEvent::NoteOff, m, 0.0f, 0.0f, tMs);
        emit(out, NoteEvent::NoteOn, m, 0.0f, velocityFor(peakSinceOnsetDb_), tMs);
      }
    }
  }

  // ---- blind chords ---------------------------------------------------------------

  template <class Ring>
  void processBlind(const Ring& ring, std::vector<NoteEvent>& out, double tMs) noexcept {
    ring.peekWindow(w2048_.data(), 2048, static_cast<std::size_t>(config_.hopSize));
    snapshotPending_ = false;
    const auto chord = poly_.evaluateBlindChords(w2048_.data(), 2048, config_.sampleRate, 4);
    std::array<bool, 128> present{};
    for (const auto& c : chord) {
      if (c.midi >= 0 && c.midi < 128) present[static_cast<std::size_t>(c.midi)] = true;
    }
    for (int m = 21; m <= 108; ++m) {
      const std::size_t mm = static_cast<std::size_t>(m);
      if (present[mm]) {
        absentHops_[mm] = 0;
        if (!noteOn_[mm] && hopsSinceOnset_ <= strikeWindowFor(m) && ++presentHops_[mm] >= config_.confirmHops) {
          noteOn_[mm] = true;
          noteOnset_[mm] = onsetSerial_;
          emit(out, NoteEvent::NoteOn, m, 0.0f, velocityFor(peakSinceOnsetDb_), tMs);
        }
      } else {
        presentHops_[mm] = 0;
        if (noteOn_[mm] && ++absentHops_[mm] >= config_.expectedOffHops) {
          noteOn_[mm] = false;
          emit(out, NoteEvent::NoteOff, m, 0.0f, 0.0f, tMs);
        }
      }
    }
  }

  // ---- shared ---------------------------------------------------------------------

  void releaseAll(std::vector<NoteEvent>& out, double tMs) noexcept {
    releaseMono(out, tMs);
    ringingCount_ = 0;
    for (int m = 0; m < 128; ++m) {
      const std::size_t mm = static_cast<std::size_t>(m);
      if (noteOn_[mm]) {
        noteOn_[mm] = false;
        emit(out, NoteEvent::NoteOff, m, 0.0f, 0.0f, tMs);
      }
      presentHops_[mm] = 0;
      absentHops_[mm] = 0;
    }
  }

  // After a mode or expected-set change, drop notes the new mode no longer tracks.
  void releaseNotesNoLongerTracked(std::vector<NoteEvent>& out, double tMs) noexcept {
    if (expectedCount_ > 0 || config_.polyphonyEnabled) {
      releaseMono(out, tMs);
      ringingCount_ = 0;
    }
    for (int m = 0; m < 128; ++m) {
      const std::size_t mm = static_cast<std::size_t>(m);
      if (!noteOn_[mm]) continue;
      bool keep = config_.polyphonyEnabled && expectedCount_ == 0;
      for (int i = 0; i < expectedCount_; ++i) keep |= (expected_[static_cast<std::size_t>(i)] == m);
      if (!keep) {
        noteOn_[mm] = false;
        presentHops_[mm] = 0;
        absentHops_[mm] = 0;
        emit(out, NoteEvent::NoteOff, m, 0.0f, 0.0f, tMs);
      }
    }
  }

  CascadeConfig config_;
  PianoProfile profile_;
  Mpm mpm_;
  PolyEstimator poly_;
  OnsetDetector onset_;
  HannWindow hann1024_;
  HannWindow hann2048_;
  HannWindow hann4096_;

  std::vector<float> hop_;
  std::vector<float> w1024_;
  std::vector<float> w2048_;
  std::vector<float> w4096_;    // the candidate's window (raw or notched)
  std::vector<float> win1024_;  // Hann-windowed newest 1024 samples
  std::vector<float> windowed_; // Hann-windowed candidate window
  std::vector<float> pre_;      // raw pre-strike window (+2 hops)
  std::vector<float> preWin_;   // Hann-windowed pre-strike window
  RealFft fft2048_;
  RealFft fft4096_;
  std::vector<float> specRe_;
  std::vector<float> specIm_;
  std::vector<float> preMag2048_;  // spectra just before the strike
  std::vector<float> nowMag2048_;
  std::vector<float> preMag4096_;
  std::vector<float> nowMag4096_;
  std::array<float, 128> sal_{};
  std::array<float, 128> tmp_{};
  std::vector<uint8_t> blocked_ = std::vector<uint8_t>(2049, 0);

  // strike tracking
  int onsetSerial_{0};
  int hopsSinceOnset_{kFar};
  float peakSinceOnsetDb_{-120.0f};
  float peakHopSinceOnsetDb_{-120.0f};
  float preStrikeHopDb_{-120.0f};
  float postAttackDb_{-120.0f};
  std::array<float, 4> hopHist_{{-120.0f, -120.0f, -120.0f, -120.0f}};
  float levelDb_{-120.0f};
  float hopDb_{-120.0f};
  int silenceHops_{3};
  float strikeFlux_{0.0f};
  float strikeThreshold_{1.0f};
  bool snapshotPending_{false};
  int preN_{0};

  // free mode
  int activeMidi_{-1};
  Candidate candidate_{};
  float candidateEnergy_{0.0f};
  float lastPeriod_{0.0f};
  int lastConfirmedOnset_{-1};
  std::array<Ringing, kMaxRinging> ringing_{};
  int ringingCount_{0};
  std::array<int, kMaxRinging> snapMidis_{};
  int snapCount_{0};

  // lesson / chord modes
  std::array<int, kMaxExpected> expected_{};
  int expectedCount_{0};
  std::array<ExpectedScore, kMaxExpected> scores_{};
  std::array<bool, 128> noteOn_{};
  std::array<int, 128> noteOnset_{};
  std::array<int, 128> presentHops_{};
  std::array<int, 128> absentHops_{};
  bool releaseUntracked_{false};

  // online refinement
  std::array<uint8_t, 128> refineCount_{};
  bool profileDirty_{false};
};

} // namespace piano
