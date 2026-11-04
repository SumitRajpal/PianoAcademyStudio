#pragma once

// WAV files for the harness: reads PCM (16, 24, 32-bit) and float (32, 64-bit),
// plain or WAVE_FORMAT_EXTENSIBLE, any channel count (averaged to mono); writes
// mono 32-bit float. Little-endian hosts only (every desktop and phone).

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

namespace harness {

struct Audio {
  int sampleRate{0};
  int channels{0};
  int bitsPerSample{0};
  std::vector<float> samples;  // mono
};

namespace wav_detail {

inline uint16_t u16(const unsigned char* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }
inline uint32_t u32(const unsigned char* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) | (static_cast<uint32_t>(p[2]) << 16) |
         (static_cast<uint32_t>(p[3]) << 24);
}

inline std::vector<unsigned char> readAll(const std::string& path) {
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) throw std::runtime_error("cannot open " + path);
  std::vector<unsigned char> data;
  unsigned char buf[1 << 16];
  std::size_t n;
  while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) data.insert(data.end(), buf, buf + n);
  std::fclose(f);
  return data;
}

}  // namespace wav_detail

inline Audio readWav(const std::string& path) {
  using namespace wav_detail;
  const std::vector<unsigned char> d = readAll(path);
  if (d.size() < 12 || std::memcmp(d.data(), "RIFF", 4) != 0 || std::memcmp(d.data() + 8, "WAVE", 4) != 0) {
    throw std::runtime_error(path + " is not a WAV file");
  }
  Audio a;
  int format = 0;
  const unsigned char* data = nullptr;
  std::size_t dataBytes = 0;
  std::size_t pos = 12;
  while (pos + 8 <= d.size()) {
    const unsigned char* chunk = d.data() + pos;
    const std::size_t size = u32(chunk + 4);
    const std::size_t body = pos + 8;
    if (std::memcmp(chunk, "fmt ", 4) == 0 && size >= 16 && body + 16 <= d.size()) {
      format = u16(d.data() + body);
      a.channels = u16(d.data() + body + 2);
      a.sampleRate = static_cast<int>(u32(d.data() + body + 4));
      a.bitsPerSample = u16(d.data() + body + 14);
      if (format == 0xFFFE && size >= 40 && body + 26 <= d.size()) format = u16(d.data() + body + 24);  // sub-format
    } else if (std::memcmp(chunk, "data", 4) == 0) {
      data = d.data() + body;
      dataBytes = std::min(size, d.size() - body);
    }
    pos = body + size + (size & 1);  // chunks are padded to even sizes
  }
  if (!data || a.channels <= 0 || a.sampleRate <= 0) throw std::runtime_error(path + " has no audio");
  const int bytes = a.bitsPerSample / 8;
  if (!((format == 1 && (bytes == 2 || bytes == 3 || bytes == 4)) || (format == 3 && (bytes == 4 || bytes == 8)))) {
    throw std::runtime_error(path + ": unsupported WAV format " + std::to_string(format) + ", " +
                             std::to_string(a.bitsPerSample) + "-bit");
  }
  const std::size_t frames = dataBytes / static_cast<std::size_t>(bytes * a.channels);
  a.samples.resize(frames);
  for (std::size_t i = 0; i < frames; ++i) {
    double sum = 0.0;
    for (int c = 0; c < a.channels; ++c) {
      const unsigned char* s = data + (i * static_cast<std::size_t>(a.channels) + static_cast<std::size_t>(c)) * static_cast<std::size_t>(bytes);
      double v = 0.0;
      if (format == 3 && bytes == 4) {
        float f;
        std::memcpy(&f, s, 4);
        v = f;
      } else if (format == 3) {
        double g;
        std::memcpy(&g, s, 8);
        v = g;
      } else if (bytes == 2) {
        v = static_cast<int16_t>(u16(s)) / 32768.0;
      } else if (bytes == 3) {
        int32_t x = static_cast<int32_t>(s[0] | (s[1] << 8) | (s[2] << 16));
        if (x & 0x800000) x |= ~0xFFFFFF;
        v = x / 8388608.0;
      } else {
        v = static_cast<int32_t>(u32(s)) / 2147483648.0;
      }
      sum += v;
    }
    a.samples[i] = static_cast<float>(sum / a.channels);
  }
  return a;
}

/** Writes mono 32-bit float, so synthetic takes keep every bit the engine will read. */
inline void writeWav(const std::string& path, const std::vector<float>& x, int sampleRate) {
  std::FILE* f = std::fopen(path.c_str(), "wb");
  if (!f) throw std::runtime_error("cannot write " + path);
  const uint32_t dataBytes = static_cast<uint32_t>(x.size() * 4);
  auto put16 = [&](uint16_t v) { std::fwrite(&v, 2, 1, f); };
  auto put32 = [&](uint32_t v) { std::fwrite(&v, 4, 1, f); };
  std::fwrite("RIFF", 1, 4, f);
  put32(36 + dataBytes);
  std::fwrite("WAVEfmt ", 1, 8, f);
  put32(16);
  put16(3);  // IEEE float
  put16(1);
  put32(static_cast<uint32_t>(sampleRate));
  put32(static_cast<uint32_t>(sampleRate) * 4);
  put16(4);
  put16(32);
  std::fwrite("data", 1, 4, f);
  put32(dataBytes);
  std::fwrite(x.data(), 4, x.size(), f);
  std::fclose(f);
}

}  // namespace harness
