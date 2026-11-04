# Feature: Migration step 2, move the engine into its package

- **Status:** Built on 4 November 2026 on `claude/chore-setup`; waiting for the owner's iPhone check, which covers steps 1 and 2. Approved the same day with every recommendation: a source move (1a) and `@pianoacademy/core-engine` (2a)
- **Owner's request:** 4 November 2026: "Reshape then Harness": migration steps 1 and 2, then the engine's Phase 0 harness. Step 2, as approved in [UI Phase 1, Migration plan](../../documentation/04-ui-phase-1-structure.md#migration-plan): "Create the package with npm workspaces and move the C++, tests, spec, TypeScript side and the iOS and Android audio code into it, with the codegen config. Point `config.mjs` at the new path. Once Phase 3's spike passes, the bindings move to Nitro HybridObjects. Gates: the engine's scenario gate, ThreadSanitizer, and keys still lighting on the iPhone."

## Goal

Nothing changes for the player. Everything the note engine is (its TypeScript, its C++, its tests, its codegen spec, and the iOS and Android audio code) lives in one package, `packages/CoreEngine/`, imported by one name. The Phase 0 harness and Reevo 2 then grow inside it.

## Behaviour

Unchanged, and checked as in [step 1](migration-step-1-untangle-in-place.md): calibration at launch, keys lighting within a frame, the overlay, the microphone messages. The saved calibration stays where it is (Application Support, `NoteEngine/piano-profile.json`), so it survives the update.

## What moves

| Today | After step 2 |
| --- | --- |
| The engine's TypeScript in `src/motion/scenes/PianoMaster/CorePianoNotesDetection/`, with `specs/` and `__tests__/` | `packages/CoreEngine/src/`, files as they are; `src/index.ts` is the only door |
| Its C++ core in `shared/` | `packages/CoreEngine/cpp/legacy/`: pure C++, the current core until Reevo 2 replaces it (Phase 1's layout) |
| `shared/NativePianoEngine.{h,cpp}`, the TurboModule | `packages/CoreEngine/bindings/`, the only C++ that sees React Native |
| The C++ tests and benchmark in `test/` | `packages/CoreEngine/test/`; `run.sh` works as before |
| `ios/PianoAcademyStudio/IosAudioInput.*` and `NativePianoEngineProvider.*` | `packages/CoreEngine/ios/` |
| `android/app/src/main/jni/OboeInput.*` | `packages/CoreEngine/android/` |
| Two design documents of an earlier engine, in the engine folder | `documentation/research/`; deleted on 4 November 2026, when the plan chose Reevo 2 only ([spec](reevo-2-only.md)) |
| `test/benchmark_bin`, a Mac build of the benchmark committed by mistake | Removed from git; `run.sh` builds into the ignored `test/.build/` |

The engine is imported as `@pianoacademy/core-engine` (question 2). The root `package.json` gets `"workspaces": ["packages/*"]` and that dependency. Metro 0.87 always follows the workspace link; Jest and TypeScript resolve it to the package's source.

Staying in the app: the Xcode project, which now compiles the package's files by path; `android/app/src/main/jni/CMakeLists.txt` and `OnLoad.cpp`, which register the C++ module; and the app's `codegenConfig`, whose `jsSrcsDir` points at `packages/CoreEngine/src/specs` (`modulesProvider` unchanged).

Paths that follow the move:

- `scripts/architecture/config.mjs`: the engine path, the package as one module, the import name. The `audio-no-ui` rule, which today watches a folder that doesn't exist, watches the package and forbids any import of app code (Phase 1, dependency rule 1).
- `.claude/`: the stop hook's engine path, the `run.sh` permissions, the iOS and tests rules, and a hook test fixture.
- `CLAUDE.md` (the gate command, the AUDIO plane), the CI workflow (the engine gate), `.gitignore` (`test/.build/`), `flows.md`, `note-events.md` and `claude-setup/DESIGN.md`.

## Questions for the owner

1. **How the package builds natively, for now.**
   - (a) A source move: the app's Xcode project and CMake compile the package's files by path, as they compile the engine's files today. The package gets its own podspec, Android library and autolinking when the bindings move to Nitro after Phase 3's spike; Nitro generates all three. *Recommended*: autolinking a pure C++ TurboModule library still has open fixes upstream ([react-native-community/cli#2799](https://github.com/react-native-community/cli/pull/2799), [facebook/react-native#56938](https://github.com/facebook/react-native/pull/56938)), and anything built now would be replaced by Nitro.
   - (b) A full native library now: `CoreEngine.podspec`, an Android library with C++ module autolinking, and the codegen config inside the package. Replaced when Nitro arrives.
2. **The import name.** (a) `@pianoacademy/core-engine`, *recommended*; (b) `core-engine`; (c) another name.
3. **Path changes outside the code.** The move breaks the paths in `config.mjs`, `.claude/`, `CLAUDE.md` and CI, each of which needs your OK. Approving this spec gives it for the path changes listed above, and for nothing else in those files.

## Design

- **Modules** (`/arch impact`): the engine module becomes `packages/CoreEngine` (AUDIO plane; `liveKeys.ts`, `noteEventBus.ts` and `LiveKeys.h` stay SYNC). Its users stay `screens/LessonScreen`, `screens/CalibrationScreen`, `ios` and `android`. No other module changes.
- **The package's `package.json`**: `"private": true`; `main`, `types` and `react-native` point at `src/index.ts`; React, React Native, Reanimated and Worklets are peer dependencies.
- **Native paths** (question 1a):

  | Where | Change |
  | --- | --- |
  | Xcode project | Header search paths: `packages/CoreEngine/cpp/legacy`, `bindings` and `ios`. The four iOS files' references point into `packages/CoreEngine/ios/`. The provider includes `../bindings/NativePianoEngine.cpp` |
  | Android CMake | `OboeInput.cpp` from `packages/CoreEngine/android/`, `NativePianoEngine.cpp` from `bindings/`; include directories `cpp/legacy`, `bindings` and `android` |
  | Codegen | `jsSrcsDir` → `packages/CoreEngine/src/specs`; `pod install` regenerates the module spec from there |

- **Hot path:** unchanged. The same code runs; only its paths change.
- **Motion:** none.

## Plan

### Tests first

1. An architecture test: the engine package may not import app code (`src/**`, `App.tsx`, `index.js`). It fails today, because the rule watches `src/audio/**`, and passes once `config.mjs` points at the package.
2. The moved tests keep their assertions: the engine's Jest suite, the C++ scenarios and the ThreadSanitizer tests.

### Files

| Where | Change |
| --- | --- |
| `packages/CoreEngine/` | New package: `package.json`, `src/`, `cpp/legacy/`, `bindings/`, `ios/`, `android/`, `test/`; moved with `git mv`, so history follows |
| Root `package.json`, `package-lock.json` | Workspaces, the dependency, the codegen path, the `test:engine` script |
| `src/screens/*`, `scripts/design/__tests__/*` | Import `@pianoacademy/core-engine` instead of the old folder |
| `ios/PianoAcademyStudio.xcodeproj/project.pbxproj` | File references and header search paths |
| `android/app/src/main/jni/CMakeLists.txt`, `OnLoad.cpp` | Paths |
| `test/*.cpp`, `test/run.sh` | Include paths (`../cpp/legacy/`) |
| Paths outside the code | As listed above |
| `docs/architecture/graph.json`, `ARCHITECTURE.md` | Regenerated |

### Checks

| Check | Passes when |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:tooling` | As after step 1, plus the new architecture test |
| `npm run arch:check` | Passes. The engine is `packages/CoreEngine`, uses no app module, and is used by the two screens, iOS and Android |
| Engine gate | `run.sh scenarios` 46 of 46, and `run.sh engine` (ThreadSanitizer) clean, from the new folder |
| Native paths | A script resolves every path in the Xcode project's references and header search paths and in the CMake file: all exist. Neither native build can run in the cloud workspace |
| Golden frames | Identical before and after |

### On the Mac and iPhone (Release build)

1. `npm install`, which creates the workspace link, then `cd ios && pod install`, which regenerates the module spec.
2. The four checks of step 1. One build covers both steps, if step 1 hasn't been tried yet.
3. The calibration screen opens on the keyboard you calibrated last time, which shows the saved profile still loads.

Android is paused: its paths are updated but not built. Say if you'd like an Android build.

### Results (4 November 2026, cloud workspace)

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | Clean |
| `npm test` | 126 of 129, as after step 1; the engine's suite now runs from `packages/CoreEngine/src/__tests__/` |
| `npm run test:tooling` | 38 of 38: the 35 from step 1, plus 3 for the package (one module imported by its name; no app imports; only through its index) |
| `npm run arch:check` | Passes. `packages/CoreEngine` is the engine module (AUDIO), uses no app module, and is used by the two screens and by Android's `OnLoad.cpp`. The flows now start `mic -> packages/CoreEngine`, because the package owns the mic input; the app's `ios` folder no longer includes any engine file |
| Engine gate | `run.sh scenarios`: 46 of 46. `run.sh engine`: ThreadSanitizer runs pass with GCC (this workspace's clang lacks the TSan runtime), and the optimised runs pass with clang. The script's optimised step doesn't compile under GCC, because `engine_test.cpp` uses clang's `__has_feature`; on your Mac's clang the whole script runs |
| Native paths | All 17 engine paths in the Xcode project, the CMake file and the provider's include resolve |
| Golden frames | All 7 byte-identical |

Three details settled while building:

- The package isn't listed under `dependencies`. npm links every workspace package anyway, and leaving it out keeps React Native's autolinking away from its `ios/` and `android/` folders, which the app compiles itself.
- "Imports nothing from the app" is a rule of its own, `engine-imports-no-app`. `audio-no-ui` keeps its wording and now also watches the package.
- The lockfile change is only the 17 workspace lines. The npm here would also have dropped 19 `"peer": true` markers your npm writes, so those were kept.

### Delivery

Commits on `claude/chore-setup`: the architecture test and rule, then the move with every path, then the docs. [ADR 0003](../adr/0003-core-engine-workspace-package.md) records the packaging decision.
