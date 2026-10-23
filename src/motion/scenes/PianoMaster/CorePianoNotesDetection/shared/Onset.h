#pragma once

#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <vector>

#include "Fft.h"

namespace piano {

struct OnsetResult {
  bool onset{false};
  float flux{0.0f};
  float threshold{0.0f};
};

/**
 * Hammer-strike onset detector (v1.1 "hammer transient" layer).
 *
 * Spectral flux on a 512-sample Hann frame per 256-sample hop: the sum of
 * log-magnitude increases over the previous frame, with the previous frame
 * max-filtered across 3 bins so beating partials and vibrato do not count
 * as new energy. A strike adds energy across many bins at once, including a
 * re-strike of a note that is still ringing. Decays never count.
 *
 * The threshold adapts to the recent flux, so a sustained chord (or room
 * noise) raises the bar instead of firing repeatedly.
 */
class OnsetDetector {
public:
  static constexpr std::size_t kFrame = 512;
  static constexpr std::size_t kBins = kFrame / 2 + 1;
  static constexpr int kHistory = 12;

  struct Config {
    float logGain{10.0f};        // log(1 + gain * |X|) compression
    float relativeFactor{2.2f};  // flux must exceed this x the recent mean
    float absoluteFloor{10.0f};  // and this absolute floor (log-magnitude units; real strikes measure 15+)
    int refractoryHops{6};       // ~32 ms between onsets
    // A 512-sample frame holds less than one period below ~100 Hz, so the
    // lowest bins fluctuate on a sustained bass note. The hammer's attack is
    // broadband, so ignoring them loses nothing.
    std::size_t minBin{3};       // ~280 Hz
    std::size_t maxBin{214};     // ~20 kHz
  };

  OnsetDetector() : fft_(kFrame) {
    for (std::size_t i = 0; i < kFrame; ++i) {
      window_[i] = static_cast<float>(0.5 * (1.0 - std::cos(2.0 * M_PI * static_cast<double>(i) /
                                                           static_cast<double>(kFrame - 1))));
    }
    reset();
  }

  void setConfig(const Config& cfg) noexcept { config_ = cfg; }

  void reset() noexcept {
    prev_.fill(0.0f);
    history_.fill(0.0f);
    histCount_ = 0;
    histPos_ = 0;
    refractory_ = 0;
    primed_ = false;
  }

  /**
   * Sets the reference frame only (no flux, no threshold history, no
   * refractory): used when the cascade skipped silent hops, so the next
   * strike is measured against the quiet frame just before it.
   */
  void prime(const float* frame) noexcept {
    for (std::size_t i = 0; i < kFrame; ++i) buf_[i] = frame[i] * window_[i];
    fft_.forward(buf_.data(), re_.data(), im_.data());
    for (std::size_t k = 0; k < kBins; ++k) {
      prev_[k] = std::log1p(config_.logGain * std::sqrt(re_[k] * re_[k] + im_[k] * im_[k]));
    }
    primed_ = true;
  }

  /** frame: the newest kFrame samples (ending at the newest hop). */
  OnsetResult process(const float* frame) noexcept {
    for (std::size_t i = 0; i < kFrame; ++i) {
      buf_[i] = frame[i] * window_[i];
    }
    fft_.forward(buf_.data(), re_.data(), im_.data());
    const std::size_t maxBin = std::min(config_.maxBin, kBins - 2);
    for (std::size_t k = 0; k < kBins; ++k) {
      cur_[k] = std::log1p(config_.logGain * std::sqrt(re_[k] * re_[k] + im_[k] * im_[k]));
    }

    float flux = 0.0f;
    if (primed_) {
      for (std::size_t k = std::max<std::size_t>(1, config_.minBin); k <= maxBin; ++k) {
        const float ref = std::max(prev_[k - 1], std::max(prev_[k], prev_[k + 1]));
        const float d = cur_[k] - ref;
        if (d > 0.0f) flux += d;
      }
    }
    prev_ = cur_;
    primed_ = true;

    float mean = 0.0f;
    for (int i = 0; i < histCount_; ++i) mean += history_[i];
    mean = histCount_ > 0 ? mean / static_cast<float>(histCount_) : 0.0f;
    const float threshold = std::max(config_.absoluteFloor, config_.relativeFactor * mean);

    OnsetResult r;
    r.flux = flux;
    r.threshold = threshold;
    if (refractory_ > 0) {
      --refractory_;
    } else if (histCount_ >= 3 && flux > threshold) {
      r.onset = true;
      refractory_ = config_.refractoryHops;
    }

    history_[histPos_] = flux;
    histPos_ = (histPos_ + 1) % kHistory;
    histCount_ = std::min(histCount_ + 1, kHistory);
    return r;
  }

private:
  Config config_{};
  RealFft fft_;
  std::array<float, kFrame> window_{};
  std::array<float, kFrame> buf_{};
  std::array<float, kBins> re_{};
  std::array<float, kBins> im_{};
  std::array<float, kBins> cur_{};
  std::array<float, kBins> prev_{};
  std::array<float, kHistory> history_{};
  int histCount_{0};
  int histPos_{0};
  int refractory_{0};
  bool primed_{false};
};

} // namespace piano
