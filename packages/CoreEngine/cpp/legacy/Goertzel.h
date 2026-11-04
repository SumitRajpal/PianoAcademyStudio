#pragma once

#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace piano {

/** A precomputed Hann window, so per-hop code never calls cos() per sample. */
class HannWindow {
public:
  explicit HannWindow(int n = 1024) { resize(n); }
  void resize(int n) {
    w_.assign(static_cast<std::size_t>(n), 0.0f);
    for (int i = 0; i < n; ++i) {
      w_[static_cast<std::size_t>(i)] =
          static_cast<float>(0.5 * (1.0 - std::cos(2.0 * M_PI * i / static_cast<double>(n - 1))));
    }
  }
  int size() const noexcept { return static_cast<int>(w_.size()); }
  /** out[i] = x[i] * w[i]; returns the sum of x^2 (unwindowed frame energy). */
  float apply(const float* x, float* out) const noexcept {
    float energy = 0.0f;
    for (std::size_t i = 0; i < w_.size(); ++i) {
      out[i] = x[i] * w_[i];
      energy += x[i] * x[i];
    }
    return energy;
  }

private:
  std::vector<float> w_;
};

/**
 * Goertzel single-bin DFT resonator and harmonic partial verifier with piano
 * string inharmonicity modelling.
 */
class Goertzel {
public:
  /** Single-bin DFT power at fHz over N samples. */
  static float magnitudeSquared(const float* x, int N, float fHz, int sr) noexcept {
    if (N <= 0 || sr <= 0 || fHz <= 0.0f) return 0.0f;
    const float omega = 2.0f * static_cast<float>(M_PI) * fHz / static_cast<float>(sr);
    const float coeff = 2.0f * std::cos(omega);
    float s0 = 0.0f, s1 = 0.0f, s2 = 0.0f;
    for (int n = 0; n < N; ++n) {
      s0 = x[n] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const float magSq = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return (magSq > 0.0f) ? magSq : 0.0f;
  }

  /**
   * Hann-windowed single-bin DFT power (sidelobes below -31 dB).
   * Computes the window on the fly; prefer HannWindow + magnitudeSquared in loops.
   */
  static float magnitudeSquaredWindowed(const float* x, int N, float fHz, int sr) noexcept {
    if (N <= 1 || sr <= 0 || fHz <= 0.0f) return 0.0f;
    const float omega = 2.0f * static_cast<float>(M_PI) * fHz / static_cast<float>(sr);
    const float coeff = 2.0f * std::cos(omega);
    const float invN = 2.0f * static_cast<float>(M_PI) / static_cast<float>(N - 1);
    float s0 = 0.0f, s1 = 0.0f, s2 = 0.0f;
    for (int n = 0; n < N; ++n) {
      const float w = 0.5f * (1.0f - std::cos(static_cast<float>(n) * invN));
      s0 = (x[n] * w) + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const float magSq = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return (magSq > 0.0f) ? magSq : 0.0f;
  }

  /**
   * Refines a spectral peak near hz on a Hann-windowed buffer: three Goertzel
   * probes half a bin apart and a parabola through their log power. Returns
   * the refined frequency (hz itself when there is no peak) and its power.
   */
  static float refinePeakHz(const float* windowed, int N, float hz, int sr, float* outPower = nullptr) noexcept {
    const float delta = 0.5f * static_cast<float>(sr) / static_cast<float>(N);
    const float p0 = magnitudeSquared(windowed, N, hz, sr);
    const float pm = magnitudeSquared(windowed, N, std::max(1.0f, hz - delta), sr);
    const float pp = magnitudeSquared(windowed, N, hz + delta, sr);
    if (outPower != nullptr) *outPower = std::max(p0, std::max(pm, pp));
    const float l0 = std::log(p0 + 1e-20f);
    const float lm = std::log(pm + 1e-20f);
    const float lp = std::log(pp + 1e-20f);
    const float denom = lm - 2.0f * l0 + lp;
    if (denom >= -1e-9f) return hz;
    const float offset = std::clamp(0.5f * (lm - lp) / denom, -1.0f, 1.0f);
    return hz + offset * delta;
  }

  /**
   * Fletcher's piano string inharmonicity law:
   * f_h = h * f_0 * sqrt(1 + B * h^2)
   */
  static inline float inharmonicPartial(float f0, int h, float B = 0.0002f) noexcept {
    return static_cast<float>(h) * f0 * std::sqrt(1.0f + B * static_cast<float>(h * h));
  }

  /** Register-dependent inharmonicity estimate when nothing was calibrated. */
  static inline float inharmonicityCoeff(int midi, bool upright = false) noexcept {
    const float base = upright ? 0.0006f : 0.0002f;
    if (midi < 36) {
      return base * 2.5f;
    } else if (midi > 84) {
      return base * 3.0f;
    }
    return base;
  }

  static inline float midiToFrequency(int midi, float a4 = 440.0f) noexcept {
    return a4 * std::pow(2.0f, static_cast<float>(midi - 69) / 12.0f);
  }

  static inline int frequencyToMidi(float fHz, float a4 = 440.0f) noexcept {
    if (fHz <= 0.0f) return 0;
    return static_cast<int>(std::round(69.0f + 12.0f * std::log2(fHz / a4)));
  }

  static inline float frequencyToCents(float fHz, int midi, float a4 = 440.0f) noexcept {
    const float fNominal = midiToFrequency(midi, a4);
    if (fNominal <= 0.0f || fHz <= 0.0f) return 0.0f;
    return 1200.0f * std::log2(fHz / fNominal);
  }

  /**
   * Harmonic verification: Goertzel energy at the fundamental and the 2nd
   * partial (with inharmonicity), normalized by the frame energy.
   */
  static bool verifyHarmonics(const float* x, int N, float f0, int sr, float minRatio, float B = 0.0002f) noexcept {
    if (N <= 0 || f0 <= 0.0f) return false;
    float frameEnergy = 0.0f;
    for (int i = 0; i < N; ++i) {
      frameEnergy += x[i] * x[i];
    }
    if (frameEnergy < 1e-7f) return false;
    const float e1 = magnitudeSquared(x, N, inharmonicPartial(f0, 1, B), sr);
    const float e2 = magnitudeSquared(x, N, inharmonicPartial(f0, 2, B), sr);
    const float normE = (std::sqrt(e1) + 0.5f * std::sqrt(e2)) / std::sqrt(static_cast<float>(N) * frameEnergy);
    return normE >= minRatio;
  }
};

} // namespace piano
