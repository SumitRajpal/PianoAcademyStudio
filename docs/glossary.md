# Glossary

Terms used in this project's code, docs and conversations.

## Music

| Term | Meaning |
|---|---|
| Staff | The 5 horizontal lines music is written on (lines numbered 1 at the bottom to 5 at the top). |
| Note | A notehead (the oval) plus a stem (the line). Names follow SMuFL and [landr's music symbols](https://blog.landr.com/music-symbols/). |
| Ledger line | A short line above or below the staff for notes outside it. |
| MIDI number | A key's number: A0 = 21, middle C (C4) = 60, C8 = 108. The key state is indexed by it. |
| Cents | Hundredths of a semitone: how far a played pitch is from the key's tuned pitch. |
| Octave stretch | Real pianos tune high notes slightly sharp and low notes flat; calibration measures it. |

## Listening (the note engine)

| Term | Meaning |
|---|---|
| Reevo 2 | The note engine being built, from the master plan in `documentation/`. One engine: DSP evidence, and later neural evidence, feed one decision layer. It replaces v1.2. |
| v1.2 (legacy engine) | The engine the app runs today (`packages/CoreEngine/cpp/legacy`), built from the Apex v2.0 design. It gets no new detection work: Phase 0 measures it as the bar Reevo 2 must beat, it stays as a legacy toggle for comparison, and Phase 8 removes it. |
| Apex v1, Apex v2, Reevo | Earlier engine designs, compared in the research report that started Reevo 2 (`documentation/research/`). Reevo 2 keeps Reevo's structure and v1.2 came from Apex v2; none is built on its own. |
| Onset | The moment a key is struck: a jump in new energy, found before the pitch is sure. |
| Partials / harmonics | The frequencies a piano string sounds above its fundamental; they make octave errors possible. |
| MPM / NSDF | The pitch method used for single notes (McLeod pitch method, normalised square difference function). |
| Polyphony | Several notes at once (chords); free mode handles up to 10 voices. |
| Free mode / lesson mode | Free mode detects whatever is played; lesson mode checks against the expected notes. |
| Calibration profile | What calibration measures for the owner's piano (tuning, stretch, soft and firm levels per key), saved as JSON. |
| LiveKeys | The lock-free table (one slot per MIDI note) that the engine writes and the UI thread reads every frame. |
| Key sink | `{ press(midi, level), release(midi) }`: two worklets a screen hands the engine, which calls them from its UI-thread frame callback for every key that changed. PianoMaster's key state makes one (`usePianoKeySink`). The engine and PianoMaster never import each other. |
| NoteEventRing | The last 256 notes in order, read by JS listeners through `noteEventBus`. |

## Motion

| Term | Meaning |
|---|---|
| Hot path | The route from a played note to the pixels that react to it. The JS thread must stay out of it. |
| UI thread / JS thread | Where Reanimated worklets and Skia drawing run, versus where React and app logic run. |
| Worklet | A small function that runs on the UI thread (marked `'worklet'`). |
| Frame budget | Time per frame: 8.3 ms at 120 fps, 16.7 ms at 60 fps, shared by everything on the UI thread. |
| Atom | One drawable part with its own folder: `drawX.ts`, `xLook.ts`, `index.ts`, tests. |
| Golden frame | A frame rendered headless at a chosen moment and compared with an approved image. |
| Contact sheet | Many frames of a recording in one image, so motion over time can be checked by eye. |
| Reduce Motion | The phone's accessibility setting; scenes have a calmer variant for it. |

## Architecture

| Term | Meaning |
|---|---|
| Plane | A role: audio, sync, motion, shared, platform, app. Planes are assigned by role in `scripts/architecture/config.mjs`. |
| Module | A folder with an `index.ts`, or a single file; it has a `@purpose` header. |
| Barrel | An `index.ts` that only re-exports; it runs no code of its own. |
| Flow | A named data path in `docs/architecture/flows.md`, checked against the code. |
