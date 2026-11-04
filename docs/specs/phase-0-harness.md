# Feature: Phase 0, the evaluation harness

- **Status:** Slice 1 built on 4 November 2026 on `claude/chore-setup`. Approved the same day with every recommendation: the Python scorer with mir\_eval (1a), recordings outside the repository (2a), and a developer recording mode in the app for slice 2 (3a)
- **Owner's request:** 4 November 2026: "Reshape then Harness": migration steps 1 and 2 (built), then the engine's Phase 0 harness. Master section 5: "Nothing is tuned until a labelled recording corpus and an offline test harness exist. Phase 0 builds both and measures v1.2, which becomes the bar every later phase must beat."

## Goal

Measure before tuning. Any recording replays through the engine on a computer exactly as it would on the phone, and a scorer reports the master's metrics (5.1) with confidence intervals. v1.2's numbers become the bar for Reevo 2, and v1.2's rejection log says why it misses the notes it misses.

## What Phase 0 needs, and who does it

| Part | Master | Who | Slice |
| --- | --- | --- | --- |
| Desktop runner: any recording through any engine and configuration, deterministic | 5.6 | Claude | 1 |
| Rejection log in v1.2: for every candidate and every missed expected note, the gate that rejected it, with the measured value against its threshold | 5.5 | Claude | 1 |
| Scorer: every 5.1 metric that a recording can show, bootstrap confidence intervals over takes, and a comparison against a baseline | 5.1, 5.6 | Claude | 1 |
| Synthetic takes from the engine's test synthesiser, as golden recordings until real ones exist | 5.6 | Claude | 1 |
| A take recorder in the app (developer mode): the mic exactly as the engine hears it, plus its live events, commands and rejections | 5.3, 5.7 | Claude; checked on your iPhone | 2 |
| The PSR-E343 self-play rig: a computer plays MIDI files over USB and logs them; sync notes found by matched filtering and the clocks fitted | 5.3 | Claude builds the tools; you run them | 3 |
| Recording sessions (the 13 takes of 5.2 over the covering array) and the acoustic piano's labels | 5.2–5.4 | You, with the tools | 3 |
| v1.2's baseline metrics and its miss-cause histogram | 5.5, 5.7 | Claude, from your recordings | 3 |

This spec asks to build slice 1 now. Slices 2 and 3 get their own approval when slice 1 is done.

## Slice 1 design

- **Where:** `packages/CoreEngine/tools/`. Phase 1's layout puts the desktop harness there, beside `test/`.
- **A take** is a folder:
  - `audio.wav`: 48 kHz mono, 16-bit, 24-bit or float.
  - `labels.json`: each played note's key, onset, offset, velocity and pedal state, and the sync notes (5.3).
  - `meta.json`: instrument, phone, distance, placement, room, background, pedal, which of 5.2's takes, and the date.
  - Runs write `events.jsonl` (each NoteOn and NoteOff with its sample time) and `rejections.jsonl`.
- **The runner** (`tools/replay`, C++, the same compiler and flags as `test/run.sh`):
  - It feeds a take through the v1.2 cascade hop by hop, as the phone's analysis loop does, except that it never drops a hop.
  - Its configuration (calibration profile, expected notes over time, polyphony) comes from a run file.
  - `--engine legacy` selects v1.2; Reevo 2 joins as another engine behind the same interface.
- **The rejection log:** an optional observer in the cascade, null on the phone, so it costs nothing there.
  - Each gate reports the hop time, the candidate key, the gate, the measured value and the threshold.
  - The gates are those 5.5 names: energy gate, flux onset, McLeod pitch, Goertzel verification, the five fingerprint layers (range and ±22 cents, harmonic ratio, timbre similarity, dB window, stability) and the 2-hop confirmation.
  - Guard: the events are byte-identical with and without the observer, and the scenario gate stays at 46 of 46.
- **The scorer** (`tools/score`; Python is question 1):
  - Note accuracy: F1 at 10, 20, 30 and 50 ms, using mir\_eval's onset matching on the same key.
  - Detection rate and false notes per hour.
  - Timestamp error: bias, spread and 95th percentile.
  - Release accuracy, on release-observable keys only.
  - Velocity error and the dynamic-level confusion table, where labels carry velocity.
  - Each metric per cell (register, loudness, distance, instrument, background), with bootstrap 95% intervals over takes.
  - `compare` fails when a gate metric gets worse by more than its interval (5.6).
  - Display latency and the phone's processing time need the phone, so they wait for slice 2. The runner reports the computer's compute time per hop only as a sanity check.
- **Synthetic takes** (`tools/synth`): labelled takes rendered by `test/PianoSynth.h`: a scale, chords, fast repeats, soft notes under a loud one, noise. They test the pipeline end to end and serve as golden recordings until real ones exist.
- **Determinism:** the same take and configuration always give byte-identical events. A test runs everything twice.
- **Commands:**
  - `npm run harness:replay -- <take>` replays a take.
  - `npm run harness:score -- <run>` scores a run.
  - `npm run harness:check` replays and scores the golden takes and compares them with the committed baseline.

## Questions for the owner

1. **The scorer's language.**
   - (a) Python 3 with numpy and mir\_eval. *Recommended*: 5.1 names mir\_eval's matching, and the bench scripts in `documentation/bench/` already need Python with numpy.
   - (b) TypeScript on Node: no Python, but mir\_eval's matching rewritten.
   - (c) C++, beside the runner.
2. **Where recordings live.**
   - (a) A folder outside the repository, named by a `PIANO_CORPUS` setting; only short synthetic golden takes go into git. *Recommended*: hours of 48 kHz audio are gigabytes, and the repository is public, while recordings of your rooms can hold speech and TV.
   - (b) Git LFS in this repository, which is public.
   - (c) A private cloud folder synced to your Mac, with `PIANO_CORPUS` pointing at it.
3. **How takes are captured on the phone (slice 2).**
   - (a) A developer recording mode in the app. *Recommended*: it is the only way to record exactly what the engine hears, and to show the harness reproduces the live results (5.7).
   - (b) A separate recorder app: simpler, but its audio path differs from the engine's.

## Tests and checks (slice 1)

- **Tests first:**
  - Scorer tests on hand-made events and labels: known F1 values, the tolerance edges, the same bootstrap with the same seed.
  - The runner on a synthetic take: deterministic, and the same events as the scenario suite's own driver gives for that audio.
  - The rejection observer leaves the events unchanged.
- **Gates:** the scenario gate (46 of 46) and every existing check. ThreadSanitizer only if threading code changes; slice 1 doesn't plan to.
- **On the phone:** nothing in slice 1.

## Slice 1 results (4 November 2026)

| Check | Result |
| --- | --- |
| Harness tests (`npm run harness:test`) | C++: 22 of 22 (every golden take deterministic; the same events as the scenario driver; the rejection log changes no decision; WAV files). Python: 21 of 21 |
| Engine gate | 46 of 46 with the rejection observer in the cascade |
| `npm run harness:check` | Passes against the recorded baseline; a deliberate regression (rise gate 6 → 20 dB) fails it |
| Determinism | Byte-identical events and rejections on every run |

Settled while building:

- **False notes are ghosts.** A detection that matches no played note even 250 ms late counts as false. A late note counts against the detection rate, not twice.
- **Golden takes are compared take by take** (`compare --per-take`). Seven takes give bootstrap intervals too wide to catch a regression (the deliberate one passed the interval rule), and the takes are deterministic. The interval rule stays for the recorded corpus.
- **Velocity is scored by rank for now:** the rank correlation of detected and labelled velocity. The error in dB and the dynamic-level confusion table need each instrument's velocity-to-level curve, which slice 3's recordings measure.
- **The log names the code's gates.** v1.2's gates differ from master 5.5's list; [the harness guide](../harness.md) has both. Section 5.5 should be corrected at the next master update.
- **The guide:** [docs/harness.md](../harness.md), with v1.2's synthetic baseline and what it already shows.

## Delivery

Commits on `claude/chore-setup`: the scorer and its tests, the runner and synthetic takes, the rejection log, then the commands and docs. [ADR 0004](../adr/0004-evaluation-harness.md) records the harness decisions.
