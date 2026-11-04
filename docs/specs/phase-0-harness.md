# Feature: Phase 0, the evaluation harness

- **Status:** Slice 1 built on 4 November 2026 on `claude/chore-setup`, then cut back the same day to what Reevo 2 needs ([Reevo 2 only](reevo-2-only.md)): the scorer and the synthetic golden takes stay, and the runner returns with Reevo 2's first stage. Approved with every recommendation: the Python scorer with mir\_eval (1a), recordings outside the repository (2a), and a developer recording mode in the app for slice 2 (3a)
- **Owner's request:** 4 November 2026: "Reshape then Harness": migration steps 1 and 2 (built), then the engine's Phase 0 harness. Master section 5 (v1.8): "Nothing is tuned until a labelled recording corpus and an offline test harness exist. Phase 0 builds both, and every later phase is measured with them against the gates in section 1."

## Goal

Measure before tuning. Any recording replays through Reevo 2 on a computer exactly as it would on the phone, and a scorer reports the master's metrics (5.1) with confidence intervals. The engine's rejection log (5.5) says why it misses the notes it misses.

## What Phase 0 needs, and who does it

| Part | Master | Who | Slice |
| --- | --- | --- | --- |
| Desktop runner: any recording through the engine in any configuration, deterministic | 5.6 | Claude | 1, with Reevo 2's first stage |
| Scorer: every 5.1 metric that a recording can show, bootstrap confidence intervals over takes, and a comparison against an earlier report | 5.1, 5.6 | Claude | 1 |
| Synthetic takes from the piano synthesiser, as golden recordings until real ones exist | 5.6 | Claude | 1 |
| A take recorder in the app (developer mode): the mic exactly as the engine hears it, plus its live events and commands | 5.3 | Claude; checked on your iPhone | 2 |
| The PSR-E343 self-play rig: a computer plays MIDI files over USB and logs them; sync notes found by matched filtering and the clocks fitted | 5.3 | Claude builds the tools; you run them | 3 |
| Recording sessions (the 13 takes of 5.2 over the covering array) and the acoustic piano's labels | 5.2–5.4 | You, with the tools | 3 |
| Each build's metrics and miss-cause histogram | 5.5 | Claude, from your recordings | Once Reevo 2 runs |

Slices 2 and 3 get their own approval.

## Slice 1 design

- **Where:** `packages/CoreEngine/tools/`. Phase 1's layout puts the desktop harness there, beside `test/`.
- **A take** is a folder:
  - `audio.wav`: 48 kHz mono, 16-bit, 24-bit or float.
  - `labels.json`: each played note's key, onset, offset, velocity and pedal state, and the sync notes (5.3).
  - `meta.json`: instrument, phone, distance, placement, room, background, pedal, which of 5.2's takes, and the date.
  - Runs write `events.jsonl` (each NoteOn and NoteOff with its time), `rejections.jsonl` (the engine's rejection log, 5.5) and `run.json`.
- **The runner** (C++, the same compiler and flags as the engine's tests) feeds a take through the engine hop by hop, as the phone's analysis loop does, except that it never drops a hop. Its configuration comes from a run file. It arrives with Reevo 2's first stage.
- **The scorer** (`tools/score`; Python was question 1):
  - Note accuracy: F1 at 10, 20, 30 and 50 ms, using mir\_eval's onset matching on the same key.
  - Detection rate and false notes per hour.
  - Timestamp error: bias, spread and 95th percentile.
  - Release accuracy, on release-observable keys only.
  - Velocity, where labels carry it.
  - Each metric per cell (register, loudness, distance, instrument, background), with bootstrap 95% intervals over takes.
  - `compare` fails when a gate metric gets worse by more than its interval (5.6).
  - Display latency and the phone's processing time need the phone, so they wait for slice 2.
- **Synthetic takes** (`tools/synth`): labelled takes rendered by `test/PianoSynth.h`: a scale, a loudness ladder, chords, fast repeats, soft notes under a loud one, noise, and a lesson with expected notes. They test the pipeline end to end and serve as golden recordings until real ones exist.
- **Determinism:** the same take and configuration always give byte-identical events. The runner's tests run everything twice.
- **Commands:** `npm run harness:test` and `npm run harness:score` now; `harness:replay` and `harness:check` arrive with the runner.

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
   - (a) A developer recording mode in the app. *Recommended*: it is the only way to record exactly what the engine hears.
   - (b) A separate recorder app: simpler, but its audio path differs from the engine's.

## Tests and checks (slice 1)

- **Tests first:**
  - Scorer tests on hand-made events and labels: known F1 values, the tolerance edges, the same bootstrap with the same seed.
  - The golden takes: the same samples on every render, labels inside the take, no clipping, and a lesson's expected notes; WAV files round-trip.
  - The runner's own tests (deterministic replays) arrive with it.
- **Gates:** every existing check.
- **On the phone:** nothing in slice 1.

## Slice 1 results (4 November 2026)

| Check | Result |
| --- | --- |
| Harness tests (`npm run harness:test`) | C++: 26 of 26 (each golden take renders the same samples every time, keeps its labels inside the take and never clips; the lesson's expected notes; WAV files). Python: 21 of 21 |
| The current engine | As it was before Phase 0; its scenario gate still passes 46 of 46 |

Settled while building:

- **False notes are ghosts.** A detection that matches no played note even 250 ms late counts as false. A late note counts against the detection rate, not twice.
- **Golden takes are compared take by take** (`compare --per-take`). Seven takes give bootstrap intervals too wide to catch a regression, and the takes are deterministic. The interval rule stays for the recorded corpus.
- **Velocity is scored by rank for now:** the rank correlation of detected and labelled velocity. The error in dB and the dynamic-level confusion table need each instrument's velocity-to-level curve, which slice 3's recordings measure.
- **The ladder take no longer clips:** its ff strikes peaked at 1.26 of full scale. Every level is now two thirds as loud, so ff peaks at 0.84, under master 6.5's clip flag.
- **The guide:** [docs/harness.md](../harness.md), with the take and run formats.

## Delivery

Commits on `claude/chore-setup`: first the scorer, the golden takes and a runner for the app's current engine; then, the same day, the cut-back to Reevo 2 only. [ADR 0004](../adr/0004-evaluation-harness.md) records the harness decisions.
