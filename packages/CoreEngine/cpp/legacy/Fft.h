#pragma once

#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

namespace piano {

/**
 * In-place radix-2 complex FFT with precomputed twiddles and bit-reversal.
 * All memory is allocated in the constructor; transform() never allocates.
 */
class ComplexFft {
public:
  explicit ComplexFft(std::size_t size = 1024) { resize(size); }

  void resize(std::size_t size) {
    size_ = size;
    int levels = 0;
    while ((std::size_t{1} << levels) < size_) {
      ++levels;
    }
    bitRev_.assign(size_, 0);
    for (std::size_t i = 0; i < size_; ++i) {
      std::size_t rev = 0;
      for (int j = 0; j < levels; ++j) {
        if ((i >> j) & 1U) {
          rev |= std::size_t{1} << (levels - 1 - j);
        }
      }
      bitRev_[i] = rev;
    }
    cos_.assign(size_ / 2, 0.0f);
    sin_.assign(size_ / 2, 0.0f);
    for (std::size_t k = 0; k < size_ / 2; ++k) {
      const double a = 2.0 * M_PI * static_cast<double>(k) / static_cast<double>(size_);
      cos_[k] = static_cast<float>(std::cos(a));
      sin_[k] = static_cast<float>(std::sin(a));
    }
  }

  std::size_t size() const noexcept { return size_; }

  /** Forward (e^-i) or unscaled inverse (e^+i) transform of size() points. */
  void transform(float* re, float* im, bool inverse) const noexcept {
    const std::size_t n = size_;
    for (std::size_t i = 0; i < n; ++i) {
      const std::size_t j = bitRev_[i];
      if (i < j) {
        std::swap(re[i], re[j]);
        std::swap(im[i], im[j]);
      }
    }
    const float sign = inverse ? 1.0f : -1.0f;
    for (std::size_t len = 2; len <= n; len <<= 1) {
      const std::size_t half = len >> 1;
      const std::size_t step = n / len;
      for (std::size_t i = 0; i < n; i += len) {
        for (std::size_t j = 0; j < half; ++j) {
          const float wr = cos_[j * step];
          const float wi = sign * sin_[j * step];
          const std::size_t u = i + j;
          const std::size_t v = u + half;
          const float vr = re[v] * wr - im[v] * wi;
          const float vi = re[v] * wi + im[v] * wr;
          re[v] = re[u] - vr;
          im[v] = im[u] - vi;
          re[u] += vr;
          im[u] += vi;
        }
      }
    }
  }

private:
  std::size_t size_{0};
  std::vector<std::size_t> bitRev_;
  std::vector<float> cos_;
  std::vector<float> sin_;
};

/**
 * FFT of n real samples, computed with one complex FFT of n/2 points.
 * Produces bins 0..n/2 (inclusive). Never allocates after construction.
 */
class RealFft {
public:
  explicit RealFft(std::size_t n = 1024) { resize(n); }

  void resize(std::size_t n) {
    n_ = n;
    m_ = n / 2;
    cfft_.resize(m_);
    zr_.assign(m_, 0.0f);
    zi_.assign(m_, 0.0f);
    twr_.assign(m_ + 1, 0.0f);
    twi_.assign(m_ + 1, 0.0f);
    for (std::size_t k = 0; k <= m_; ++k) {
      const double a = 2.0 * M_PI * static_cast<double>(k) / static_cast<double>(n_);
      twr_[k] = static_cast<float>(std::cos(a));
      twi_[k] = static_cast<float>(-std::sin(a));
    }
  }

  std::size_t size() const noexcept { return n_; }
  std::size_t bins() const noexcept { return m_ + 1; }

  /** x: n real samples. outRe/outIm: n/2 + 1 bins each. */
  void forward(const float* x, float* outRe, float* outIm) noexcept {
    for (std::size_t i = 0; i < m_; ++i) {
      zr_[i] = x[2 * i];
      zi_[i] = x[2 * i + 1];
    }
    cfft_.transform(zr_.data(), zi_.data(), false);
    for (std::size_t k = 0; k <= m_; ++k) {
      const std::size_t a = (k == m_) ? 0 : k;
      const std::size_t b = (k == 0) ? 0 : m_ - k;
      // Even part: (Z[k] + conj(Z[m-k])) / 2. Odd part: (Z[k] - conj(Z[m-k])) / 2i.
      const float er = 0.5f * (zr_[a] + zr_[b]);
      const float ei = 0.5f * (zi_[a] - zi_[b]);
      const float orr = 0.5f * (zi_[a] + zi_[b]);
      const float oi = -0.5f * (zr_[a] - zr_[b]);
      outRe[k] = er + twr_[k] * orr - twi_[k] * oi;
      outIm[k] = ei + twr_[k] * oi + twi_[k] * orr;
    }
  }

private:
  std::size_t n_{0};
  std::size_t m_{0};
  ComplexFft cfft_;
  std::vector<float> zr_;
  std::vector<float> zi_;
  std::vector<float> twr_;
  std::vector<float> twi_;
};

/**
 * Hann-windowed magnitude spectrum of a real frame (used by the blind chord
 * estimator). Zero-pads when the input is shorter than the FFT size.
 */
class Fft {
public:
  explicit Fft(std::size_t size = 1024) { resize(size); }

  void resize(std::size_t size) {
    size_ = size;
    rfft_.resize(size_);
    frame_.assign(size_, 0.0f);
    re_.assign(size_ / 2 + 1, 0.0f);
    im_.assign(size_ / 2 + 1, 0.0f);
    mag_.assign(size_ / 2 + 1, 0.0f);
    hann_.assign(size_, 0.0f);
    for (std::size_t i = 0; i < size_; ++i) {
      hann_[i] = static_cast<float>(0.5 * (1.0 - std::cos(2.0 * M_PI * static_cast<double>(i) /
                                                         static_cast<double>(size_ - 1))));
    }
  }

  std::size_t size() const noexcept { return size_; }
  std::size_t bins() const noexcept { return size_ / 2 + 1; }

  void forward(const float* input, std::size_t inputSize) noexcept {
    const std::size_t count = std::min(inputSize, size_);
    if (count == size_) {
      for (std::size_t i = 0; i < size_; ++i) frame_[i] = input[i] * hann_[i];
    } else {
      for (std::size_t i = 0; i < count; ++i) {
        const float w = 0.5f * (1.0f - std::cos(2.0f * static_cast<float>(M_PI) * static_cast<float>(i) /
                                                static_cast<float>(count - 1)));
        frame_[i] = input[i] * w;
      }
      std::fill(frame_.begin() + static_cast<std::ptrdiff_t>(count), frame_.end(), 0.0f);
    }
    rfft_.forward(frame_.data(), re_.data(), im_.data());
    for (std::size_t k = 0; k < mag_.size(); ++k) {
      mag_[k] = std::sqrt(re_[k] * re_[k] + im_[k] * im_[k]);
    }
  }

  const float* magnitude() const noexcept { return mag_.data(); }

private:
  std::size_t size_{1024};
  RealFft rfft_;
  std::vector<float> frame_;
  std::vector<float> re_;
  std::vector<float> im_;
  std::vector<float> mag_;
  std::vector<float> hann_;
};

} // namespace piano
