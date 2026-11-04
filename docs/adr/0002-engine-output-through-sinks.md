# 0002. The note engine hands detected keys to a sink

- **Status:** Proposed
- **Date:** 2026-11-04
- **Decided by:** proposed by Claude, waiting for the owner (part of [migration step 1](../specs/migration-step-1-untangle-in-place.md))

## Context

The engine lights CorePiano's keys by importing PianoMaster's key state (`pressKey`, `releaseKey`, `PianoState`) into its UI-thread reader. That import is what ties the engine to the app's motion code. UI Phase 1 moves the engine into its own package, `packages/CoreEngine/`, which imports nothing from the app (Phase 1, dependency rule 1), and core modules such as CorePiano never import the engine (rule 2). The path from a played note to its key must stay off the JS thread (golden rule 1), and the engine reads its key table every frame on the UI thread.

## Options

1. **A sink.** The engine defines `KeySink = { press(midi, level), release(midi) }` and calls those two worklets from its frame callback. PianoMaster's key state makes one (`pianoKeySink`), and the screen, later PianoStage, hands it over at mount. Neither side imports the other; TypeScript matches the shapes. Cost: one function call per changed key per frame.
2. **A shared contract module** that both import, in `src/sync` or `src/shared`. It keeps a code connection, but the engine would import app code again, which the package forbids.
3. **PianoMaster pulls from the engine:** the key state reads the engine's table itself. Core motion code would import the engine, against rule 2, and every other consumer of the table would repeat the reader.
4. **Leave it.** The package cannot import PianoMaster, so step 2 would stall.

## Decision

Option 1, proposed and waiting for the owner.

## Consequences

- The engine's reader, its hook and its mock path write through the sink. PianoMaster's `shared` gains `pianoKeySink` and `usePianoKeySink`.
- The wiring lives in the screens in step 1 and moves to PianoStage in step 3. Phase 3's verdict table can follow the same pattern, with a verdict sink into CoreNotes.
- `flows.md` can no longer show a code connection from the engine to the key state; the module that wires them appears in the flow. Question 3 of the spec settles how `/arch hot-path` treats it.
- No rule in `scripts/architecture/config.mjs` changes in this step. Step 2 points the audio rules at the package, and step 4 adds Phase 1's rules.
