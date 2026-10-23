// Regression suite for the note engine (v1.1).
//
// Realistic synthetic audio (PianoSynth.h) goes through the real Cascade and
// PianoCalibrator one 256-sample hop at a time, exactly as Engine::workerLoop
// drives them. Every check has a pass mark; the process exits non-zero when
// any check fails. Run: ./run.sh scenarios
//
// The pass marks come from the 2026-10-21 audit: they encode what v1.0 got
// wrong (repeated notes, chord flicker, calibration) so it cannot come back.

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <memory>
#include <random>
#include <string>
#include <vector>

#include "../shared/Calibration.h"
#include "../shared/Cascade.h"
#include "../shared/SampleRing.h"
#include "PianoSynth.h"

using namespace piano;
using Clock = std::chrono::steady_clock;

namespace {

constexpr int kSr = synth::kSampleRate;
constexpr int kHop = 256;
constexpr double kHopMs = 1000.0 * kHop / kSr;

int g_failed = 0;
int g_passed = 0;
PianoProfile g_stretchedProfile;
bool g_haveStretchedProfile = false;

void check(bool ok, const char* name, const char* fmt, ...) {
  char detail[512];
  va_list args;
  va_start(args, fmt);
  std::vsnprintf(detail, sizeof detail, fmt, args);
  va_end(args);
  std::printf("  [%s] %-46s %s\n", ok ? "PASS" : "FAIL", name, detail);
  (ok ? g_passed : g_failed)++;
}

const char* noteName(int m) {
  static char buf[16][8];
  static int idx = 0;
  static const char* n[] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
  char* b = buf[idx++ & 15];
  std::snprintf(b, 8, "%s%d", n[((m % 12) + 12) % 12], m / 12 - 1);
  return b;
}

double pct(std::vector<double> v, double p) {
  if (v.empty()) return 0;
  std::sort(v.begin(), v.end());
  return v[std::min(v.size() - 1, static_cast<std::size_t>(p * (v.size() - 1) + 0.5))];
}

struct Ev {
  int hop;
  NoteEvent e;
};

struct Run {
  std::vector<Ev> events;
  std::vector<double> hopUs;

  int ons(int midi = -1) const {
    int n = 0;
    for (auto& ev : events) n += (ev.e.type == NoteEvent::NoteOn && (midi < 0 || ev.e.midi == midi)) ? 1 : 0;
    return n;
  }
  int offs(int midi) const {
    int n = 0;
    for (auto& ev : events) n += (ev.e.type == NoteEvent::NoteOff && ev.e.midi == midi) ? 1 : 0;
    return n;
  }
  std::vector<int> onSequence() const {
    std::vector<int> s;
    for (auto& ev : events)
      if (ev.e.type == NoteEvent::NoteOn) s.push_back(ev.e.midi);
    return s;
  }
};

// Mirrors Engine::workerLoop: one hop pushed, one hop processed.
Run runCascade(const std::vector<float>& pcm, Cascade& cascade) {
  auto ring = std::make_unique<EngineRing>();
  std::vector<NoteEvent> evs;
  Run r;
  int hop = 0;
  for (std::size_t off = 0; off + kHop <= pcm.size(); off += kHop) {
    ring->push(pcm.data() + off, kHop);
    const auto t0 = Clock::now();
    cascade.processHop(*ring, evs, (hop + 1) * kHopMs);
    r.hopUs.push_back(std::chrono::duration<double, std::micro>(Clock::now() - t0).count());
    ring->consume(kHop);
    for (auto& e : evs) r.events.push_back({hop, e});
    ++hop;
  }
  return r;
}

std::string seqString(const std::vector<int>& s) {
  std::string out;
  for (int m : s) {
    out += noteName(m);
    out += ' ';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Units

void unitTests() {
  std::printf("\n== Units ==\n");
  {
    std::mt19937 rng(1);
    std::normal_distribution<float> g(0, 0.3f);
    std::vector<float> x(4096);
    for (std::size_t i = 0; i < x.size(); ++i) x[i] = g(rng) + 0.5f * std::sin(2 * M_PI * 220.0 * i / kSr);
    Mpm mpm(4096);
    float maxErr = 0;
    for (std::size_t W : {1024u, 4096u}) {
      mpm.analyze(x.data(), W, kSr, 0.5f);
      for (int tau = 0; tau < static_cast<int>(W / 2); tau += 3) {
        maxErr = std::max(maxErr, std::fabs(mpm.nsdf()[tau] - Mpm::nsdfAt(x.data(), W, tau)));
      }
    }
    check(maxErr < 1e-4f, "FFT NSDF equals direct NSDF", "max |diff| %.2e", maxErr);
    auto timeIt = [&](std::size_t W, int reps) {
      volatile float s = 0;
      const auto t0 = Clock::now();
      for (int i = 0; i < reps; ++i) s = s + mpm.analyze(x.data(), W, kSr, 0.8f).frequency;
      return std::chrono::duration<double, std::micro>(Clock::now() - t0).count() / reps;
    };
    const double t1024 = timeIt(1024, 200), t4096 = timeIt(4096, 100);
    check(t4096 < 1000.0, "MPM cost (v1.0: 318 / 3394 us)", "1024: %.0f us, 4096: %.0f us", t1024, t4096);
  }
  {
    auto ring = std::make_unique<EngineRing>();
    std::vector<float> chunk(EngineRing::kCapacity, 1.0f);
    const std::size_t written = ring->push(chunk.data(), chunk.size());
    check(written == EngineRing::kCapacity - EngineRing::kLookback, "ring keeps the lookback window",
          "accepted %zu of %zu", written, chunk.size());
    const std::size_t skipped = ring->dropStaleBacklog(kHop, 4);
    check(ring->available() < 2 * kHop && skipped % kHop == 0, "ring drops a stale backlog", "skipped %zu, left %zu",
          skipped, ring->available());
  }
  {
    PianoProfile p = PianoProfile::defaults();
    p.isCalibrated = true;
    p.lowestMidi = 36;
    p.highestMidi = 96;
    p.keyFreqHz[60] = 262.5f;
    p.keySource[60] = kKeyMeasured;
    PianoProfile q;
    const bool ok = PianoProfile::fromJson(p.toJson(), q);
    check(ok && q.isCalibrated && q.lowestMidi == 36 && std::fabs(q.keyFreqHz[60] - 262.5f) < 1e-3f &&
              q.keySource[60] == kKeyMeasured,
          "profile JSON round trip", "%s", ok ? "ok" : "parse failed");
    PianoProfile untouched;
    check(!PianoProfile::fromJson("{\"version\":2,\"oops\"", untouched), "profile JSON rejects garbage", "ok");
  }
}

// ---------------------------------------------------------------------------
// Free single-note mode

void allKeys(const PianoProfile* profile, bool phone, const char* label, int minCorrect) {
  std::printf("\n== 88 keys, free mode, %s ==\n", label);
  std::mt19937 rng(42);
  int correct = 0, extra = 0;
  std::vector<double> latB, latM, latT, us;
  std::string wrong, extraKeys;
  for (int m = 21; m <= 108; ++m) {
    auto pcm = synth::silence(1.4);
    synth::renderStrike(pcm, {m, 0.3, 1.1, 0.12, profile ? 0.0 : 0.0}, rng);
    if (phone) synth::phoneMic(pcm);
    synth::addNoise(pcm, -65.0, rng);
    Cascade c;
    if (profile != nullptr) c.setProfile(*profile);
    Run r = runCascade(pcm, c);
    us.insert(us.end(), r.hopUs.begin(), r.hopUs.end());
    const auto seq = r.onSequence();
    if (!seq.empty() && seq[0] == m) {
      ++correct;
      int firstHop = 0;
      for (auto& ev : r.events)
        if (ev.e.type == NoteEvent::NoteOn) {
          firstHop = ev.hop;
          break;
        }
      ((m < 48) ? latB : (m < 72 ? latM : latT)).push_back((firstHop + 1) * kHopMs - 300.0);
    } else {
      wrong += std::string(noteName(m)) + "->" + (seq.empty() ? std::string("none") : noteName(seq[0])) + " ";
    }
    if (seq.size() > 1) {
      extra += static_cast<int>(seq.size()) - 1;
      extraKeys += std::string(noteName(m)) + ":" + seqString(seq) + "| ";
    }
  }
  check(correct >= minCorrect, "first note correct", "%d/88 %s", correct, wrong.c_str());
  check(extra <= 2, "held notes stay one note (no flicker)", "%d extra NoteOns %s", extra, extraKeys.c_str());
  check(pct(latM, 0.5) <= 30.0 && pct(latT, 0.5) <= 20.0 && pct(latB, 0.5) <= 95.0, "strike-to-NoteOn latency p50",
        "bass %.1f ms, mid %.1f ms, treble %.1f ms", pct(latB, 0.5), pct(latM, 0.5), pct(latT, 0.5));
  check(pct(us, 0.95) < 1000.0, "per-hop CPU (v1.0 p95: 3518 us)", "p50 %.0f us, p95 %.0f us, max %.0f us",
        pct(us, 0.5), pct(us, 0.95), pct(us, 1.0));
}

// A scenario renders one random realization (seed) and says whether the
// engine got it right, with a short description of what it produced.
struct Outcome {
  bool ok;
  std::string what;
};
using Scenario = Outcome (*)(unsigned seed);

constexpr int kSeeds = 6;

void runScenario(const char* name, Scenario scenario, int needed) {
  int okCount = 0;
  std::string failures;
  for (int k = 0; k < kSeeds; ++k) {
    const Outcome o = scenario(1000u + 17u * static_cast<unsigned>(k));
    if (o.ok) {
      ++okCount;
    } else if (failures.size() < 160) {
      failures += "[" + o.what + "] ";
    }
  }
  check(okCount >= needed, name, "%d/%d ok %s", okCount, kSeeds, failures.c_str());
}

Run renderAndRun(const std::vector<synth::Strike>& strikes, double seconds, unsigned seed,
                 const std::vector<int>& expected = {}, void (*extra)(std::vector<float>&, std::mt19937&) = nullptr) {
  std::mt19937 rng(seed);
  auto pcm = synth::silence(seconds);
  for (const auto& st : strikes) synth::renderStrike(pcm, st, rng);
  if (extra != nullptr) extra(pcm, rng);
  synth::addNoise(pcm, -65.0, rng);
  Cascade c;
  if (!expected.empty()) c.setExpectedNotes(expected);
  return runCascade(pcm, c);
}

Outcome sequenceIs(const Run& r, const std::vector<int>& want) {
  return {r.onSequence() == want, seqString(r.onSequence())};
}

std::vector<synth::Strike> repeated(int midi, double gap, int times, double level) {
  std::vector<synth::Strike> v;
  const double end = 0.3 + times * gap + 0.3;
  for (int k = 0; k < times; ++k) v.push_back({midi, 0.3 + k * gap, end, level});
  return v;
}

void freeMode() {
  std::printf("\n== Free mode: repeated notes, trills, melodies (%d realizations each) ==\n", kSeeds);
  runScenario("C4 struck 4x, 0.25 s apart, key held (v1.0: 1)", [](unsigned seed) {
    return sequenceIs(renderAndRun(repeated(60, 0.25, 4, 0.12), 2.3, seed), {60, 60, 60, 60});
  }, 5);
  runScenario("C4 struck 4x, 0.5 s apart, key held", [](unsigned seed) {
    return sequenceIs(renderAndRun(repeated(60, 0.5, 4, 0.12), 3.3, seed), {60, 60, 60, 60});
  }, 5);
  runScenario("C2 struck 4x, 0.35 s apart, key held", [](unsigned seed) {
    return sequenceIs(renderAndRun(repeated(36, 0.35, 4, 0.12), 2.7, seed), {36, 36, 36, 36});
  }, 4);  // hardest case: a held, still-loud bass string struck again
  runScenario("C6 struck 4x, 0.3 s apart, key held", [](unsigned seed) {
    return sequenceIs(renderAndRun(repeated(84, 0.3, 4, 0.12), 2.5, seed), {84, 84, 84, 84});
  }, 5);
  runScenario("soft re-strike over a loud C4", [](unsigned seed) {
    return sequenceIs(renderAndRun({{60, 0.3, 1.8, 0.25}, {60, 0.8, 1.8, 0.06}}, 2.0, seed), {60, 60});
  }, 5);
  runScenario("trill C4-D4, 16 notes at 8/s", [](unsigned seed) {
    std::vector<synth::Strike> s;
    std::vector<int> want;
    for (int k = 0; k < 16; ++k) {
      s.push_back({k % 2 ? 62 : 60, 0.3 + k * 0.125, 0.3 + (k + 1) * 0.125, 0.12});
      want.push_back(k % 2 ? 62 : 60);
    }
    return sequenceIs(renderAndRun(s, 2.6, seed), want);
  }, 5);
  runScenario("melody with repeated notes (Mary had a little lamb)", [](unsigned seed) {
    const std::vector<int> mel{64, 62, 60, 62, 64, 64, 64, 62, 62, 62, 64, 67, 67};
    std::vector<synth::Strike> s;
    for (std::size_t k = 0; k < mel.size(); ++k) s.push_back({mel[k], 0.3 + k * 0.3, 0.3 + k * 0.3 + 0.27, 0.12});
    return sequenceIs(renderAndRun(s, 0.3 + mel.size() * 0.3 + 0.8, seed), mel);
  }, 5);
  runScenario("arpeggio with sustain pedal", [](unsigned seed) {
    const std::vector<int> mel{60, 64, 67, 72, 67, 64, 60};
    std::vector<synth::Strike> s;
    for (std::size_t k = 0; k < mel.size(); ++k) s.push_back({mel[k], 0.3 + k * 0.35, 3.2, 0.12});
    return sequenceIs(renderAndRun(s, 0.3 + mel.size() * 0.35 + 1.5, seed), mel);
  }, 5);
  runScenario("held C4 with claps and a knock over it", [](unsigned seed) {
    return sequenceIs(renderAndRun({{60, 0.3, 2.4, 0.12}}, 2.6, seed, {},
                                   [](std::vector<float>& pcm, std::mt19937& rng) {
                                     synth::handClap(pcm, 0.9, 0.3, rng);
                                     synth::handClap(pcm, 1.5, 0.15, rng);
                                     synth::tableKnock(pcm, 2.0, 0.2, rng);
                                   }),
                      {60});
  }, 6);
}

void lessonMode() {
  std::printf("\n== Lesson mode: expected notes (%d realizations each) ==\n", kSeeds);
  runScenario("single C4 held 2.7 s", [](unsigned seed) {
    const Run r = renderAndRun({{60, 0.3, 3.0, 0.12}}, 3.5, seed, {60});
    return Outcome{r.ons(60) == 1 && r.offs(60) == 1, "on " + std::to_string(r.ons(60)) + " off " + std::to_string(r.offs(60))};
  }, 6);
  runScenario("C-E-G triad held 2.2 s (v1.0: 16/6/5 NoteOns)", [](unsigned seed) {
    const Run r = renderAndRun({{60, 0.3, 2.5, 0.09}, {64, 0.3, 2.5, 0.09}, {67, 0.3, 2.5, 0.09}}, 3.0, seed, {60, 64, 67});
    return Outcome{r.ons(60) == 1 && r.ons(64) == 1 && r.ons(67) == 1, seqString(r.onSequence())};
  }, 5);
  runScenario("C3 alone, expecting C3 + C4 (v1.0: false C4)", [](unsigned seed) {
    const Run r = renderAndRun({{48, 0.3, 1.8, 0.12}}, 2.0, seed, {48, 60});
    return Outcome{r.ons(48) == 1 && r.ons(60) == 0, seqString(r.onSequence())};
  }, 6);
  runScenario("C3 + C4 octave, expecting both", [](unsigned seed) {
    const Run r = renderAndRun({{48, 0.3, 1.8, 0.12}, {60, 0.3, 1.8, 0.10}}, 2.0, seed, {48, 60});
    return Outcome{r.ons(48) == 1 && r.ons(60) == 1, seqString(r.onSequence())};
  }, 2);  // known limit: C4 sits on C3's 2nd partial; detection depends on their phase
  runScenario("E2 played, expecting F2 (bass semitone)", [](unsigned seed) {
    const Run r = renderAndRun({{40, 0.3, 1.8, 0.12}}, 2.0, seed, {41});
    return Outcome{r.ons(41) == 0, seqString(r.onSequence())};
  }, 6);
  runScenario("E4 struck 3x while expected", [](unsigned seed) {
    const Run r = renderAndRun(repeated(64, 0.4, 3, 0.12), 2.4, seed, {64});
    return Outcome{r.ons(64) == 3, seqString(r.onSequence())};
  }, 5);
}

void nonPiano() {
  std::printf("\n== Non-piano sounds, free mode (%d realizations each) ==\n", kSeeds);
  runScenario("whistle 1.2 kHz with vibrato (v1.0: 11 false notes)", [](unsigned seed) {
    const Run r = renderAndRun({}, 1.6, seed, {}, [](std::vector<float>& pcm, std::mt19937&) {
      synth::whistle(pcm, 0.3, 1.4, 1200.0, 0.05);
    });
    return Outcome{r.ons() == 0, seqString(r.onSequence())};
  }, 6);
  runScenario("sung vowel, gliding (v1.0: 8 false notes)", [](unsigned seed) {
    const Run r = renderAndRun({}, 1.6, seed, {}, [](std::vector<float>& pcm, std::mt19937&) {
      synth::sungVowel(pcm, 0.3, 1.4, 0.025);
    });
    return Outcome{r.ons() <= 1, seqString(r.onSequence())};
  }, 6);
  runScenario("3 table knocks (v1.0: 4 false notes)", [](unsigned seed) {
    const Run r = renderAndRun({}, 1.6, seed, {}, [](std::vector<float>& pcm, std::mt19937& rng) {
      for (int k = 0; k < 3; ++k) synth::tableKnock(pcm, 0.3 + 0.35 * k, 0.2, rng);
    });
    return Outcome{r.ons() == 0, seqString(r.onSequence())};
  }, 6);
  runScenario("3 hand claps", [](unsigned seed) {
    const Run r = renderAndRun({}, 1.6, seed, {}, [](std::vector<float>& pcm, std::mt19937& rng) {
      for (int k = 0; k < 3; ++k) synth::handClap(pcm, 0.3 + 0.35 * k, 0.3, rng);
    });
    return Outcome{r.ons() == 0, seqString(r.onSequence())};
  }, 6);
}


// ---------------------------------------------------------------------------
// Calibration, closed loop: a simulated user reads each event and strikes the
// key it shows (soft, then firm), letting notes ring until the next strike.

// Railsback-like stretch of a real piano's tuning (cents from equal temperament).
double stretchedCents(int m) { return m > 66 ? 0.017 * (m - 66) * (m - 66) : -0.016 * (66 - m) * (66 - m); }

struct CalUser {
  // Which key the user actually strikes for a prompt (default: the right one).
  int (*choose)(int prompted, int strike, int attempt) = nullptr;
  bool stretched = false;
  void (*extra)(std::vector<float>&, std::mt19937&) = nullptr;
};

struct CalRun {
  std::vector<CalibrationProgressEvent> events;
  std::vector<int> struck;  // keys struck, in order
  PianoProfile profile;
  bool done = false;
  int falseEvents = 0;      // strike results with no strike behind them
};

CalRun runCalibration(const CalibrationOptions& opts, unsigned seed, const CalUser& user = {}) {
  std::mt19937 rng(seed);
  auto pcm = synth::silence(90.0);
  if (user.extra != nullptr) user.extra(pcm, rng);
  std::normal_distribution<double> noise(0.0, std::pow(10.0, -62.0 / 20.0));
  auto ring = std::make_unique<EngineRing>();
  PianoCalibrator cal;
  cal.start(kSr, opts);
  CalRun out;
  double nextStrikeAt = -1.0;  // seconds; -1 = waiting for a prompt
  double lastStrikeAt = -10.0;
  int strikeNumber = 1, prompted = -1, attempts = 0;
  for (std::size_t off = 0; off + kHop <= pcm.size(); off += kHop) {
    const double now = static_cast<double>(off) / kSr;
    // Nothing happened 3 s after a strike: the user strikes again.
    if (nextStrikeAt < 0.0 && prompted >= 0 && now - lastStrikeAt > 3.0) nextStrikeAt = now;
    if (nextStrikeAt >= 0.0 && now >= nextStrikeAt) {
      const int key = user.choose != nullptr ? user.choose(prompted, strikeNumber, attempts) : prompted;
      // "Press, then release": the key is let go 0.7 s after the strike.
      synth::renderStrike(pcm, {key, now, now + 0.7, strikeNumber == 1 ? 0.06 : 0.2,
                                user.stretched ? stretchedCents(key) : 0.0}, rng);
      out.struck.push_back(key);
      lastStrikeAt = now;
      nextStrikeAt = -1.0;
      ++attempts;
    }
    for (std::size_t i = off; i < off + kHop; ++i) pcm[i] += static_cast<float>(noise(rng));
    ring->push(pcm.data() + off, kHop);
    CalibrationProgressEvent ev{};
    if (cal.processHop(*ring, ev)) {
      out.events.push_back(ev);
      if (ev.state >= kCalWaitStrike2 || ev.state == kCalWaitStrike1 || ev.state < 0) {
        if (ev.measuredMidi >= 0 && now - lastStrikeAt > 0.4) ++out.falseEvents;
      }
      if (ev.state == kCalAllDone) {
        out.done = true;
        break;
      }
      if (ev.state != kCalMeasuringNoise) {
        // Read the prompt, then strike after ~0.8 s.
        if (ev.currentMidi != prompted || ev.strikeNumber != strikeNumber) attempts = 0;
        prompted = ev.currentMidi;
        strikeNumber = ev.strikeNumber;
        nextStrikeAt = now + 0.8;
      }
    }
    ring->consume(kHop);
  }
  out.profile = cal.profile();
  return out;
}

void calibration() {
  std::printf("\n== Calibration (closed loop) ==\n");
  {
    const CalRun r = runCalibration({false, 21, 108}, 2001);
    std::array<int, PianoCalibrator::kMaxKeys> seq{};
    const int n = PianoCalibrator::buildSequence({false, 21, 108}, seq);
    std::vector<int> want;
    for (int i = 0; i < n; ++i) {
      want.push_back(seq[static_cast<std::size_t>(i)]);
      want.push_back(seq[static_cast<std::size_t>(i)]);
    }
    check(r.done && r.struck == want, "88 keys, fast: done with 2 strikes per key", "%s, %zu strikes (%s)",
          r.done ? "done" : "NOT done", r.struck.size(), seqString(r.struck).c_str());
    check(!r.events.empty() && r.events[0].state == kCalMeasuringNoise, "first event says: stay quiet", "state %d",
          r.events.empty() ? -99 : r.events[0].state);
    bool nextKeyShown = true;
    for (std::size_t i = 0; i + 1 < r.events.size(); ++i) {
      if (r.events[i].state == kCalKeyDone) nextKeyShown &= r.events[i].currentMidi != r.events[i].measuredMidi;
    }
    check(nextKeyShown, "'key done' shows the next key (v1.0: the finished one)", "%s", nextKeyShown ? "ok" : "stale key");
    check(r.falseEvents == 0, "no strikes taken from ringing (v1.0: 2, PDF v1.1: 35)", "%d", r.falseEvents);
    double maxCents = 0.0, maxBRatio = 0.0;
    std::string detail;
    for (const auto& e : r.events) {
      if (e.measuredMidi < 0 || (e.state != kCalWaitStrike2 && e.state != kCalKeyDone && e.state != kCalAllDone)) continue;
      maxCents = std::max(maxCents, std::fabs(static_cast<double>(e.centsOffset)));
      const double ratio = e.measuredB / synth::modelB(e.measuredMidi);
      maxBRatio = std::max(maxBRatio, std::fabs(std::log2(std::max(1e-9, ratio))));
      char b[48];
      std::snprintf(b, sizeof b, "%s %+.1fc B%.2fx; ", noteName(e.measuredMidi), e.centsOffset, ratio);
      detail += b;
    }
    check(maxCents <= 3.0, "measured pitch error (v1.0: up to 60 cents)", "max %.1f cents", maxCents);
    check(maxBRatio <= 1.0, "measured stiffness B within 2x (v1.0: up to 20x)", "worst %.1fx  %s", std::pow(2.0, maxBRatio),
          detail.c_str());
  }
  {
    const CalRun r = runCalibration({false, 36, 96}, 2002);
    bool hasC1 = false;
    for (int k : r.struck) hasC1 |= k < 36;
    check(r.done && !hasC1, "61-key keyboard: never asks below C2", "%s %s", r.done ? "done" : "NOT done", seqString(r.struck).c_str());
  }
  {
    CalUser u;
    u.choose = [](int prompted, int strike, int attempt) { return (prompted == 60 && strike == 1 && attempt == 0) ? 62 : prompted; };
    const CalRun r = runCalibration({false, 21, 108}, 2003, u);
    int wrong = -1;
    for (const auto& e : r.events)
      if (e.state == kCalWrongKey) wrong = e.detectedMidi;
    check(r.done && wrong == 62, "D4 struck when C4 was asked: reported, not measured", "detected %s, %s", wrong >= 0 ? noteName(wrong) : "none",
          r.done ? "then done" : "NOT done");
  }
  {
    CalUser u;
    u.choose = [](int prompted, int strike, int attempt) { return (prompted == 60 && strike == 1 && attempt == 0) ? 72 : prompted; };
    const CalRun r = runCalibration({false, 21, 108}, 2004, u);
    int wrong = -1;
    for (const auto& e : r.events)
      if (e.state == kCalWrongKey) wrong = e.detectedMidi;
    check(r.done && wrong == 72, "C5 struck when C4 was asked (octave)", "detected %s, %s", wrong >= 0 ? noteName(wrong) : "none",
          r.done ? "then done" : "NOT done");
  }
  {
    CalUser u;
    u.extra = [](std::vector<float>& pcm, std::mt19937&) { synth::whistle(pcm, 3.0, 4.2, 1200.0, 0.08); };
    const CalRun r = runCalibration({false, 21, 108}, 2005, u);
    check(r.done && r.falseEvents == 0, "whistle during calibration is not a strike", "%s, %d false", r.done ? "done" : "NOT done",
          r.falseEvents);
  }
  {
    CalUser u;
    u.stretched = true;
    const CalRun r = runCalibration({false, 21, 108}, 2006, u);
    double worst = 0.0;
    std::string detail;
    for (int m : {21, 28, 33, 40, 52, 57, 64, 77, 90, 96, 100, 104, 108}) {
      const double got = 1200.0 * std::log2(r.profile.keyFreqHz[static_cast<std::size_t>(m)] / synth::midiHz(m));
      const double err = got - stretchedCents(m);
      worst = std::max(worst, std::fabs(err));
      char b[40];
      std::snprintf(b, sizeof b, "%s %+.0f/%+.0f ", noteName(m), got, stretchedCents(m));
      detail += b;
    }
    check(r.done && worst <= 12.0, "stretched piano: model keys within 12 cents", "worst %.1f  %s", worst, detail.c_str());
    g_stretchedProfile = r.profile;
    g_haveStretchedProfile = r.done;
  }
}

// Calibrated detection on the stretched piano, strict gates on.
void calibratedDetection() {
  if (!g_haveStretchedProfile) calibration();
  std::printf("\n== Calibrated (strict) detection, stretched piano ==\n");
  std::mt19937 rng(77);
  int correct = 0;
  std::string wrong;
  for (int m = 21; m <= 108; ++m) {
    auto pcm = synth::silence(1.4);
    synth::renderStrike(pcm, {m, 0.3, 1.1, 0.12, stretchedCents(m)}, rng);
    synth::phoneMic(pcm);
    synth::addNoise(pcm, -65.0, rng);
    Cascade c;
    c.setProfile(g_stretchedProfile);
    const Run r = runCascade(pcm, c);
    const auto seq = r.onSequence();
    if (!seq.empty() && seq[0] == m && seq.size() == 1) {
      ++correct;
    } else {
      wrong += std::string(noteName(m)) + "->" + seqString(seq) + "| ";
    }
  }
  check(correct >= 86, "88 keys, phone mic, strict grid (PDF v1.1: 62)", "%d/88 %s", correct, wrong.c_str());
  auto silent = [&](void (*f)(std::vector<float>&, std::mt19937&)) {
    auto pcm = synth::silence(1.6);
    f(pcm, rng);
    synth::addNoise(pcm, -65.0, rng);
    Cascade c;
    c.setProfile(g_stretchedProfile);
    return runCascade(pcm, c).ons();
  };
  const int whistles = silent([](std::vector<float>& p, std::mt19937&) { synth::whistle(p, 0.3, 1.4, 1200.0, 0.05); });
  const int voice = silent([](std::vector<float>& p, std::mt19937&) { synth::sungVowel(p, 0.3, 1.4, 0.025); });
  const int knocks = silent([](std::vector<float>& p, std::mt19937& r) {
    for (int k = 0; k < 3; ++k) synth::tableKnock(p, 0.3 + 0.35 * k, 0.2, r);
  });
  check(whistles + voice + knocks <= 1, "non-piano sounds, calibrated", "whistle %d, voice %d, knocks %d", whistles, voice, knocks);
}

}  // namespace

int main(int argc, char** argv) {
  std::string only = argc > 1 ? argv[1] : "";
  // "harsh": the audit's synth, where unison strings start at random phases.
  if (only == "harsh" || (argc > 2 && std::string(argv[2]) == "harsh")) {
    synth::gRandomUnisonPhase = true;
    std::printf("(harsh synth: unison strings start at random phases)\n");
    if (only == "harsh") only = "";
  }
  auto want = [&](const char* k) { return only.empty() || only == k; };
  if (want("units")) unitTests();
  if (want("keys")) {
    allKeys(nullptr, false, "uncalibrated, flat mic", 87);
    allKeys(nullptr, true, "uncalibrated, phone mic", 87);
  }
  if (want("free")) freeMode();
  if (want("lesson")) lessonMode();
  if (want("noise")) nonPiano();
  if (want("cal")) calibration();
  if (want("calibrated")) calibratedDetection();
  std::printf("\n%d passed, %d failed\n", g_passed, g_failed);
  return g_failed == 0 ? 0 : 1;
}
