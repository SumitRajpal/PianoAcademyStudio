#pragma once

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <memory>
#include <vector>

#include "Fft.h"

namespace piano {

struct MpmResult {
  float frequency{0.0f};
  float clarity{0.0f};
  float period{0.0f};
  bool valid{false};
};

/**
 * McLeod Pitch Method (MPM): Normalized Square Difference Function (NSDF),
 * key-maximum peak picking and parabolic interpolation.
 *
 * v1.1: the NSDF autocorrelation is computed with a real FFT, O(W log W)
 * instead of O(W^2) (4096 samples: ~3.4 ms -> ~0.1 ms). All scratch memory
 * is allocated in the constructor; analyze() never allocates.
 */
class Mpm {
public:
  static constexpr std::size_t kMaxPeaks = 64;

  explicit Mpm(std::size_t maxWindow = 4096) : maxWindow_(maxWindow) {
    for (std::size_t w = 64; w <= maxWindow_; w <<= 1) {
      ffts_.push_back(std::make_unique<RealFft>(2 * w));
    }
    padded_.assign(2 * maxWindow_, 0.0f);
    re_.assign(maxWindow_ + 1, 0.0f);
    im_.assign(maxWindow_ + 1, 0.0f);
    re2_.assign(maxWindow_ + 1, 0.0f);
    im2_.assign(maxWindow_ + 1, 0.0f);
    power_.assign(2 * maxWindow_, 0.0f);
    nsdf_.assign(maxWindow_, 0.0f);
    prefix_.assign(maxWindow_ + 1, 0.0);
  }

  /**
   * Warm tracking: evaluates the NSDF only near the previous period.
   * A few microseconds; used while a note keeps sounding.
   */
  MpmResult evaluateWarmTracking(const float* x, std::size_t windowSize, float prevPeriod,
                                 int sampleRate, float clarityThreshold = 0.88f) const noexcept {
    MpmResult res;
    if (prevPeriod < 4.0f || windowSize > maxWindow_ || windowSize < 128) {
      return res;
    }
    const int targetLag = static_cast<int>(std::lround(prevPeriod));
    const int searchRange = std::max(2, static_cast<int>(std::lround(prevPeriod * 0.08f)));
    const int minLag = std::max(2, targetLag - searchRange);
    const int maxLag = std::min(static_cast<int>(windowSize / 2), targetLag + searchRange);
    if (minLag >= maxLag) return res;

    float bestVal = -1.0f;
    int bestLag = -1;
    for (int tau = minLag; tau <= maxLag; ++tau) {
      const float val = nsdfAt(x, windowSize, tau);
      if (val > bestVal) {
        bestVal = val;
        bestLag = tau;
      }
    }
    if (bestLag > minLag && bestLag < maxLag && bestVal >= clarityThreshold) {
      const float ym1 = nsdfAt(x, windowSize, bestLag - 1);
      const float yp1 = nsdfAt(x, windowSize, bestLag + 1);
      const float period = static_cast<float>(bestLag) + parabolicOffset(ym1, bestVal, yp1);
      if (period > 1.0f) {
        res.period = period;
        res.frequency = static_cast<float>(sampleRate) / period;
        res.clarity = bestVal;
        res.valid = true;
      }
    }
    return res;
  }

  /** Full MPM over a power-of-two window (64 .. maxWindow). */
  MpmResult analyze(const float* x, std::size_t windowSize, int sampleRate,
                    float clarityThreshold = 0.88f, float maxHz = 4500.0f) noexcept {
    MpmResult res;
    RealFft* fft = fftFor(windowSize);
    if (fft == nullptr) {
      return res;
    }
    computeNsdf(*fft, x, windowSize);

    const std::size_t maxLag = windowSize / 2;
    // Highest playable pitch -> shortest lag worth reporting.
    const float minLagF = static_cast<float>(sampleRate) / maxHz;

    // Key maxima: one per positive region, only after the NSDF first goes
    // negative. The scan starts at lag 1 so the top notes (C8: 11.5-sample
    // period) are not mistaken for their lower octave.
    int peakCount = 0;
    float maxClarity = 0.0f;
    bool seenNegative = false;
    float localMax = -1.0f;
    int localLag = -1;
    for (std::size_t tau = 1; tau < maxLag; ++tau) {
      const float v = nsdf_[tau];
      if (v <= 0.0f) {
        seenNegative = true;
        if (localLag > 0) {
          pushPeak(localLag, localMax, minLagF, peakCount, maxClarity);
        }
        localMax = -1.0f;
        localLag = -1;
      } else if (seenNegative && v > localMax) {
        localMax = v;
        localLag = static_cast<int>(tau);
      }
    }
    if (localLag > 0) {
      pushPeak(localLag, localMax, minLagF, peakCount, maxClarity);
    }

    res.clarity = maxClarity;
    if (peakCount == 0 || maxClarity < clarityThreshold) {
      return res;
    }

    // McLeod & Wyvill: the first key maximum within 90% of the best one
    // avoids sub-harmonic (octave-down) errors.
    const float relativeThreshold = maxClarity * 0.90f;
    int chosenLag = peaks_[0];
    for (int i = 0; i < peakCount; ++i) {
      if (nsdf_[peaks_[i]] >= relativeThreshold) {
        chosenLag = peaks_[i];
        break;
      }
    }

    const float ym1 = nsdf_[chosenLag - 1];
    const float y0 = nsdf_[chosenLag];
    const float yp1 = (chosenLag + 1 < static_cast<int>(maxLag)) ? nsdf_[chosenLag + 1] : y0;
    const float period = static_cast<float>(chosenLag) + parabolicOffset(ym1, y0, yp1);
    if (period > 1.0f) {
      res.period = period;
      res.frequency = static_cast<float>(sampleRate) / period;
      res.clarity = y0;
      res.valid = res.frequency >= 20.0f && res.frequency <= maxHz;
    }
    return res;
  }

  /** The NSDF computed by the last analyze() call (lags 0 .. W/2 - 1). */
  const float* nsdf() const noexcept { return nsdf_.data(); }

  /** Direct O(W) NSDF at one lag. Used by warm tracking and by tests. */
  static float nsdfAt(const float* x, std::size_t W, int tau) noexcept {
    float r = 0.0f;
    float m = 0.0f;
    const std::size_t limit = W - static_cast<std::size_t>(tau);
    for (std::size_t j = 0; j < limit; ++j) {
      const float a = x[j];
      const float b = x[j + static_cast<std::size_t>(tau)];
      r += a * b;
      m += a * a + b * b;
    }
    return (m > 1e-7f) ? (2.0f * r / m) : 0.0f;
  }

private:
  static float parabolicOffset(float ym1, float y0, float yp1) noexcept {
    const float denom = 2.0f * (2.0f * y0 - ym1 - yp1);
    if (std::fabs(denom) <= 1e-6f) return 0.0f;
    return std::clamp((yp1 - ym1) / denom, -0.5f, 0.5f);
  }

  void pushPeak(int lag, float value, float minLagF, int& count, float& maxClarity) noexcept {
    if (static_cast<float>(lag) < minLagF - 0.5f || count >= static_cast<int>(kMaxPeaks)) {
      return;
    }
    peaks_[count++] = lag;
    maxClarity = std::max(maxClarity, value);
  }

  RealFft* fftFor(std::size_t windowSize) noexcept {
    std::size_t w = 64;
    for (auto& fft : ffts_) {
      if (w == windowSize) return fft.get();
      w <<= 1;
    }
    return nullptr;
  }

  // NSDF(tau) = 2 r(tau) / m(tau), with r from the power spectrum of the
  // zero-padded window and m from prefix sums of x^2.
  void computeNsdf(RealFft& fft, const float* x, std::size_t W) noexcept {
    const std::size_t n = 2 * W;
    std::copy(x, x + W, padded_.begin());
    std::fill(padded_.begin() + static_cast<std::ptrdiff_t>(W),
              padded_.begin() + static_cast<std::ptrdiff_t>(n), 0.0f);
    fft.forward(padded_.data(), re_.data(), im_.data());
    for (std::size_t k = 0; k <= W; ++k) {
      power_[k] = re_[k] * re_[k] + im_[k] * im_[k];
    }
    for (std::size_t k = 1; k < W; ++k) {
      power_[n - k] = power_[k];
    }
    // The spectrum is real and even, so its forward FFT is n * autocorrelation.
    fft.forward(power_.data(), re2_.data(), im2_.data());

    prefix_[0] = 0.0;
    for (std::size_t i = 0; i < W; ++i) {
      prefix_[i + 1] = prefix_[i] + static_cast<double>(x[i]) * static_cast<double>(x[i]);
    }
    const double total = prefix_[W];
    const float invN = 1.0f / static_cast<float>(n);
    const std::size_t maxLag = W / 2;
    for (std::size_t tau = 0; tau < maxLag; ++tau) {
      const double m = prefix_[W - tau] + (total - prefix_[tau]);
      const float r = re2_[tau] * invN;
      nsdf_[tau] = (m > 1e-7) ? static_cast<float>(2.0 * static_cast<double>(r) / m) : 0.0f;
    }
  }

  std::size_t maxWindow_{4096};
  std::vector<std::unique_ptr<RealFft>> ffts_;
  std::vector<float> padded_;
  std::vector<float> re_;
  std::vector<float> im_;
  std::vector<float> re2_;
  std::vector<float> im2_;
  std::vector<float> power_;
  std::vector<float> nsdf_;
  std::vector<double> prefix_;
  int peaks_[kMaxPeaks]{};
};

} // namespace piano
