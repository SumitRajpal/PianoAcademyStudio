# Feature: Phase 0 slice 3, the PSR-E343 self-play rig

- **Status:** Built on 5 November 2026 on `claude/chore-setup`, waiting for your first session with the keyboard. Approved on 4 November 2026 with both recommendations: Python (1a), and the iOS rule file updated (2a)
- **Owner's request:** 4 November 2026: "continue", after slice 2. The [Phase 0 harness spec](phase-0-harness.md) gives slice 3 as "The PSR-E343 self-play rig: a computer plays MIDI files over USB and logs them; sync notes found by matched filtering and the clocks fitted", with Claude building the tools and you running them. Master 5.2 (the takes), 5.3 (ground truth) and 5.7 (labels within 2 ms).

## Goal

Labelled takes on the PSR-E343 with no hand labelling. Your Mac plays each take's notes into the keyboard over USB while the phone's take recorder listens. A tool then turns the Mac's log into the take's `labels.json`, aligned to the phone's audio to within 2 ms.

## Behaviour

**Once, to set up:**

1. On the keyboard: the Grand Piano voice, Touch Response on, no style, no dual or split, metronome off. A USB cable from its USB TO HOST port to the Mac.
2. `harness.sh rig ports` lists the MIDI ports; `harness.sh rig check` plays a short scale, so you hear the keyboard answer the Mac.
3. **The delay take** (master 5.3: "The keyboard's MIDI-in-to-sound delay is measured once the same way and subtracted"). The phone records while the Mac plays every key from C2 to C7 at three velocities. The tool measures how long each key takes to sound, relative to the sync note, and saves it with the instrument in `$PIANO_CORPUS/instruments/psr-e343/delays.json`.

**Each take:**

1. On the phone: set the conditions and tap Record.
2. On the Mac: `harness.sh rig play <take>`. It waits for Enter, then plays a loud C7 sync note, the take's notes, a check sync note in a pause about every minute, and a closing sync note. It logs every message it sends, with the Mac's clock in nanoseconds.
3. On the phone: Stop. Copy the take into `$PIANO_CORPUS`.
4. `harness.sh rig label <take folder> <log>`:
   - finds the sync notes in `audio.wav`: their onsets, then the exact spacing between them by matching each against the first;
   - fits the phone's clock to the Mac's (t\_phone = a × t\_mac + b), since the two drift apart by 20 to 100 ppm;
   - subtracts each key's measured delay;
   - writes `labels.json`: each note's key, onset, offset, velocity, pedal state and whether its release can be heard.
   - It reports the drift and each check sync's residual, and fails if any residual is over 2 ms.

**The takes the Mac can play** (the PSR-E343 version of master 5.2; its 61 keys are C2–C7):

| Take | What the script plays |
| --- | --- |
| Loudness ladder | C2, G3, C4, A5, E6 and C7 at 5 velocities from ppp to ff, 3 strikes each, 2 s apart |
| Repetitions | A bass, a middle and a treble key at 2, 4, 6 and 8 notes a second, 8 strikes each |
| Soft under loud | A loud C3 held, soft notes 1, 2, 4, 7, 12 and 19 semitones above, with and without the pedal |
| Scales | Two octaves legato, staccato and pedalled, in eighth notes at 60, 90 and 120 BPM |
| Chords | Triads in three registers, octaves (C2+C3, C3+C4), the E4+F4 cluster, 6-note two-hand chords |
| Trills | C4–D4 and C4–C♯4 at 8 and 12 notes a second, 3 s each |
| Glissando | White keys up and down, evenly timed |
| Jingle Bells chorus | Learning mode, no backing |
| Velocity sweep | One key, 20 strikes from softest to loudest |
| Harmonic intervals | Octave, twelfth and double octave above C2 and C3, struck together and 30 ms apart, the upper note at the same, a softer and a much softer velocity |

Some takes are handled differently:

- **Noise** has no notes: the Mac plays only the sync notes, around your six minutes of noises.
- **Free playing** is yours. `harness.sh rig record <take>` logs the MIDI your playing sends, framed by sync notes. Its delay is measured once from you striking one key 20 times (`rig delays --played`).
- **Harmonic intervals' silent upper key** can't be sent over MIDI (velocity 0 means key up), so the PSR-E343 version leaves that part out.

**Not in this slice:**

- **Slice 4:** the session plan (which takes to record under which conditions: master 5.2's covering array), and the acoustic piano's printed scripts and checked onsets.
- **Backing songs** (take 9's practice half, take 13), which wait for the app's backing player.

## Questions for the owner

1. **The rig's language.**
   - (a) Python, with mido and python-rtmidi. *Recommended*:
     - the harness is already Python;
     - the alignment and labels are tested here on synthetic audio;
     - Python's timing is enough, because the rig logs when each message actually left and the sync notes fix the clocks.
   - (b) A Swift command-line tool with CoreMIDI: exact scheduled timestamps, but macOS only, and nothing of it can be tested here.
2. **The iOS rule file.** Since slice 2, `.claude/rules/ios.md` says the engine package has two iOS files; it has three. Update it? Anything in `.claude/` needs your OK.

## Design

| Where | What |
| --- | --- |
| `packages/CoreEngine/tools/rig/` (new) | `scripts.py`: each take as timed notes, pedal and sync notes. `play.py`: plays a script to the keyboard and logs what was sent; records what your playing sends. `align.py`: finds the sync notes and fits the clocks. `delays.py`: the per-key delays from a delay take. `label.py`: `labels.json` and the sync report. `rig.py`: the command line |
| `tools/rig/requirements.txt` | mido and python-rtmidi, only for talking to the keyboard; numpy and scipy, as the scorer already uses |
| `tools/harness.sh` | `rig …`, passed to `rig.py` |
| `tools/rig/test_rig.py`, run by `harness:test` | The tests below |
| `docs/harness.md` | "Labelled takes from the PSR-E343": the setup, the delay take, a take from start to finish |

- **Sync notes:**
  - C7 at velocity 127, the loudest and highest key, with 2 s of silence on each side.
  - A take of over a minute gets a check sync note in a pause about once a minute, for the 2 ms check.
- **Onsets in the audio:** the energy of C7's first partials in short frames, refined to the sample by matching each sync note against the first. The same definition times the delay take, so the definitions cancel.
- **No app code changes.** The phone side is the take recorder from slice 2.
- **Hot path:** untouched; everything here runs on the Mac, after the take.

## Tests and checks

- **Tests first** (Python, on synthetic audio with known answers):
  - The scripts: sync notes and their pauses, every key within C2–C7, the velocities, the pedal, and the timings of each take.
  - The log: written and read back; a fake MIDI port stands in for the keyboard.
  - The alignment: a take rendered with a known offset and an 80 ppm drift gives back both, with sync onsets within 0.05 ms. A residual over 2 ms fails.
  - The delays: a synthetic delay take with known per-key delays gives them back.
  - The labels: from a log and a fit, with pedal state and audible releases right.
- **Every existing check**, unchanged.
- **On your Mac, with the phone:**
  - `pip install -r packages/CoreEngine/tools/rig/requirements.txt`, connect the keyboard, then run `rig ports` and `rig check`.
  - Record the delay take and one ladder take, label them, and run `harness:inspect`. The sync report should show residuals under 2 ms.
- **What can't be tested here:** a real MIDI port and the keyboard's own sound. Your first session is that check.

## Results (5 November 2026)

| Check | Result |
| --- | --- |
| The rig's tests (`harness:test`) | 22 of 22 in about 5 s: the scripts; the log, with a fake keyboard; the MIDI messages mido sends; the clock fit; the delays; the labels; `rig label` from end to end |
| Labels on synthetic takes | The ten takes the Mac plays (912 notes), rendered with an 80 ppm drift, a 3.2 s offset, per-key delays of 3 to 5.3 ms and up to 50 µs of jitter in sending. Labels land within 0.05 ms at the median, 0.11 ms at the 95th percentile and 0.36 ms at worst, on the softest strike of the velocity sweep. The drift comes back within 0.2 ppm, and every sync note sits within 0.003 ms of the fit |
| The delay take | All 183 notes found; each key's delay within 0.15 ms of the truth |
| A hard take | The 7.6-minute noise take, drifting 150 ppm (68 ms by its end), with 30 stray notes as loud as the sync notes: every sync note found, and the drift within 0.5 ppm |
| Failing safely | A sync note 5 ms out of line fails the 2 ms check, and nothing is written. A missing sync note is an error. Labelling without the delays is refused unless asked |
| Every other check | typecheck, lint, `test:tooling`, the architecture check, the scenario gate 46 of 46, the take recorder 19 of 19 under ThreadSanitizer, the harness's C++ 26 of 26 and scorer 26 of 26. Jest: the same three render tests fail as before |

Built differently from the plan:

- **Sync onsets are timed one by one**, not by matching each against the first. One onset rule times them: the first sample more than six noise spreads above the quiet just before it, with the sound reaching three times that within 5 ms. On synthetic audio, matching locked onto a neighbouring cycle of C7's waveform, about 1 ms off. The same rule times every note of the delay take, so its definition still cancels out of the labels.
- **The delay take spaces its notes 2 s apart** (6.6 minutes), so every note starts in quiet.
- **Your playing's delay is a take like the others:** `record delays-played`, then `label`. There's no separate `rig delays --played`.
- **A failed clock fit writes nothing:** no `labels.json` and no delays.
- **A release counts as heard when the pedal lifts within 20 ms of it.** The rig sends a key's release just before a pedal change at the same instant, so the two arrive microseconds apart.
- **Sync notes are labelled too**, marked `sync`, since the engine hears them like any other note. Notes you play are marked `played`.
- **The phone's take list has no entry for the two delay takes**, because the approved design changed nothing in the app. `label` follows the rig's log, and says so when the phone's `meta.json` names another take. Adding the two entries to the phone's list is a small app change, yours to decide.

Your first session, on the Mac with the phone, with `PIANO_CORPUS` set:

1. `pip install -r packages/CoreEngine/tools/rig/requirements.txt`. Connect the keyboard, then run `npm run harness:rig -- ports` and `npm run harness:rig -- check`.
2. Record the delay take (`play delays`, 6.6 minutes) and label it.
3. Record one ladder take (`play ladder`, 3.4 minutes), label it, and run `harness:inspect` on it. Every sync note's residual should be under 2 ms.

## Delivery

Commits on `claude/chore-setup`: the scripts and the log; the alignment, delays and labels; the command line and the docs.
