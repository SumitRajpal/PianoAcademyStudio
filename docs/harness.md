# The evaluation harness

Master section 5: nothing is tuned until recordings can be replayed through the engine and scored. The harness does that on a computer, for any engine, the same way every time. It lives in `packages/CoreEngine/tools/`. Spec: [Phase 0 harness](specs/phase-0-harness.md); decisions: [ADR 0004](adr/0004-evaluation-harness.md).

## Quick start

| Command | What it does |
| --- | --- |
| `npm run harness:test` | The harness's own tests: C++ (determinism, the scenario driver, WAV files) and Python (the scorer) |
| `npm run harness:check` | Renders the synthetic golden takes, replays them through v1.2, scores them, and fails if any take got worse than `tools/goldens/baseline.json` |
| `bash packages/CoreEngine/tools/harness.sh check --update` | Records a new baseline, after a change that is meant to improve the engine |
| `npm run harness:replay -- <take> --out <run>` | Replays one take |
| `bash packages/CoreEngine/tools/harness.sh corpus "$PIANO_CORPUS" <runs>` | Replays and scores every take in a folder |
| `npm run harness:score -- <takes> <runs> --out report.json` | Scores runs that already exist |

The C++ tools build themselves with `clang++` (or `$CXX`) into `tools/.build/`. The scorer needs Python 3 with `pip install -r packages/CoreEngine/tools/score/requirements.txt` (numpy, scipy and mir\_eval 0.8.2).

## Recordings stay outside git

The repository is public, and recordings of rooms hold speech and television. Real takes live in a folder outside the repository, named by the `PIANO_CORPUS` setting; only the synthetic golden takes, which are rendered on demand, belong to git.

## A take

A take is a folder:

| File | Holds |
| --- | --- |
| `audio.wav` | The microphone at 48 kHz: 16-bit, 24-bit or float, mono or averaged to mono |
| `labels.json` | `{"version": 1, "notes": [{"midi": 60, "onset": 1.234, "offset": 1.734, "velocity": 64, "releaseObservable": true}]}`; times in seconds, velocity as MIDI |
| `meta.json` | The conditions of 5.2: `instrument`, `phone`, `distance_m`, `placement`, `room`, `background`, `pedal`, `take` (which of 5.2's takes), `durationSec` |
| `expected.txt` | Lesson takes only: one line per change, a time in ms and the MIDI numbers expected from then on |
| `replay.args` | Runner options the take needs, such as `--polyphony` |

## The runner

`tools/replay` feeds a take through the engine hop by hop, as the phone's analysis loop does and as the scenario suite drives it: one 256-sample hop pushed, one processed, stream time (hop + 1) × 5.33 ms. The phone drops hops only after a stall; a replay never does. The same take and options always give byte-identical events, and a test checks that on every golden take.

It writes a run folder: `events.jsonl` (each NoteOn and NoteOff with its time and hop), `rejections.jsonl` (below) and `run.json` (the engine, the options, the computer's compute time per hop). `--engine legacy` is v1.2, the engine the app runs today; Reevo 2 joins behind the same options.

## The rejection log

For every candidate the cascade turns down, the log records the hop time, the candidate key (−1 when no key was found), the gate, the measured value and the threshold. The observer is null on the phone, so it costs nothing there, and a test checks that turning it on changes no decision.

| Gate | Where | Measured, against |
| --- | --- | --- |
| `onset` | A loud hop whose spectral flux reached half the strike threshold but not all of it, outside the 32 ms after a strike | Flux, against the threshold |
| `pitch` | Free play: McLeod pitch found no clear period; in the bass, no key to propose | Clarity, against 0.88 (1024 samples) or 0.80 (4096) |
| `key-range`, `calibrated-range` | The pitch lies outside A0–C8, or outside the calibrated keyboard | The key, against the edge |
| `strike-window` | The key's window after the strike had closed (64 ms; 150 ms below C3). In lessons: an expected key that never turned on in its window | Hops since the strike, against the window |
| `ringing` | Free single-note mode: the key is already ringing | — |
| `rise` | The key's first partials rose less than 6 dB since the strike | dB, against 6 |
| `harmonics` | Goertzel check: fundamental and second partial too small a share of the frame | Share, against 0.10 |
| `one-per-strike` | Free single-note mode: this strike already gave its note | — |
| `pure-tone` | Overtones too weak, as from a whistle | Overtone ratio, against its minimum |
| `transient` | A knock or clap: the sound fell back or died fast | Attack drop in dB, against 6 |
| `cents` | Calibrated: between two keys, as a voice or another instrument | Cents off, against 25 (measured keys) or 40 (model keys) |
| `new-energy`, `competitor`, `energy-faded` | Notes ringing at the strike: it added too little to the key, another key took more of it, or its energy died within a few hops | Salience, against what the test needs |
| `expected-score` | Lessons: the expected key's score stayed under its threshold | Score, against 0.12 |

Not logged: silence (hops under the energy gate), notes still confirming over their two hops, re-strikes waiting for a knock to die, and chord mode, whose blind estimator has no per-key gates.

Until master v1.7, section 5.5 listed the five-layer fingerprint of the Apex v2.0 design v1.2 came from ("range and ±22 cents, harmonic ratio, timbre similarity, dB window, stability"). v1.2's code has no timbre-similarity, dB-window or stability layer; its cents windows are 25 and 40; and it has gates that list didn't name (rise, transient, pure tone, one per strike, and the ringing-note tests). The log names the code's gates, and master v1.7 lists them too.

## The scorer

`tools/score/score.py` computes section 5.1's metrics:

- **Note accuracy:** precision, recall and F1 at 10, 20, 30 and 50 ms, with mir\_eval's onset matching on the same key.
- **Detection rate:** notes matched within 50 ms. **Heard at all:** matched within 250 ms. The difference is notes heard late, not missed.
- **False notes per hour:** detections that match no played note even 250 ms late: ghosts. A late note counts against the detection rate, not here.
- **Timestamp error:** detected minus true onset for notes matched within 50 ms: bias, spread, 95th percentile.
- **Decision latency on the computer:** the same, for every note heard. The phone's display latency adds its audio path, measured in slice 2.
- **Release accuracy:** the NoteOff within 50 ms or 20% of the note's length, whichever is larger, on release-observable notes.
- **Velocity:** the rank correlation of detected and labelled velocity. Error in dB needs each instrument's velocity-to-level curve, measured with the recordings.
- **Cells:** register (bass below C3, treble from C5), loudness (from labelled velocity), and each condition in `meta.json`.
- **Intervals:** bootstrap 95% intervals over takes (1,000 resamples, seed 1).
- **Why notes were missed:** each missed note's last rejection of its key near its onset; otherwise "late", or "no candidate" when nothing in the log explains it.

**Comparisons.** `compare` fails when a gate metric is worse than the baseline's 95% interval: 5.6's rule, for a recorded corpus of many takes. The golden takes use `compare --per-take`, which fails when any take has fewer notes on time or heard, or more ghost notes. Seven takes give intervals far too wide to catch a regression, and the golden takes are deterministic, so any loss is real. Raising v1.2's rise gate from 6 to 20 dB makes the interval rule pass and the per-take rule fail.

## The golden takes and v1.2's synthetic baseline

The golden takes are rendered by the scenario suite's synthesiser (`test/PianoSynth.h`): stretched partials, unison strings, a phone-microphone bass roll-off and room noise at −65 dBFS. The baseline is `tools/goldens/baseline.json` (4 November 2026).

| Take | What it plays | Notes | On time (50 ms) | Heard (250 ms) | Detections |
| --- | --- | --- | --- | --- | --- |
| scale | C4 to C6 and back, mf | 29 | 29 | 29 | 29 |
| lesson | the start of Jingle Bells, each note expected | 11 | 11 | 11 | 11 |
| ladder | C2, C4 and C6 at five levels from pp to ff | 45 | 30 | 43 | 43 |
| repeats | C4 at 4 and 8 per second, G2 at 4 per second | 24 | 16 | 23 | 23 |
| soft-under-loud | soft notes over a held loud C3 | 7 | 6 | 7 | 7 |
| chords | triads and octaves, chord mode on | 15 | 3 | 4 | 64 |
| noise | a whistle, a sung vowel, knocks and claps; no piano | 0 | 0 | 0 | 0 |

What it already shows about v1.2:

- **Single notes in the middle and treble are solid:** the scale and the lesson are perfect, and the noise take gives no false notes.
- **Bass notes are late, not missed:** 1 of 23 bass notes within 50 ms, but 21 heard within 250 ms. v1.2 waits for its 4096-sample window below C3.
- **Soft strikes can slip under the onset detector:** two pp strikes on the ladder left only "onset" near-misses.
- **Chord mode floods ghosts:** a C–E–G triad also gives keys such as F2, D2, B♭6 and B6; 64 detections for 15 notes.
- **Releases come late:** 23% within tolerance, because v1.2 ends a note once its partials fall 30 dB below their peak.

These are synthetic. v1.2's real baseline comes from your recordings (slice 3).
