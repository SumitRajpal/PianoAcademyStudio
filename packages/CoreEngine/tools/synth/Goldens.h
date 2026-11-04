#pragma once

// The synthetic golden takes: labelled recordings rendered by the scenario
// suite's piano synthesiser (test/PianoSynth.h), with its phone-microphone
// roll-off and room noise. They test the harness end to end and stand in for
// the golden recordings of master 5.6 until real ones exist. Deterministic:
// the same take always renders the same samples.

#include <algorithm>
#include <cmath>
#include <functional>
#include <random>
#include <string>
#include <utility>
#include <vector>

#include "../../test/PianoSynth.h"

namespace harness {

struct GoldenTake {
  std::string name;
  std::string description;
  double durationSec{0.0};
  unsigned seed{1};
  std::string background{"quiet"};
  bool polyphony{false};
  std::vector<synth::Strike> strikes;
  /** Lesson takes: from tMs on, these keys are expected. */
  std::vector<std::pair<double, std::vector<int>>> expected;
  /** Non-piano sounds. */
  std::function<void(std::vector<float>&, std::mt19937&)> extras;
};

inline GoldenTake take(std::string name, std::string description, double durationSec, unsigned seed,
                       std::string background = "quiet") {
  GoldenTake t;
  t.name = std::move(name);
  t.description = std::move(description);
  t.durationSec = durationSec;
  t.seed = seed;
  t.background = std::move(background);
  return t;
}

/** A strike's level as the MIDI velocity a label carries: 40 dB of range below full scale. */
inline int velocityFor(double level) {
  const double v = 127.0 * (1.0 + 20.0 * std::log10(level) / 40.0);
  return static_cast<int>(std::lround(std::clamp(v, 1.0, 127.0)));
}

inline std::vector<GoldenTake> goldenTakes() {
  std::vector<GoldenTake> takes;

  {
    GoldenTake t = take("scale", "C major, C4 to C6 and back, mf, 0.3 s apart", 0.0, 11);
    const int up[] = {60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84};
    std::vector<int> keys(std::begin(up), std::end(up));
    for (int i = 13; i >= 0; --i) keys.push_back(up[i]);
    double at = 0.5;
    for (int k : keys) {
      t.strikes.push_back({k, at, at + 0.26, 0.12});
      at += 0.3;
    }
    t.durationSec = at + 1.0;
    takes.push_back(t);
  }
  {
    GoldenTake t = take("ladder", "C2, C4 and C6 at five levels from pp to ff, three strikes each, 1 s apart", 0.0, 12);
    double at = 0.5;
    for (int k : {36, 60, 84}) {
      for (double level : {0.02, 0.05, 0.12, 0.3, 0.6}) {
        for (int i = 0; i < 3; ++i) {
          t.strikes.push_back({k, at, at + 0.6, level});
          at += 1.0;
        }
      }
    }
    t.durationSec = at + 1.0;
    takes.push_back(t);
  }
  {
    GoldenTake t = take("repeats", "C4 at 4 and 8 notes per second, G2 at 4 per second, 8 strikes each", 0.0, 13);
    double at = 0.5;
    for (auto [key, rate] : {std::pair{60, 4.0}, std::pair{60, 8.0}, std::pair{43, 4.0}}) {
      const double step = 1.0 / rate;
      for (int i = 0; i < 8; ++i) {
        t.strikes.push_back({key, at, at + 0.8 * step, 0.12});
        at += step;
      }
      at += 1.0;
    }
    t.durationSec = at + 1.0;
    takes.push_back(t);
  }
  {
    GoldenTake t = take("chords", "C4-E4-G4 triads and C3+C4 octaves, chord mode on", 10.0, 14);
    t.polyphony = true;
    for (double at : {0.5, 2.0, 3.5}) {
      for (int k : {60, 64, 67}) t.strikes.push_back({k, at, at + 1.0, 0.12});
    }
    for (double at : {5.0, 6.5, 8.0}) {
      for (int k : {48, 60}) t.strikes.push_back({k, at, at + 1.0, 0.12});
    }
    takes.push_back(t);
  }
  {
    GoldenTake t = take("soft-under-loud", "a loud C3 held while soft notes 1 to 19 semitones above it are played", 6.0, 15);
    t.strikes.push_back({48, 0.5, 5.0, 0.4});
    double at = 1.0;
    for (int up : {1, 2, 4, 7, 12, 19}) {
      t.strikes.push_back({48 + up, at, at + 0.4, 0.05});
      at += 0.6;
    }
    takes.push_back(t);
  }
  {
    GoldenTake t = take("noise", "no piano: a whistle, a sung vowel, table knocks and hand claps", 11.0, 16, "noise");
    t.extras = [](std::vector<float>& x, std::mt19937& rng) {
      synth::whistle(x, 2.0, 4.0, 1000.0, 0.05);
      synth::sungVowel(x, 5.0, 7.0, 0.05);
      synth::tableKnock(x, 8.0, 0.3, rng);
      synth::tableKnock(x, 8.6, 0.3, rng);
      synth::handClap(x, 9.5, 0.3, rng);
      synth::handClap(x, 10.0, 0.3, rng);
    };
    takes.push_back(t);
  }
  {
    GoldenTake t = take("lesson", "the start of Jingle Bells, each note expected from 150 ms before it", 0.0, 17);
    const int melody[] = {64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64};
    double at = 0.5;
    for (int k : melody) {
      t.expected.push_back({1000.0 * (at - 0.15), {k}});
      t.strikes.push_back({k, at, at + 0.35, 0.12});
      at += 0.45;
    }
    t.durationSec = at + 1.0;
    takes.push_back(t);
  }
  return takes;
}

/** The take's audio, rendered as the scenario suite renders its tests. */
inline std::vector<float> renderGolden(const GoldenTake& t) {
  std::mt19937 rng(t.seed);
  std::vector<float> pcm = synth::silence(t.durationSec);
  for (const auto& s : t.strikes) synth::renderStrike(pcm, s, rng);
  if (t.extras) t.extras(pcm, rng);
  synth::phoneMic(pcm);
  synth::addNoise(pcm, -65.0, rng);
  return pcm;
}

}  // namespace harness
