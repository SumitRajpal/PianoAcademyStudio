# Piano Academy Studio

A piano-learning app: React Native 0.87 (bare CLI, New Architecture, Hermes), TypeScript. It has two equal pillars:

- **Listening:** a C++ note engine hears the piano through the mic: onsets, pitch, chords, calibration.
- **Motion:** advanced 2D animation at 120 fps that moves in sync with the sound.

How this Claude setup works and why: [docs/claude-setup/DESIGN.md](docs/claude-setup/DESIGN.md).

## Working with the owner

- When something is unclear, ask instead of assuming. App features come from the owner's instructions.
- Anything that touches more than one module: write a spec (`/spec`), plan, get the owner's approval, then build.
- Feature branches and Conventional Commits. Commit only when asked. Record decisions with `/adr`.
- The repo is public: personal details (device IDs, team, IP addresses) live only in `CLAUDE.local.md`, which is not committed.

## Platform

- iOS only for now. Android is paused: keep it buildable, but never run an Android build without asking.
- Every build and run goes to the owner's iPhone, never a simulator or emulator. Device commands: `CLAUDE.local.md`.
- Landscape only, full screen; keep the safe area.
- Judge frame rate on Release builds only (Debug runs worklets unoptimised).

## Architecture

- A compact map is loaded at session start. `/arch` answers who-uses, deps, impact, path, hot-path and check.
- Planes are assigned by role in `scripts/architecture/config.mjs`:
  - AUDIO: the CorePianoNotesDetection engine and the native mic input
  - SYNC: the LiveKeys table and the note event bus
  - MOTION: PianoMaster's visuals and the game scenes
  - SHARED, PLATFORM, APP
- Every module starts with `/** @purpose … */`. Add `@thread ui|js|audio|native|any` only when the default is wrong.
- `docs/architecture/graph.json` and sections 1–6 of `ARCHITECTURE.md` are generated; never edit them. Claude keeps `docs/architecture/flows.md` and the Conventions section true.
- Changing `scripts/architecture/config.mjs` or anything in `.claude/` needs the owner's OK (a hook asks).

## Golden rules

1. The JS thread is never in the hot path from a played note to the screen. The engine writes the LiveKeys table; a UI-thread frame callback reads it ([docs/note-events.md](docs/note-events.md)).
2. UI-thread code never imports hooks, components or JS-only modules, and per-frame code never hands work back to JS.
3. PianoMaster is the source of truth for the piano: key positions come from `layoutKeyboard()` / `layoutCorePiano()`, and keys light through the key state. Never compute key geometry anywhere else.
4. Motion libraries:
   - Piano-related motion uses React Native Skia (package `react-native-skia`), with Reanimated only when it moves.
   - Non-piano animation (mascots, celebrations, flourishes) uses Rive.
   - Ordinary view transitions aren't decided yet: ask.
5. Looks live in each component's `xLook.ts` or the scene's `*Design.ts`. Atoms are draw functions recorded into Skia pictures, one folder per atom, named as the owner set out.
6. Never replay saveLayer or blur pictures every frame; bake them into textures.

## Checks

The hooks run these automatically on what changed; run them yourself when you need to.

- `npm run typecheck` · `npm run lint` · `npm test` (Jest, with Skia rendering headless)
- `npm run test:tooling`: the architecture scripts and the Claude hooks
- The note engine's regression gate: `src/motion/scenes/PianoMaster/CorePianoNotesDetection/test/run.sh scenarios` (and `run.sh engine` for ThreadSanitizer after threading changes)
- Visual checks: `DESIGN_OUT=/tmp/lesson.png npx jest scripts/design`, scored with `node scripts/design/compare.mjs`. EggHatch frames: `EGG_TIME=… EGG_OUT=… npx jest scripts/design/__tests__/eggHatchRender.test.ts`. After any visual change, render the frames and look at them before reporting.

## Where things go

| What | Where |
|---|---|
| Decisions | `docs/adr/` (`/adr`) |
| Feature specs | `docs/specs/` (`/spec`) |
| Motion specs | `docs/motion/` |
| Terms | `docs/glossary.md` |
| Phases and tasks | `docs/roadmap.md` |
| Build errors and fixes | `docs/troubleshooting.md`. Add an entry whenever you solve a new one. |
| Session handoff notes | `.claude/handoff/` (local only). `/handoff` writes a summary. |
