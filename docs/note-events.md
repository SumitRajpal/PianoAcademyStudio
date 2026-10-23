# Note events: from the mic to every consumer

How a detected note reaches the keyboard and the rest of the app. The code is
in `src/motion/scenes/PianoMaster/CorePianoNotesDetection/`.

```text
mic ─▶ audio thread ─(lock-free sample ring)─▶ analysis thread (C++)
                                                   │ publish(note): O(1), no lock, no allocation
                                                   ▼
                      LiveKeys: one slot per MIDI note (0-127)  +  NoteEventRing: last 256 notes
                         │                                              │
   UI thread, every frame (and right after a JS wake):     JS thread, woken at most once at a time:
   version changed? → apply the changed keys to the        reads every new note in order
   PianoState → CorePiano redraws                          → noteEventBus → listeners
```

## The two shared structures (`shared/LiveKeys.h`)

- **LiveKeys**: what each key is doing now: down, velocity, cents, time of the
  last change, and a strike counter. Indexed by MIDI number, so any keyboard
  size works and a key is found with no arithmetic. A `version` counts changes:
  a reader that sees the same version skips all work.
- **NoteEventRing**: the notes themselves, in order, numbered from 0. It keeps
  the last 256; the writer overwrites the oldest and never waits for a reader.
  Each reader keeps its own position, so any number of readers follow it.

One writer (the analysis thread), any number of readers on any thread. Every
slot and cell is a seqlock whose fields are atomics: a read is never torn, and
a reader that catches a slot mid-update retries a few times, then reports it
busy (the next frame reads it). Nothing ever waits on anything, so there is
nothing to deadlock.

Every note goes into the table first, then the ring, so event number n is
table version n + 1. A reader that falls more than 256 notes behind (its
thread stalled) has lost those notes; `NoteEventReader` then delivers the
difference between what it delivered and the table as it is, so its consumer
ends exactly in step. A new reader starts the same way, so a listener that
subscribes while keys are held hears about them.

## Readers

| Who                      | How                                                            | Cost                                                                  |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| CorePiano (key lights)   | `useLiveKeys(pianoState)`: a frame callback on the UI thread   | one number compared per frame; O(changed keys) when something changed |
| Any code, "is C4 down?"  | `getLiveKeys().isDown(60)` or `.key(60)`, from JS or a worklet | O(1), one atomic read                                                 |
| Listeners for every note | `noteEventBus.subscribeNote(listener)`                         | O(listeners) per note                                                 |
| Listeners for one key    | `noteEventBus.subscribeKey(60, listener)`                      | other keys' notes cost them nothing                                   |

The UI thread reads the table every frame, so a detected key shows within one
frame however busy the JS thread is. When JS is free, its wake also asks the
UI thread to look at once, so the key can show before that frame. A key struck
and released between two looks still lights for 120 ms
(`CORE_PIANO_NOTES_DETECTION_LOOK.keys.shortestLitMs`).

The JS thread is woken through one `AsyncCallback` at a time: however many
notes arrive while it is busy, one drain is pending and it reads them all. The
only lock left on the analysis thread is inside React Native's scheduler,
taken for that one wake.

## Rules for new code

- Do not put note state in React state for anything that must keep up with
  playing; read the table, or listen with `subscribeKey`.
- Do not press keys from JS for mic input; pass `pianoState` to the detector.
- Listeners run on the JS thread: keep them short, never block.

## Tests

`test/live_keys_test.cpp` checks the rules on one thread, then one writer and
four concurrent readers (one of them lapped) under ThreadSanitizer: no torn
reads, no races, every reader ends exactly in step. Run `test/run.sh engine`.
