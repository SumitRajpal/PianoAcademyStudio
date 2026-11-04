#pragma once

// Synthetic test audio for the regression suite: piano strikes with 1-3
// detuned strings, stretched (inharmonic) partials that decay at different
// rates, a hammer thump and dampers; plus room noise, a phone-mic bass
// roll-off, and non-piano sounds (whistle, sung vowel, table knocks).

#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#include <algorithm>
#include <cmath>
#include <random>
#include <vector>

namespace synth {

constexpr int kSampleRate = 48000;

inline double midiHz(int m) { return 440.0 * std::pow(2.0, (m - 69) / 12.0); }

// Typical grand piano: least stiff around C3, stiffer into the treble and the wound bass.
inline double modelB(int m) {
  if (m >= 48) return 0.0002 * std::exp(0.045 * (m - 48));
  return 0.0002 * std::exp(0.03 * (48 - m));
}

struct Strike {
  int midi;
  double t;        // strike time (s)
  double release;  // key-up time (s); the damper then stops the string
  double level;    // peak amplitude of the fundamental (linear)
  double centsOffset = 0.0;  // detuning of this key on the test piano
};

// One hammer strikes all unison strings of a key at once, so they start in
// phase and drift apart slowly (beating). Set true for the harsher model the
// 2026-10-21 audit used: every string starts at a random phase.
inline bool gRandomUnisonPhase = false;

inline void renderStrike(std::vector<float>& out, const Strike& s, std::mt19937& rng) {
  const double f0 = midiHz(s.midi) * std::pow(2.0, s.centsOffset / 1200.0);
  const double B = modelB(s.midi);
  const int strings = s.midi < 34 ? 1 : (s.midi < 46 ? 2 : 3);
  const double tau0 = s.midi < 48 ? 2.2 : (s.midi < 72 ? 1.2 : 0.5);
  const int start = static_cast<int>(s.t * kSampleRate);
  const int rel = static_cast<int>(s.release * kSampleRate);
  const int end = std::min<int>(static_cast<int>(out.size()), rel + static_cast<int>(0.35 * kSampleRate));
  std::uniform_real_distribution<double> phase(0.0, 2.0 * M_PI);
  std::normal_distribution<double> gauss(0.0, 1.0);
  for (int h = 1; h <= 16; ++h) {
    const double fh = h * f0 * std::sqrt(1.0 + B * h * h);
    if (fh > 0.45 * kSampleRate) break;
    const double amp = s.level * std::pow(1.0 / h, 1.1);
    const double tauH = tau0 / (1.0 + 0.35 * (h - 1));
    const double partialPhase = phase(rng);
    for (int k = 0; k < strings; ++k) {
      const double detune = (k - (strings - 1) / 2.0) * 0.8;  // cents between unison strings
      const double w = 2.0 * M_PI * fh * std::pow(2.0, detune / 1200.0) / kSampleRate;
      const double ph = gRandomUnisonPhase ? phase(rng) : partialPhase;
      for (int i = start; i < end; ++i) {
        const double t = static_cast<double>(i - start) / kSampleRate;
        double env = std::exp(-t / tauH) * std::min(1.0, t / 0.002);
        if (i >= rel) env *= std::exp(-static_cast<double>(i - rel) / kSampleRate / 0.06);
        out[i] += static_cast<float>(amp / strings * env * std::sin(w * (i - start) + ph));
      }
    }
  }
  const int thump = static_cast<int>(0.004 * kSampleRate);
  for (int i = 0; i < thump && start + i < static_cast<int>(out.size()); ++i) {
    out[start + i] += static_cast<float>(0.12 * s.level * std::exp(-i / (0.0012 * kSampleRate)) * gauss(rng));
  }
}

inline std::vector<float> silence(double seconds) {
  return std::vector<float>(static_cast<std::size_t>(seconds * kSampleRate), 0.0f);
}

inline void addNoise(std::vector<float>& x, double dbfs, std::mt19937& rng) {
  std::normal_distribution<double> g(0.0, std::pow(10.0, dbfs / 20.0));
  for (auto& v : x) v += static_cast<float>(g(rng));
}

// 2nd-order Butterworth high-pass: a pessimistic phone-microphone bass roll-off.
inline void phoneMic(std::vector<float>& x, double fc = 100.0) {
  const double w0 = 2 * M_PI * fc / kSampleRate, cw = std::cos(w0);
  const double alpha = std::sin(w0) / (2 * 0.70710678);
  double b0 = (1 + cw) / 2, b1 = -(1 + cw), b2 = (1 + cw) / 2;
  const double a0 = 1 + alpha, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (auto& s : x) {
    const double y = b0 * s + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = s;
    y2 = y1;
    y1 = y;
    s = static_cast<float>(y);
  }
}

inline void whistle(std::vector<float>& x, double from, double to, double hz, double level) {
  double ph = 0;
  for (int i = static_cast<int>(from * kSampleRate); i < static_cast<int>(to * kSampleRate); ++i) {
    const double t = static_cast<double>(i) / kSampleRate;
    ph += 2 * M_PI * hz * std::pow(2.0, 20.0 * std::sin(2 * M_PI * 5.0 * t) / 1200.0) / kSampleRate;
    x[i] += static_cast<float>(level * std::sin(ph) * std::min(1.0, (t - from) / 0.05));
  }
}

// Vowel /a/ sung from G3 gliding up a semitone, with vibrato.
inline void sungVowel(std::vector<float>& x, double from, double to, double level) {
  double ph = 0;
  for (int i = static_cast<int>(from * kSampleRate); i < static_cast<int>(to * kSampleRate); ++i) {
    const double t = static_cast<double>(i) / kSampleRate;
    const double f0 = 196.0 * std::pow(2.0, (100.0 * (t - from) + 30.0 * std::sin(2 * M_PI * 5.5 * t)) / 1200.0);
    ph += 2 * M_PI * f0 / kSampleRate;
    double s = 0;
    for (int h = 1; h <= 20; ++h) {
      const double fh = h * f0;
      const double formants = 1.0 / (1 + std::pow((fh - 700) / 150, 2)) + 0.6 / (1 + std::pow((fh - 1200) / 180, 2)) +
                              0.25 / (1 + std::pow((fh - 2600) / 250, 2));
      s += (0.15 + formants) / h * std::sin(h * ph);
    }
    x[i] += static_cast<float>(level * s * std::min(1.0, (t - from) / 0.04));
  }
}

// Knuckle on a table: a short damped 90 Hz body resonance plus a click.
inline void tableKnock(std::vector<float>& x, double at, double level, std::mt19937& rng) {
  std::normal_distribution<double> g(0.0, 1.0);
  const int st = static_cast<int>(at * kSampleRate);
  for (int i = 0; i < static_cast<int>(0.12 * kSampleRate) && st + i < static_cast<int>(x.size()); ++i) {
    const double t = static_cast<double>(i) / kSampleRate;
    x[st + i] += static_cast<float>(level * std::exp(-t / 0.03) * std::sin(2 * M_PI * 90.0 * t) +
                                    0.25 * level * std::exp(-t / 0.002) * g(rng));
  }
}

inline void handClap(std::vector<float>& x, double at, double level, std::mt19937& rng) {
  std::normal_distribution<double> g(0.0, 1.0);
  const int st = static_cast<int>(at * kSampleRate);
  for (int i = 0; i < static_cast<int>(0.03 * kSampleRate) && st + i < static_cast<int>(x.size()); ++i) {
    x[st + i] += static_cast<float>(level * std::exp(-i / (0.006 * kSampleRate)) * g(rng));
  }
}

}  // namespace synth
