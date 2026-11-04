# The evaluation harness

Master section 5: nothing is tuned until recordings can be replayed through the engine and scored. The harness does that on a computer, the same way every time, for Reevo 2, the only engine the plan follows. It lives in `packages/CoreEngine/tools/`. Spec: [Phase 0 harness](specs/phase-0-harness.md); decisions: [ADR 0004](adr/0004-evaluation-harness.md).

What exists now: the scorer, the synthetic golden takes, the take and run formats, the take recorder in the app, which records real takes on the iPhone, and the PSR-E343 rig, which labels them on the digital keyboard. The runner, which replays takes through Reevo 2 hop by hop, arrives with the engine's first stage, Phase 2's front end. Until then nothing is replayed. The runner and baseline first built for the app's current engine were removed on 4 November 2026 ([Reevo 2 only](specs/reevo-2-only.md)).

## Quick start

| Command | What it does |
| --- | --- |
| `npm run harness:test` | The harness's own tests: C++ (each golden take renders the same samples every time and matches its labels; WAV files) and Python (the scorer and the rig) |
| `bash packages/CoreEngine/tools/harness.sh synth <out> [take ...]` | Renders the synthetic golden takes as take folders |
| `npm run harness:score -- <takes> <runs> --out report.json` | Scores runs against labelled takes |
| `npm run harness:inspect -- <take> [<take> ...]` | Checks takes copied from the phone against their `meta.json`: 48 kHz mono 32-bit float, and the length, peak and clipped count the phone saw. Dropped samples and early stops are reported |
| `npm run harness:rig -- <command>` | The PSR-E343 rig: `takes`, `ports`, `check`, `play`, `record` and `label` ([below](#labelled-takes-from-the-psr-e343)) |

The C++ tools build themselves with `clang++` (or `$CXX`) into `tools/.build/`. The scorer needs Python 3 with `pip install -r packages/CoreEngine/tools/score/requirements.txt` (numpy, scipy and mir\_eval 0.8.2). The rig adds mido and python-rtmidi, to talk to the keyboard: `pip install -r packages/CoreEngine/tools/rig/requirements.txt`. Its tests need neither.

## Recordings stay outside git

The repository is public, and recordings of rooms hold speech and television. Real takes live in a folder outside the repository, named by the `PIANO_CORPUS` setting; only the synthetic golden takes, which are rendered on demand, belong to git.

## Takes from the phone

The app's take recorder (Phase 0 slice 2; [spec](specs/phase-0-slice-2-take-recorder.md), [ADR 0005](adr/0005-take-recorder.md)) records master 5.2's takes on the iPhone:

1. Open it with **Record takes**, on the calibration screen or on the lesson's engine overlay.
2. Set the take's conditions (which take, instrument, distance, placement, room, background, pedal), then **Record** and **Stop**. While recording, the screen shows the time, the peak, clipped samples and dropped samples, which should stay at 0. A call, a route change or leaving the app stops the take and keeps what it has.
3. Copy the takes to the Mac: Finder › your iPhone › Files › Piano Academy Studio › Takes, or the Files app. Put them in `$PIANO_CORPUS`.
4. Check them: `npm run harness:inspect -- "$PIANO_CORPUS"/<take>`.

Each take folder holds `audio.wav` (every sample the microphone capture hands the engine, 48 kHz mono 32-bit float) and `meta.json` (the conditions, the phone and its route, and the capture's counts). Its `labels.json` comes from the PSR-E343 rig, below, or for the acoustic piano from printed scripts and checked onsets (master 5.3; slice 4).

## Labelled takes from the PSR-E343

The rig (Phase 0 slice 3; [spec](specs/phase-0-slice-3-psr-rig.md)) labels takes on the Yamaha PSR-E343 with no hand labelling. Your Mac plays a take's notes into the keyboard over USB MIDI while the phone's take recorder listens, and logs the moment each message leaves. Loud sync notes in the take let the rig fit the phone's clock to the Mac's, and check the fit to 2 ms, master 5.7's bar for labels (master 5.3). The tools are in `packages/CoreEngine/tools/rig/`.

**Once, to set up:**

1. `pip install -r packages/CoreEngine/tools/rig/requirements.txt`.
2. On the keyboard: the Grand Piano voice, Touch Response on, no style, no dual or split voice, the metronome off. A USB cable from its USB TO HOST port to the Mac.
3. `npm run harness:rig -- ports` lists the MIDI ports. `npm run harness:rig -- check` plays a C major scale, so you hear the keyboard answer. With more than one port, add `--port <part of its name>` to `check`, `play` and `record`.
4. **The delay take:** record the `delays` take as below, then label it. It plays every key from C2 to C7 alone at pp, mf and ff (6.6 minutes), and labelling it measures how long each key takes to sound compared with the sync note. The result is saved as `$PIANO_CORPUS/instruments/psr-e343/delays.json`, and every later take is labelled with it. Record it again if the keyboard's voice or settings change. The phone's take list has no entry for the two delay takes yet, so pick any take there: `label` follows the rig's log and says so. Keep their folders in `$PIANO_CORPUS/instruments/psr-e343/` too, so they aren't scored with the other takes.

**Each take:**

1. On the phone: **Record takes**. Set the conditions, with the PSR-E343 and the take the Mac will play, then **Record**.
2. On the Mac: `npm run harness:rig -- play <take>`, then Enter. The Mac plays a loud C7 sync note, the take's notes, a check sync note in a pause about once a minute, and a closing sync note. Each sync note has 2 s of silence on each side; when the Mac prints "quiet", keep the room quiet. The log goes to `$PIANO_CORPUS/rig-logs/<date>_<take>.midi.jsonl`.
3. On the phone: **Stop**. Copy the take into `$PIANO_CORPUS` and check it with `harness:inspect`.
4. `npm run harness:rig -- label "$PIANO_CORPUS"/<take folder> <log>` finds the sync notes in `audio.wav`, fits the clocks, adds each key's delay and writes the take's `labels.json`. It reports the clock drift and each sync note's residual. If any sync note is more than 2 ms off the fit, it fails and writes nothing: record the take again.

`npm run harness:rig -- takes` lists them all; the [spec](specs/phase-0-slice-3-psr-rig.md) says what each plays.

| Take | Minutes | Master 5.2 |
| --- | --- | --- |
| `ladder` | 3.4 | 2, the loudness ladder |
| `repetitions` | 0.9 | 3 |
| `soft-under-loud` | 0.5 | 4 |
| `scales` | 2.0 | 5 |
| `chords` | 1.4 | 6 |
| `trills` | 0.5 | 7 |
| `glissando` | 0.3 | 8 |
| `jingle-bells` | 0.8 | 9, the learning-mode half |
| `velocity-sweep` | 0.7 | 10 |
| `harmonic-intervals` | 2.0 | 12, without the silently held key, which MIDI can't send |
| `noise` | 7.6 | 1: the Mac plays only the sync notes and prints which noise to make each minute |
| `free-playing` | 2.2 | 11, which you play (`record`) |
| `delays` | 6.6 | The delay take |
| `delays-played` | 0.6 | Your playing's delay (`record`) |

**Takes you play.** `npm run harness:rig -- record free-playing` logs the MIDI your playing sends, while the Mac plays only the sync notes. Its labels need the delay of your own playing, measured once: `record delays-played` (strike C4 firmly about once a second, 20 times), then `label` it. That delay is saved beside the delay take's.

The rig's files, all in `$PIANO_CORPUS`:

| File | Holds |
| --- | --- |
| `rig-logs/<date>_<take>.midi.jsonl` | A header (the take, its mode, the script version, the port, the start), then one line per message: `t` in seconds from the start, `ns` on the Mac's monotonic clock, `type` (`note_on`, `note_off` or `pedal`), `source` (`mac`, or `keyboard` for your playing), `midi` and `velocity` or the pedal's `value`, and `sync` on sync notes |
| `instruments/psr-e343/delays.json` | Each key's delay at pp, mf and ff, in ms from the sync note's, and `played`, your playing's delay at C4 |
| `<take>/labels.json` | The take's labels, below |

## A take

A take is a folder:

| File | Holds |
| --- | --- |
| `audio.wav` | The microphone at 48 kHz: 16-bit, 24-bit or float, mono or averaged to mono |
| `labels.json` | `{"version": 1, "notes": [{"midi": 60, "onset": 1.234, "offset": 1.734, "velocity": 64, "releaseObservable": true}]}`; times in seconds, velocity as MIDI. The rig adds `pedal` (down at the strike), `sync` on its sync notes, `played` on notes you played, and a `sync` report: the drift, the offset and each sync note's residual |
| `meta.json` | The conditions of 5.2: `instrument`, `phone`, `distance_m`, `placement`, `room`, `background`, `pedal`, `take` (which of 5.2's takes), `durationSec`. The take recorder adds `date`, `device` (the route, the hardware rate, the I/O buffer and input latency) and `capture` (samples, peak, clipped and dropped samples, where any were dropped, and why a take stopped early) |
| `expected.txt` | Lesson takes only: one line per change, a time in ms and the MIDI numbers expected from then on |

## A run

The runner will write one folder per take, named after it. The scorer reads:

| File | Holds |
| --- | --- |
| `events.jsonl` | One line per NoteOn and NoteOff: `{"type": "on", "midi": 60, "t": 1.240, "velocity": 0.6}`, with `t` in seconds and `velocity` optional |
| `rejections.jsonl` | The engine's rejection log (master 5.5): one line per candidate held back, `{"t": 1.236, "midi": 60, "gate": "threshold", "measured": 9.0, "threshold": 16.1}`, with `midi` −1 when no key was found |
| `run.json` | `durationSec`, the engine and its configuration, and the computer's compute time per hop |

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

**Comparisons.** `compare` fails when a gate metric is worse than the baseline's 95% interval: 5.6's rule, for a recorded corpus of many takes. The golden takes will use `compare --per-take`, which fails when any take has fewer notes on time or heard, or more ghost notes: seven takes give intervals far too wide to catch a regression, and the golden takes are deterministic, so any loss is real.

## The golden takes

The golden takes are rendered by the piano synthesiser in `test/PianoSynth.h`: stretched partials, unison strings, a phone-microphone bass roll-off and room noise at −65 dBFS. They stand in for 5.6's golden recordings until real ones exist. The synthesiser moves into `tools/synth/` when Phase 7 deletes the current engine's tests beside it.

| Take | What it plays | Notes |
| --- | --- | --- |
| scale | C4 to C6 and back, mf | 29 |
| lesson | the start of Jingle Bells, each note expected from 150 ms before it | 11 |
| ladder | C2, C4 and C6 at five levels from pp to ff, the loudest peaking at 0.84 of full scale | 45 |
| repeats | C4 at 4 and 8 per second, G2 at 4 per second | 24 |
| soft-under-loud | soft notes 1 to 19 semitones over a held loud C3 | 7 |
| chords | C–E–G triads and C3+C4 octaves | 15 |
| noise | a whistle, a sung vowel, knocks and claps; no piano | 0 |

Once the runner exists, `harness:check` will replay them through Reevo 2 and compare each build with the last recorded report.
