# Feature: Phase 0 slice 2, the take recorder

- **Status:** Built on 4 November 2026 on `claude/chore-setup`, waiting for the owner's iPhone check. Approved the same day with every recommendation: the button on calibration and the overlay (1a), the Files app and Finder (2a), and 32-bit float (3a). Decisions: [ADR 0005](../adr/0005-take-recorder.md)
- **Owner's request:** 4 November 2026. The Phase 0 harness spec's question 3, answered (a): "A developer recording mode in the app". Then "continue" (19:55), after the plan moved to Reevo 2 only. Master 5.2 (the recording protocol) and 5.3 (ground truth).

## Goal

You can record the takes of master 5.2 on your iPhone, exactly as the microphone capture hands them to the engine, and copy them to your Mac's corpus folder (`PIANO_CORPUS`) as harness takes. Nothing from the current engine's detection is recorded or measured.

## Behaviour

- **Reaching it:** a "Record takes" button on the calibration screen and on the lesson's engine overlay (question 1).
- **The screen** (landscape, plain controls, no animation):
  - The conditions of 5.2, remembered from the last take: which of the 13 takes; the instrument (PSR-E343, or an acoustic piano with its name); the distance (0.3, 1 or 2 m); the placement (music stand, piano top or table); the room (small or echoey, with a name); the background (quiet, speech, TV or music); the pedal (up or down); and a note.
  - Record and Stop. While recording: the time, the peak level in dBFS, clipped samples (|x| ≥ 0.985, master 6.5) and dropped samples, which should stay at 0.
  - The takes on the phone, newest first, with length and size. Any of them can be deleted.
  - Where to find them: Files › On My iPhone › Piano Academy Studio › Takes, or on the Mac, Finder › your iPhone › Files.
- **A take** is the harness's take folder ([docs/harness.md](../harness.md)):
  - `audio.wav`: 48 kHz mono, 32-bit float (question 3). Every sample the microphone capture hands the engine, before the engine's analysis can skip any.
  - `meta.json`: the conditions and the date; the phone model and iOS version; the input route and microphone; the hardware sample rate, I/O buffer and input latency iOS reports; and the capture's counts (length, peak, clipped and dropped samples).
  - Labels come later: from the PSR-E343 rig (slice 3), or by hand for the acoustic piano (5.3).
- **The microphone** runs as it does for detection: measurement mode, no gain control, no voice processing, no Bluetooth call microphone. The current engine's detector has to run, because it owns the capture today; its notes are ignored and nothing it computes is saved.
- **Edge cases:**
  - No microphone permission: the screen says so, with the fix in iOS Settings.
  - A call, Siri or another app interrupts, or the route changes (headphones in, Bluetooth): the take stops at once and keeps what it has, marked in `meta.json`, because the rest would not match its conditions.
  - The screen stays awake while recording. If the app still goes to the background, the take stops the same way.
  - Storage: a take needs 11.5 MB a minute. The screen shows the free space and won't start with less than 500 MB.
  - A crash mid-take: the WAV header is rewritten every second, so the take survives up to its last second.
  - A slow file system: the recorder holds 5.5 s of audio in memory. If writing falls further behind, the lost samples are counted, their positions go into `meta.json`, and the screen shows the count.
- **Not in this slice:** display latency and the phone's processing time, which need Reevo 2 running on the phone (Phase 7); playing a backing song from the phone (takes 9 and 13 of 5.2), which waits for the backing player (Phase 4 of the UI plan); and Android, which is paused.

## Questions for the owner

1. **How you reach the recorder.**
   - (a) A "Record takes" button on the calibration screen and the lesson overlay, in every build. *Recommended*: every launch starts at calibration, so it is one tap away, and it works in the Release builds you install. It moves to Settings › Diagnostics once Settings exists.
   - (b) Debug builds only.
   - (c) Hidden: a two-second press on the screen's title.
2. **Getting takes to the Mac.**
   - (a) Through the Files app and Finder: the app's Documents folder is shared. *Recommended*: a whole session copies at once, over USB or iCloud Drive.
   - (b) A share button on each take, for AirDrop.
   - (c) Both.
3. **The audio format.**
   - (a) 32-bit float: exactly the samples the engine receives, 11.5 MB a minute. *Recommended*.
   - (b) 24-bit PCM: 8.6 MB a minute, rounded to 24 bits.

## Design

- **Modules touched.** `/arch impact packages/CoreEngine`: the Calibration and Lesson screens, `App.tsx` and Android's registration.

| Where | What |
| --- | --- |
| `packages/CoreEngine/cpp/capture/TakeRecorder.h` (new) | Pure C++, the first file of Phase 1's `capture/` folder. One recorder for the one microphone: a wait-free ring of 5.5 s (262,144 samples) filled by the audio thread, and a writer thread that drains it every 20 ms into the WAV file, keeps the peak, clipped and dropped counts, and rewrites the header every second. The audio thread copies samples only while a take is armed; otherwise it returns at once |
| `packages/CoreEngine/ios/IosAudioInput.mm` | One line in the input callback: after the engine's ring, the same samples go to the recorder |
| `packages/CoreEngine/bindings/NativeTakeRecorder.{h,cpp}` (new) | A C++ TurboModule of its own: `startTake`, `stopTake`, `getTakeStatus`, `listTakes`, `deleteTake`, `freeSpace`. The current engine's module is not touched |
| `packages/CoreEngine/ios/NativeTakeRecorderProvider.{h,mm}` (new) | Registers the module; gives it the Takes folder (Documents/Takes), the phone's and route's details, and keeps the screen awake during a take |
| `packages/CoreEngine/src/specs/NativeTakeRecorder.ts`, `src/takeRecorder.ts` (new) | The codegen spec, optional so that a build without the module still runs, and a small TypeScript API exported from `src/index.ts` |
| `src/screens/TakeRecorder/` (new) | `TakeRecorderScreen.tsx`; `takeConditions.ts` (the 5.2 conditions, folder names and `meta.json`); `takeRecorderLook.ts` |
| `App.tsx`, `CalibrationScreen`, `EngineDiagnostics` | A third screen, and the "Record takes" button on the other two |
| The iOS project and `package.json` | `Info.plist`: `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` (question 2). The new files by path. The codegen `modulesProvider` gains `NativeTakeRecorder` |
| `packages/CoreEngine/test/take_recorder_test.cpp`, `run.sh capture` (new) | The recorder's tests, also under ThreadSanitizer |
| `packages/CoreEngine/tools/harness.sh inspect` (new) | Reads a take copied from the phone and checks it against its `meta.json`: length, sample rate, peak, clipped and dropped samples |

- **Data flow**, for `docs/architecture/flows.md`: mic → RemoteIO's audio thread → the engine's ring, as today, and the recorder's ring → the writer thread → `Documents/Takes/<id>/audio.wav`. The screen reads the take's status five times a second on the JS thread.
- **Hot path:** unchanged. The recorder's work on the audio thread is a bounded copy into a ring allocated up front: no lock, no allocation, no file I/O. JavaScript only reads the status.
- **Motion:** none; the status is text.
- **Android:** not wired while it is paused. The module is absent there and the button hidden; `OboeInput` gets the same one-line tap when Android resumes.

## Tests and checks

- **Tests first** (C++, `test/take_recorder_test.cpp`):
  - A producer thread pushes 3 minutes of known samples in callback-sized chunks. The WAV holds exactly those samples, bit for bit, and the harness's WAV reader reads it.
  - The file is readable mid-take, with every second written so far.
  - Disarmed, a push does nothing and allocates nothing.
  - With the writer held back, dropped samples are counted and their positions kept; nothing else changes.
  - The peak and clipped counts.
  - ThreadSanitizer (`run.sh capture`): the audio thread, the writer and the status reader, with no race.
- **Jest:** `takeConditions` (`meta.json` from the conditions, the device and the counts; folder names; the last take's conditions as defaults), and the screen with a mocked module (record, stop, delete, permission denied, interrupted).
- **Every existing check:** typecheck, lint, Jest, `test:tooling`, the architecture check, the scenario gate (46 of 46) and `harness:test`.
- **On your iPhone**, one Release build:
  - Reach the recorder from calibration, record 30 s of a few notes, and watch the counts move, with dropped staying at 0.
  - Stop, find the take in Files, copy it to the Mac, and run `harness.sh inspect` on it: it agrees with `meta.json`.
  - Record again, plug in headphones mid-take, and see the take stop and keep what it had.

## Results (4 November 2026)

| Check | Result |
| --- | --- |
| The recorder (`run.sh capture`) | 19 of 19, optimised and under ThreadSanitizer: 3 minutes pushed by an audio thread arrive bit for bit, with no allocation in `push()`; the file is readable mid-take; gaps keep their place and length; peak and clipped counts; interruptions; takes started and stopped while the audio thread runs |
| The module | Compiles against React Native's headers and the codegen output for its spec; codegen maps `NativeTakeRecorder` to its provider; the Xcode project parses with the provider in the app's sources |
| Jest | The screen and `takeConditions`, 15 tests; the Record takes buttons on calibration and the overlay. The whole suite: the same three render tests fail as before |
| `npm run harness:test` | C++: 26 of 26. Python: 26 of 26, with 5 for `inspect` |
| End to end | A take written by the C++ recorder passes `harness:inspect` |
| Every other check | typecheck, lint, `test:tooling`, the architecture check (with the take-recording flows), the scenario gate 46 of 46 |

Built differently from the plan:

- **The ring holds 5.5 s**, a power of two (262,144 samples), not 4 s.
- **The exactness test pushes 3 minutes**, not 10, so the suite stays quick; ThreadSanitizer runs 20 s.
- **`meta.json` is written by JavaScript**, provisionally when a take starts and finished when it stops, so a take survives a JS reload and its fields are tested in Jest. C++ writes only the audio.
- **The 5.2 take list leaves out "Backing alone"** until the app can play the backing; take 9 is the learning-mode half.

On your iPhone, after `cd ios && pod install` (a new native module) and a Release build:

1. On the calibration screen, tap **Record takes** (top left).
2. Record 30 s of a few notes and watch the counts move; dropped should stay at 0. Stop.
3. Find the take in Files › On My iPhone › Piano Academy Studio › Takes; copy it to the Mac; run `npm run harness:inspect -- <take folder>`.
4. Record again and plug in headphones mid-take: the take stops, keeps what it had, and says why.

## Delivery

Commits on `claude/chore-setup`: the recorder and its tests; the module and the iOS wiring; the screen; then the docs (harness guide, flows, roadmap, glossary and this spec's results).
