#pragma once

#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

#include "Fft.h"
#include "Goertzel.h"
#include "PianoProfile.h"

namespace piano {

struct ChordNote {
  int midi{0};
  float frequency{0.0f};
  float cents{0.0f};
  float salience{0.0f};
};

struct ExpectedScore {
  int midi{0};
  float score{0.0f};
};

/**
 * Stage 4 polyphonic estimator.
 *  1. Score-informed expected notes: Goertzel comb at each expected note's
 *     calibrated partials (lesson mode).
 *  2. Blind chords: Klapuri multiple-F0 harmonic summation with iterative
 *     spectral cancellation.
 */
class PolyEstimator {
public:
  explicit PolyEstimator(std::size_t fftSize = 2048)
      : fft_(fftSize),
        whitened_(fftSize / 2 + 1, 0.0f),
        residual_(fftSize / 2 + 1, 0.0f),
        hann2048_(2048),
        hann4096_(4096),
        windowed_(4096, 0.0f) {}

  /**
   * Scores each expected note on one window (N = 2048 or 4096) using the
   * calibrated key frequencies and string stiffness. A score near 0.7 is a
   * lone clean note; the cascade applies on/off thresholds with hysteresis.
   * Never allocates.
   */
  void scoreExpectedNotes(const float* x, int N, int sr, const int* notes, int count,
                          const PianoProfile& profile, ExpectedScore* out) noexcept {
    const HannWindow& hw = (N >= 4096) ? hann4096_ : hann2048_;
    const int n = hw.size();
    const float frameEnergy = hw.apply(x, windowed_.data());
    for (int i = 0; i < count; ++i) out[i] = {notes[i], 0.0f};
    if (frameEnergy < 1e-6f) return;
    const float norm = 1.0f / std::sqrt(static_cast<float>(n) * frameEnergy);

    for (int i = 0; i < count; ++i) {
      const int m = notes[i];
      if (m < 21 || m > 108) continue;
      const float f0 = profile.keyHz(m);
      const float B = profile.keyB(m);
      float a[4] = {0, 0, 0, 0};
      int strongest = 1;
      for (int h = 1; h <= 3; ++h) {
        const float fh = Goertzel::inharmonicPartial(f0, h, B);
        if (fh >= 0.45f * static_cast<float>(sr)) break;
        a[h] = std::sqrt(Goertzel::magnitudeSquared(windowed_.data(), n, fh, sr));
        if (a[h] > a[strongest]) strongest = h;
      }
      const float score = (a[1] + 0.5f * a[2] + 0.25f * a[3]) * norm;

      // The strongest low partial must be a real peak, not the skirt of an
      // adjacent semitone's partial. (Using the strongest partial, not only the
      // fundamental, keeps bass notes heard through a phone mic.)
      const float fh = Goertzel::inharmonicPartial(f0, strongest, B);
      const float delta = 0.35f * fh * (std::pow(2.0f, 1.0f / 12.0f) - 1.0f);
      const float eh = a[strongest] * a[strongest];
      const float eLower = Goertzel::magnitudeSquared(windowed_.data(), n, fh - delta, sr);
      const float eUpper = Goertzel::magnitudeSquared(windowed_.data(), n, fh + delta, sr);
      if (eh <= eLower || eh <= eUpper) continue;

      // Octave ambiguity: every partial of m is an even partial of m - 12.
      // When m - 12 is also expected, accept m only if those even partials
      // stand clearly above the envelope of m - 12's odd partials.
      bool lowerExpected = false;
      for (int j = 0; j < count; ++j) lowerExpected |= (notes[j] == m - 12);
      if (lowerExpected && !upperOctavePresent(m - 12, profile, sr, n)) continue;

      out[i].score = score;
    }
  }

  /**
   * Blind Polyphonic Mode (Klapuri multiple-F0 estimator).
   * 1. Whitens the spectrum with compression exponent nu = 0.33.
   * 2. Iteratively picks the most salient candidate and subtracts its harmonics.
   */
  std::vector<ChordNote> evaluateBlindChords(const float* x, int N, int sampleRate, int maxPolyphony = 4) noexcept {
    std::vector<ChordNote> detected;
    if (N < static_cast<int>(fft_.size())) return detected;

    fft_.forward(x, static_cast<std::size_t>(N));
    const float* mag = fft_.magnitude();
    const std::size_t numBins = fft_.bins();

    const float nu = 0.33f;
    float totalMag = 0.0f;
    for (std::size_t k = 0; k < numBins; ++k) {
      whitened_[k] = std::pow(mag[k] + 1e-8f, nu);
      residual_[k] = whitened_[k];
      totalMag += mag[k];
    }
    if (totalMag < 1e-4f) return detected;

    const float binWidth = static_cast<float>(sampleRate) / static_cast<float>(fft_.size());
    const float alpha = 52.0f;
    const float beta = 320.0f;

    for (int iter = 0; iter < maxPolyphony; ++iter) {
      float bestSalience = 0.0f;
      int bestMidi = -1;
      float bestF0 = 0.0f;
      for (int midi = 36; midi <= 96; ++midi) {
        bool alreadyFound = false;
        for (const auto& d : detected) {
          if (d.midi == midi) {
            alreadyFound = true;
            break;
          }
        }
        if (alreadyFound) continue;
        const float f0 = Goertzel::midiToFrequency(midi);
        float salience = 0.0f;
        const int maxPartials = std::min(8, static_cast<int>(4000.0f / f0));
        for (int m = 1; m <= maxPartials; ++m) {
          const float g = (f0 + alpha) / (static_cast<float>(m) * f0 + beta);
          const int centerBin = static_cast<int>(std::round(static_cast<float>(m) * f0 / binWidth));
          if (centerBin >= static_cast<int>(numBins) - 1) break;
          float maxBinVal = 0.0f;
          const int r = std::max(1, static_cast<int>(std::round(0.5f * f0 / binWidth)));
          const int kMin = std::max(1, centerBin - r);
          const int kMax = std::min(static_cast<int>(numBins) - 1, centerBin + r);
          for (int k = kMin; k <= kMax; ++k) maxBinVal = std::max(maxBinVal, residual_[k]);
          salience += g * maxBinVal;
        }
        if (salience > bestSalience) {
          bestSalience = salience;
          bestMidi = midi;
          bestF0 = f0;
        }
      }
      if (bestMidi < 0 || bestSalience < 0.25f) break;

      ChordNote cn;
      cn.midi = bestMidi;
      cn.frequency = bestF0;
      cn.cents = Goertzel::frequencyToCents(bestF0, bestMidi);
      cn.salience = bestSalience;
      detected.push_back(cn);

      const float d = 0.75f;
      const int maxPartials = std::min(8, static_cast<int>(4000.0f / bestF0));
      for (int m = 1; m <= maxPartials; ++m) {
        const int centerBin = static_cast<int>(std::round(static_cast<float>(m) * bestF0 / binWidth));
        if (centerBin >= static_cast<int>(numBins) - 1) break;
        const int r = std::max(1, static_cast<int>(std::round(0.5f * bestF0 / binWidth)));
        const int kMin = std::max(0, centerBin - r);
        const int kMax = std::min(static_cast<int>(numBins) - 1, centerBin + r);
        for (int k = kMin; k <= kMax; ++k) residual_[k] = std::max(0.0f, residual_[k] - d * whitened_[k]);
      }
    }
    return detected;
  }

private:
  // With the lower note L sounding alone, its even partials follow the
  // envelope of its odd ones: A(2) ~ sqrt(A(1) A(3)), A(4) ~ sqrt(A(3) A(5)).
  // The octave above adds energy exactly at those even partials.
  bool upperOctavePresent(int lower, const PianoProfile& profile, int sr, int n) const noexcept {
    const float f0 = profile.keyHz(lower);
    const float B = profile.keyB(lower);
    float A[6] = {0, 0, 0, 0, 0, 0};
    for (int h = 1; h <= 5; ++h) {
      const float fh = Goertzel::inharmonicPartial(f0, h, B);
      if (fh >= 0.45f * static_cast<float>(sr)) break;
      A[h] = std::sqrt(Goertzel::magnitudeSquared(windowed_.data(), n, fh, sr));
    }
    const float e2 = std::sqrt(A[1] * A[3]);
    const float e4 = std::sqrt(A[3] * A[5]);
    constexpr float kRise = 2.0f;  // +6 dB above the lower note's own envelope
    return A[2] > kRise * e2 || (A[4] > 0.0f && A[4] > kRise * e4 && A[2] > 1.5f * e2);
  }

  Fft fft_;
  std::vector<float> whitened_;
  std::vector<float> residual_;
  HannWindow hann2048_;
  HannWindow hann4096_;
  std::vector<float> windowed_;
};

} // namespace piano
