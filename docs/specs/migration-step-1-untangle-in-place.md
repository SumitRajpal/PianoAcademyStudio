# Feature: Migration step 1, untangle in place

- **Status:** Built on 4 November 2026 on `claude/chore-setup`; waiting for the owner's iPhone check. Approved the same day with every recommendation: the overlay and messages in LessonScreen (1a), note names out of the engine now (2a), and the wires-at-mount flow step (3a)
- **Owner's request:** 4 November 2026: start building with "Reshape then Harness": UI Phase 1's migration step 1 (untangle in place), then step 2 (`packages/CoreEngine`), then the engine's Phase 0 harness. Step 1, as approved in [UI Phase 1, Migration plan](../../documentation/04-ui-phase-1-structure.md#migration-plan): "Sinks replace the engine's imports of PianoMaster's `pianoState`. PianoMaster stops re-exporting the engine. The diagnostics overlay, `STATUS_MESSAGES` and `calibrationGuide` move out to the screens that use them. Gate: golden frames identical."

## Goal

Nothing changes for the player. In the code, the note engine stops reaching into PianoMaster and PianoMaster stops exposing the engine, so step 2 can move the engine into `packages/CoreEngine/` as a pure move.

## Behaviour

Unchanged, and checked as such:

- Launch opens calibration; saving it opens the lesson; the overlay's Calibrate button returns to calibration.
- A played key lights within one frame, from the UI thread's frame callback. A key struck and released between two frames still lights for 120 ms, and the softest strike lights at 0.55.
- Calibration's green and red flashes still come through the JS event bus (700 ms, not frame-critical).
- The overlay shows the same note, cents, needle, timing line and microphone messages, in the same words.
- Edge cases keep today's handling: the microphone refused or interrupted (same messages), the mock engine in Jest (keys pressed from the event bus), a key being written at the instant it is read (read again next frame).

## What moves

| Today | After step 1 |
| --- | --- |
| `liveKeys.ts` and `useCorePianoNotesDetection.ts` import `pressKey`, `releaseKey` and `PianoState` from PianoMaster's key state | The engine takes a **key sink**, `{ press(midi, level), release(midi) }`: two worklets it calls on the UI thread. PianoMaster's key state makes one: `pianoKeySink(state)`, or `usePianoKeySink(state)` in a component |
| `useCorePianoNotesDetection({ pianoState })`, `useLiveKeys(pianoState)`, `readLiveKeys(state, …)` | `useCorePianoNotesDetection({ keySink })`, `useLiveKeys(keySink)`, `readLiveKeys(keySink, …)` |
| PianoMaster's index re-exports 26 engine names | It re-exports none. `App.tsx`, the screens and the design renders import the engine from its own index |
| The `CorePianoNotesDetection` component (connects the engine and, with `showDiagnostics`, draws the tuner and timing overlay) lives in the engine | The same code, renamed `EngineDiagnostics`, in `screens/LessonScreen`, with its look (`engineDiagnosticsLook.ts`) |
| `STATUS_MESSAGES` in the engine | `screens/LessonScreen/micStatusMessages.ts`; the calibration screen imports it from LessonScreen, as it already imports `DESIGN_SIZE` |
| `calibrationGuide.ts` in the engine | `screens/CalibrationScreen/calibrationGuide.ts` |
| `CorePianoNotesDetectionProps` in the engine's types (react-native styles, `PianoState`) | Moves with the overlay; the engine's types import nothing from react-native or PianoMaster |

Staying in the engine until a later step:

- How a detected key lights (`softestLevel` 0.55, `shortestLitMs` 120): the reader needs both every frame. They stay in the engine's look and move to PianoStage in step 3.
- The hook `useCorePianoNotesDetection`: screens wire the engine through it until PianoStage and LessonKit exist (step 3).

## Questions for the owner

1. **Where the overlay and the microphone messages go.**
   - (a) `screens/LessonScreen`, beside the lesson they sit over; the calibration screen imports the messages from there. *Recommended.*
   - (b) A new `screens/EngineDiagnostics` module that App.tsx and the calibration screen import.
   - (c) Into `App.tsx` itself.
2. **Note names out of the engine now.** Phase 1's rule 1 says the engine speaks MIDI numbers, and step 2's package cannot import the app's `src/shared`. Today the hook turns `expected` note names into MIDI numbers and gives `latestNote` a name.
   - (a) In step 1: `expected` takes MIDI numbers and `latestNote` drops its name, which the overlay works out itself. Nothing in the app passes names today. *Recommended*, so step 2 stays a pure move.
   - (b) Leave it for step 2.
3. **How `flows.md` shows the screen that wires the sink.** Once the engine stops importing the key state, the only code connection between the two is the screen that hands over the sink when it mounts. `/arch hot-path` would then flag that screen as JavaScript inside the hot path, though nothing runs there per frame.
   - (a) Teach the flow checker one notation: a step in square brackets, `[screens/LessonScreen]`, wires its neighbours at mount. The connection check still applies; hot-path labels the step instead of warning. About 30 lines in `scripts/architecture/lib`, with tests; `config.mjs` is unchanged. PianoStage will need the same in step 3. *Recommended.*
   - (b) Name the screen plainly and live with the warning.

## Design

- **Modules touched** (`/arch impact`): the engine (`motion/scenes/PianoMaster/CorePianoNotesDetection`), `motion/scenes/PianoMaster` and its `shared`, `screens/LessonScreen`, `screens/CalibrationScreen` and `App.tsx`, plus the design render `scripts/design/__tests__/calibrationRender.test.ts`. No new modules: the moved files join existing ones. Planes and threads stay as they are: the overlay is APP (js), the sink's worklets sit in MOTION's `shared` (ui), and the reader stays SYNC (any).
- **The sink**, in the engine's `types.ts`:

  ```ts
  /** Where detected keys go. The engine calls both from its UI-thread frame callback, so both must be worklets. */
  export type KeySink = {
    press(midi: number, level: number): void;
    release(midi: number): void;
  };
  ```

  PianoMaster's `pianoKeySink(state)` returns an object of that shape without importing the engine; TypeScript matches the two by shape. `usePianoKeySink` memoises it on the state, so the frame callback is registered once.
- **Data flow**, as `docs/architecture/flows.md` will show it:
  - `key-lights`: `mic -> ios -> engine -> [screens/LessonScreen] -> motion/scenes/PianoMaster -> motion/scenes/PianoMaster/CorePiano -> screen` (brackets if question 3 is (a)).
  - `calibration (js ok)`: `mic -> ios -> engine -> screens/CalibrationScreen -> motion/scenes/PianoMaster/CorePiano -> screen`. The engine no longer passes through PianoMaster.
- **Hot path:** per frame, one thing changes: the frame callback calls `keySink.press` where it called `pressKey`, one function call per changed key on the UI thread. No JS thread, no allocation, no React render.
- **Motion:** none. Nothing on screen changes, so there is no motion spec.

## Plan

### Tests first

1. `pianoState.test.ts`: pressing and releasing through `pianoKeySink(state)` leaves exactly the key lights that `pressKey` and `releaseKey` leave, levels included.
2. The key-table reader tests write to a recording sink: the same presses, levels and releases, in the same order, as today's expectations, including a key struck and released between two looks.
3. The hook test: with the mock engine, notes reach the sink from the event bus.
4. The moved tests keep their assertions: the overlay's (HUD, Calibrate button, microphone messages, stats polling) in LessonScreen, the calibration guide's in CalibrationScreen.

### Files

| Where | Change |
| --- | --- |
| Engine `types.ts` | Add `KeySink`; drop the overlay's props and the imports of react-native, `PianoState` and `NoteInput` |
| Engine `liveKeys.ts` | The reader and `useLiveKeys` write to a sink |
| Engine `useCorePianoNotesDetection.ts` | `keySink` replaces `pianoState`; the mock path presses through it; MIDI numbers only (question 2) |
| Engine `index.ts`, `corePianoNotesDetectionLook.ts` | Drop the moved exports; the look keeps only `keys`; `@purpose` updated |
| Engine `CorePianoNotesDetection.tsx`, `calibrationGuide.ts` | Moved out, as below |
| Engine `__tests__/CorePianoNotesDetection.test.tsx` | Split: the engine's tests stay; the overlay's and the guide's move |
| PianoMaster `index.ts` | Drop the engine block; export `pianoKeySink`, `usePianoKeySink` and `PianoKeySink`; `@purpose` updated |
| PianoMaster `shared/pianoState.ts`, `shared/index.ts` | Add the sink |
| `screens/LessonScreen` | Add `EngineDiagnostics.tsx`, `engineDiagnosticsLook.ts`, `micStatusMessages.ts` and their tests; export them |
| `screens/CalibrationScreen` | Add `calibrationGuide.ts` and its tests. `calibrationView.ts` and `CalibrationScreen.tsx` import the engine from its index and the messages from LessonScreen, and pass `usePianoKeySink(piano)` |
| `App.tsx` | Renders `EngineDiagnostics` from LessonScreen |
| `scripts/design/__tests__/calibrationRender.test.ts` | Imports from the engine's index and CalibrationScreen |
| `scripts/architecture/lib/flows.mjs`, `query.mjs` and their tests | The bracket step (question 3) |
| `docs/architecture/flows.md`, `docs/note-events.md`, `docs/piano-pressed-keys.md`, `docs/glossary.md` | The sink, the new flows, and "Key sink" in the glossary |
| `docs/architecture/graph.json`, `ARCHITECTURE.md` | Regenerated by `npm run arch:build` |

### Checks

| Check | Passes when |
| --- | --- |
| `npm run typecheck`, `npm run lint` | Clean |
| `npm test` | Every test passes. Baseline on 4 Nov 2026 in the cloud workspace: 122 of 125. The 3 failures are all EggHatch's, untouched by this step: two renders need macOS's SF Pro Rounded font, and one test times out |
| `npm run test:tooling` | 31 of 31 today, plus the new flow-notation tests |
| `npm run arch:check` | Every rule, purpose and flow passes. `/arch deps` on the engine lists no app module, and `/arch who-uses` on it no longer lists PianoMaster |
| Golden frames | The lesson (no keys, and C4 E4 G4 pressed) and the 5 calibration steps, rendered before and after, are identical pixel for pixel (`compare.mjs` scores 0). EggHatch is untouched; its frames need the Mac's font |
| Engine gate, `test/run.sh scenarios` | 46 of 46, as today; no C++ changes |

### On the iPhone (Release build)

1. Launch: calibration opens as before; struck keys light on its keyboard, and each strike flashes green or red.
2. Save: the lesson opens; single notes, fast repeats and chords light at once, as before.
3. The overlay shows the note, the cents needle and the timing line; Calibrate returns to calibration.
4. With the microphone turned off in iOS Settings, the overlay shows the same message.

### Results (4 November 2026, cloud workspace)

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | Clean |
| `npm test` | 126 of 129 pass. The 3 failures are the baseline's EggHatch tests |
| `npm run test:tooling` | 35 of 35 (31 before, plus 4 for the wiring step) |
| `npm run arch:check` | Passes. The engine uses no app module and is used by the two screens, iOS and Android; PianoMaster no longer uses it. `/arch hot-path` shows no warning |
| Golden frames | All 7 byte-identical before and after (`compare.mjs`: 0.00) |
| Engine gate | 46 of 46 |

Not checked here, because it needs the phone: the four iPhone steps above. In particular, the frame callback now captures the sink object and calls its worklets; Jest mocks the UI thread, so only a Release build proves it on the device.

### Delivery

Commits on `claude/chore-setup`: the sink first (tests, then code), then the moves, then the docs. Each commit passes the checks above. [ADR 0002](../adr/0002-engine-output-through-sinks.md) records the sink decision.
