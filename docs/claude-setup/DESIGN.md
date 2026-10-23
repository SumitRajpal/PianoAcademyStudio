# Claude Code setup — design

**Status:** Phase 1 built and live-tested (2026-10-23) · **First written:** 2026-10-15 · **Project:** Piano Academy Studio (React Native 0.87.1, bare CLI)

> **Since the first draft:** the app now has real code (PianoMaster, the C++ note engine, calibration, the lesson screen, EggHatch). Section 2 lists the decisions made since; section 3.6 shows how the planes map onto the real code; section 12 records what was built and verified.

## Summary

Piano Academy Studio has two equal pillars:

- **Listening:** the app hears the piano through the microphone and works out what was played.
- **Motion:** advanced animation that moves in sync with the sound.

The two pillars meet at one shared clock. This setup is built so Claude understands that shape, keeps it intact, and can check its own work in the two areas it can't perceive directly.

- **Phase 1 (built 2026-10-23):** the machinery.
  - An architecture graph built by a script, loaded at every session start and re-checked after every change.
  - `CLAUDE.md` and rules that apply to specific folders.
  - Hooks across the whole session, plus permissions and safety blocks.
  - A status line, docs templates, git hooks and basic CI.
- **Phase 2 (after the app details arrive):**
  - The app's folder layout and its rules.
  - Specialist agents for audio, motion, sync and more.
  - Knowledge and scaffolding skills.
  - The test harnesses that let Claude check sound and motion.
- **Phase 3 (later):** parallel sessions, scheduled audits, packaging the setup as a plugin, release pipelines.

Section 2 lists every decision. Section 13 lists what is still open; nothing open blocks Phase 1.

## 1. Goals

1. Claude knows the architecture at the start of every session, and again after `/clear` and compaction.
2. The architecture map can't go stale: a script builds it from the code, and hooks, git and CI check it.
3. Claude can check its own work on sound and motion, which it can't hear or watch in real time.
4. Rules Claude can't silently break protect the real-time path from a played note to the visual reaction.
5. The machinery is built now; the parts that depend on app details wait for them.

Not in scope yet: choosing audio or animation libraries, writing app features, release pipelines.

## 2. Decisions

The owner accepted every recommendation from the setup questionnaire. Where two recommendations conflicted, the row says how it was resolved.

| Ref | Decision |
|---|---|
| A1 | Phase 1 builds the graph, project memory, hooks, settings and safety, status line and notifications, docs, and git hooks. It also includes basic CI checks: the plan first put CI later, but the graph-update and GitHub answers (B8, D3) need it now. The Claude GitHub Action and build pipelines come later. |
| A4 | Build everything in this repo; turn it into a reusable plugin in Phase 3. |
| A5 | Move the user-level `FEArchitecture` skill into the mooKIT repo so it stops loading here. |
| B1 | Hybrid graph: a script builds the structure; Claude writes the meaning. |
| B2 | All node kinds (section 4.3). The session-start map shows only planes and modules. |
| B3 | All edge kinds. Phase 1 detects imports, render relationships and JS ↔ native calls. Navigation, state and event-subscription edges are added once those libraries are chosen. |
| B4 | Native code (Swift, Kotlin, C++) is included from the start. |
| B5 | `graph.json` plus `ARCHITECTURE.md` with Mermaid diagrams. No HTML viewer. |
| B6 | Files live in `docs/architecture/`. |
| B7 | A compact map at session start; details on request. |
| B8 | The graph updates after every edit, at the end of each turn, on every commit, and in CI. |
| B9 | Graph changes go in the same commit as the code. |
| B10 | A broken connection rule blocks Claude until it's fixed. |
| B11 | Session start also loads the last handoff note, the branch and uncommitted files. |
| C1 | Hooks are written in Node.js, with no new dependencies. |
| C2 | After each edit: prettier and eslint --fix. At the end of the turn: typecheck and related tests. |
| C3 | Before Claude says "done": typecheck, lint, related tests, graph in sync. |
| C4 | Without asking: run tests, lint and typecheck; `pod install`; iOS and Android debug builds. Everything else asks first. |
| C5 | Hard blocks as listed in section 6.3. |
| C6 | Feature branches and Conventional Commits; Claude commits only when asked. |
| C7 | macOS notifications on. |
| C8 | Status line: branch · model · context used · graph status. |
| D1 | A custom graph script using the TypeScript compiler already installed. Add husky and lint-staged. |
| D3 | Install `gh`. CI checks now. Claude GitHub Action later. |
| E3 | Spec → plan → approval → build, for anything that touches more than one module. |
| E4 | Tests first for core logic (detection, timing, scoring, motion drivers); lighter tests for screens. |
| F1, F3 | The audio test harness and the knowledge skills wait for app details. |

Decisions made after the first draft:

| Date | Ref | Decision |
|---|---|---|
| 10-15 | M1 | All four kinds of motion: moving music, live feedback, falling notes, celebrations and characters. |
| 10-15 | M2 | 2D only. |
| 10-15 | M3 | Who makes the designed animations: decide later. |
| 10-15 | M4 | 120 fps. "Device lock" means three things: hold 120 Hz, keep the screen awake, and lock the orientation. All three wait for the owner's instructions. The orientation lock was later set to landscape only, full screen. |
| 10-15 | M5 | Reference apps: Simply Piano and Piano Academy. |
| 10-15 | M7 | Reduce Motion is "declarative settings": follow the phone's setting, add an in-app setting, and declare all of it in one config file. |
| 10-15 | Libraries | Piano-related motion uses React Native Skia (`react-native-skia` v3), with Reanimated only when it moves. Non-piano animation uses Rive (`@rive-app/react-native`). All installed. Ordinary view transitions are still open. |
| 10-15 | D4 | iOS only for now; Android is paused. Every build and run goes to the owner's iPhone, never a simulator (personal details in `CLAUDE.local.md`). |
| 10-23 | Planes | Planes are assigned by role, not folder (section 3.6). |
| 10-23 | Android | Dormant: the rule and build hints exist, but Android builds always ask first (one build downloads 3 GB or more on a tight disk). |
| 10-23 | Lint | The 26 existing ESLint errors (unused imports in EggHatch) were fixed. Rendered EggHatch frames are byte-identical before and after. |
| 10-23 | Art | Claude follows the game art rule shared with another tool (`.agents/rules/…`, `docs/art-style/…`) through `.claude/rules/game-art.md`. |
| 10-23 | A3 | Answered by checking: the GitHub repo is public. Handoff notes, local settings and `CLAUDE.local.md` stay out of git. |

Found while checking the machine:

- The Android SDK is installed at `~/Library/Android/sdk`, but `ANDROID_HOME` isn't set and `adb` isn't on the PATH.
- ffmpeg and Homebrew are installed.
- VS Code has no Mermaid extension. Mermaid diagrams render on GitHub; VS Code's preview may need the "Markdown Preview Mermaid Support" extension.

## 3. The app's shape (proposal — confirm with the app details)

The graph, the rules, the agents and the tests are organized around this shape, so it needs to be settled before Phase 2. Phase 1 doesn't create these folders. The graph tool reads whatever exists, and the layout lives in one config file, so changing it later is cheap.

### 3.1 Planes

```
microphone ──► AUDIO PLANE        native audio thread, real time
                 capture → DSP → onset detection → pitch detection
                 playback: backing tracks, metronome, demos ──► speaker
                    │
                    │  timestamped musical events + the audio clock
                    ▼
               SYNC CORE          one clock for sound and picture
                 latency compensation · event stream the UI thread reads
                    │
          ┌─────────┴──────────────────────┐
          │ every frame                    │ summaries only
          ▼                                ▼
     MOTION PLANE                     APP PLANE
     UI thread + GPU                  JS thread (React)
     drivers → scenes → renderer      screens, navigation, lessons,
     Skia / Reanimated / Rive …       scoring, progress, storage
          │
          ▼
        screen

CONTENT   songs (MIDI, MusicXML) · lessons · motion assets · audio samples
```

| Plane | Runs on | Owns | Never does |
|---|---|---|---|
| Audio | native audio thread | mic capture, playback, DSP, onset and pitch detection | wait on JS; allocate memory, take locks or log inside the audio callback |
| Sync core | shared by the audio and UI threads, lock-free | the shared clock, latency compensation, the event stream | hold app state |
| Motion | UI thread + GPU | animation drivers, scenes, rendering | depend on React state or re-render React every frame |
| App | JS thread | screens, navigation, lessons, scoring, progress, storage | sit between a played note and its visual reaction |
| Content | files | songs, lessons, motion assets, audio samples | — |

**The key rule: the JS thread is never in the hot path.** A React re-render or a garbage-collection pause can take tens of milliseconds at unpredictable moments. So anything that must react to a note within a frame or two runs on the audio thread, the UI thread or the GPU. The JS thread gets summaries (for example "C4 was correct") for scoring and text, where a frame of delay doesn't matter.

### 3.2 One clock for sound and picture

Every musical event carries a timestamp from the audio clock. On each frame, the motion plane works out what the picture should look like at the moment that frame reaches the screen, using the same clock, and draws that.

There are two kinds of sync, and they need different handling:

- **Reacting to what's played (mic → picture).** The visual can only follow the sound, so the job is to keep the delay small and steady. The proposal is two-stage events:
  1. An **onset** event ("a key was hit, now") arrives within a few milliseconds and triggers the immediate reaction.
  2. A **note** event ("it was C4") follows once the pitch is certain, and confirms or corrects the reaction.
- **Following the app's own playback (backing track, metronome, demo → picture).** The app knows what's coming, so visuals are placed by the audio playback position, shifted by the output delay. Bluetooth headphones commonly add 100–300 ms of delay, so this needs a latency calibration step. The app could measure the delay itself by playing a click and hearing it through the mic.

These delays can't be avoided; Phase 2 measures them on real devices:

| Stage | Rough size | Why |
|---|---|---|
| Mic buffer | ~3–10 ms on iOS; usually more on Android, and it varies by device | buffer size ÷ sample rate (256 samples at 48 kHz ≈ 5.3 ms) |
| Onset detection | about one short analysis frame (~5–10 ms) | a jump in energy is quick to spot |
| Pitch detection | ~10 ms for high notes, up to 70+ ms for the lowest | needs about two cycles of the sound wave; one cycle of A0 (27.5 Hz) lasts 36 ms |
| Event → UI thread | under 1 ms through shared memory; a frame or more through JS | why JS stays out of the path |
| Waiting for the next frame | 0–16.7 ms at 60 Hz; 0–8.3 ms at 120 Hz | — |

The pitch-detection row is why events come in two stages: on the lowest keys, waiting for the pitch before reacting would feel late.

### 3.3 Proposed folder layout

```
src/
  app/          entry point, providers, navigation root
  screens/      one folder per screen; thin, composes features and scenes
  features/     lessons, practice, songs, progress …
  audio/        native bridge, detection API, event types
  sync/         clock, latency compensation, event stream
  motion/
    scenes/     full animated compositions
    drivers/    musical events + time → animation values
    primitives/ reusable pieces: particles, trails, glows
    tokens/     durations, easing curves, springs
  ui/           design system: static components, theme, type
  state/        app state stores
  services/     storage, analytics, network
  content/      lesson and song loaders
  shared/       types, utilities, music-theory tables
native/         Turbo Modules and shared C++ DSP, if needed
assets/         motion/ (Rive, Lottie, shaders) · audio/ (samples) · fonts/
```

`audio/` is the audio plane, `sync/` the sync core, `motion/` the motion plane. Everything else under `src/` is the app plane.

### 3.4 Connection rules

As built in `scripts/architecture/config.mjs` (2026-10-23). Rules with no matching files do nothing.

1. Screens never touch audio internals or native modules. They use PianoMaster, or the engine's `index.ts`.
2. Features and the note engine are imported only through their public `index.ts`.
3. Motion code under `src/motion/` may not import features, screens, state stores or audio; it uses other motion code, `sync/` and `shared/`.
4. Audio code has no UI imports.
5. Code that runs every frame in motion, including the game scenes, never hands work back to the JS thread (`runOnJS`, `scheduleOnRN`).
6. Motion code takes durations and easing from its look or design file (`xLook.ts`, `*Design.ts`), not hard-coded numbers.
7. **Thread boundary, judged by symbol.** UI- or audio-thread code may not import a hook or a React component (found through barrels too), or a file that is plain JS-thread code, such as the TurboModule wrapper. Importing constants, types or worklets from a file that also exports a hook is fine.
8. No circular imports (runtime imports only; type-only imports don't count).

Native `#include` links are approximate, so the rules judge only JS/TS imports.

### 3.5 What the architecture must allow for motion

- **Kinds of motion (decided, M1):** all four. Moving music, live feedback on keys and notes, falling notes, and celebrations and characters. 2D only (M2).
- **Libraries (decided 2026-10-15, installed):**
  - Piano-related motion uses React Native Skia v3 (`react-native-skia`), plus Reanimated 4 only when it moves.
  - Non-piano animation (mascots, celebrations, flourishes) uses Rive.
  - Ordinary view transitions are still open.
  - The ADR for this rule is due when Phase 2 starts.
- **Frame budget:** 16.7 ms per frame at 60 Hz, or 8.3 ms at 120 Hz. Everything on the UI thread shares it.
- **Long practice sessions:** mic, DSP and GPU work together heat the phone, and the phone then slows itself down. Scenes need quality tiers, such as fewer particles or a lower frame rate, that switch on when frames start dropping.
- **Reduce Motion (decided, M7):** every scene has a calmer variant. One motion settings file declares the behaviour. It follows the phone's setting, and an in-app setting can override it.
- **Motion specs:** each scene gets a short spec in `docs/motion/` covering:
  - what triggers it
  - timing and easing tokens
  - sync tolerance
  - the reduced-motion variant
  - its frame budget
  - the moments to check as golden frames (section 9.3)

### 3.6 The real layout, and planes by role (2026-10-23)

The code grew differently from the proposal in 3.3, and the owner chose to keep the folders and assign planes by role:

| Plane | Real code |
|---|---|
| SYNC | `CorePianoNotesDetection/liveKeys.ts` and `noteEventBus.ts`, and `shared/LiveKeys.h`: the lock-free key table the UI thread reads every frame, and the JS event bus |
| AUDIO | the rest of `src/motion/scenes/PianoMaster/CorePianoNotesDetection/` (the C++ engine and its TypeScript side), `ios/…/IosAudioInput`, `NativePianoEngineProvider`, `android/app/src/main/jni/` |
| MOTION | `src/motion/**` (PianoMaster: CorePiano, CoreNotes, shared key state) and the game scenes' `scene/`, `entities/`, `shared/` and `*Design.ts` |
| SHARED | `src/shared/` (the piano model, typography) |
| PLATFORM | `ios/`, `android/` |
| APP | `App.tsx`, `index.js`, the screens |

Threads follow role too, in this order:

1. The file's own `@thread` tag.
2. A barrel → any.
3. The config's `threads` list: looks, designs and types are any; the engine's TypeScript side is js.
4. React components and hooks → js.
5. The plane's default.

The graph links the iOS and Android native code to the engine through `#include` paths, and the TurboModule spec to the C++ module through its `kModuleName`.

Real flows, written in `docs/architecture/flows.md` and checked against the code:

- **key-lights:** mic → ios → CorePianoNotesDetection → PianoMaster/shared → CorePiano → screen. No JS on the way.
- **calibration (js ok):** mic → ios → CorePianoNotesDetection → PianoMaster → CalibrationScreen → CorePiano → screen. This flow crosses the JS thread on purpose; its 700 ms flashes aren't frame-critical.

## 4. Architecture graph (Phase 1)

### 4.1 Files

| File | Written by | Purpose |
|---|---|---|
| `scripts/architecture/config.mjs` | owner or Claude (Claude must ask) | planes, folder patterns, default thread per folder, connection rules |
| `scripts/architecture/build.mjs` | — | scans the code; writes `graph.json` and the generated parts of `ARCHITECTURE.md` |
| `scripts/architecture/check.mjs` | — | staleness, rule violations, modules missing a purpose, flows naming missing modules |
| `scripts/architecture/query.mjs` | — | who-uses, deps, impact, path, hot-path |
| `scripts/architecture/summary.mjs` | — | the compact map for session start |
| `docs/architecture/graph.json` | the script only | nodes and edges; hand edits are blocked |
| `docs/architecture/ARCHITECTURE.md` | script + Claude | generated overview, file tree, diagrams and connection tables, plus a conventions section Claude writes |
| `docs/architecture/flows.md` | Claude | named data flows (for example mic → … → screen), checked against the graph |

`ARCHITECTURE.md` keeps FEArchitecture's four sections: overview, file tree, connections and conventions. The script generates the first three, so they're always correct. Claude writes only the conventions section, inside markers that the generator leaves alone.

### 4.2 Where the meaning comes from

- **Module purpose:** a header comment in each module's `index.ts`, for example `/** @purpose Turns note events into key-glow intensity per frame. */`. It lives next to the code, so it moves when the module is renamed, and the script copies it into the graph.
- **Thread:** each folder has a default thread in the config. A file can override it with `@thread ui|js|audio|any`. The scanner also spots worklet code.
- **Flows:** Claude writes them in `flows.md` as arrow lists. The checker confirms that every module named in a flow exists and that each step matches a real connection in the code. If Claude describes a flow the code doesn't have, the check fails.

### 4.3 Graph contents

- **Node kinds:** plane, module, file, component, screen, scene, driver, store, native-module, service, asset.
- **Every node carries:** id, path, plane, thread, purpose, exports, and a flag marking connections that were detected only approximately.
- **Edge kinds:** imports, renders, navigates, calls-native, subscribes (to an event stream), reads-store, uses-asset, driven-by (the clock), flows-to (from `flows.md`).
- **Native links:** the scanner reads Turbo Module spec files on the JS side and matches them by name to the Swift, Kotlin or C++ implementation. Includes between native files are found by pattern matching and marked approximate.

`graph.json` has no timestamps and is sorted, so the same code always produces the same file. That turns "is it stale?" into a plain diff in CI. On a merge conflict, regenerate the file instead of merging it by hand.

### 4.4 What Claude sees at session start

At most about 1,500 tokens. When the map is too long, it's trimmed in this order of priority: planes and modules first, then flows, then rules and violations, then recent changes. Example with made-up modules:

```
Architecture map · 14 modules · 0 rule violations · graph up to date
AUDIO   audio/capture            mic input, native                 [audio]
        audio/detection          onset + pitch → note events       [audio]
SYNC    sync/clock               audio time ↔ frame time           [any]
MOTION  motion/scenes/Keyboard   glowing keys ← note events        [ui]
APP     features/lesson          lesson flow, scoring → Keyboard   [js]
Flow note-feedback: mic → audio/capture → audio/detection → sync/events
                    → motion/drivers/keyGlow → motion/scenes/Keyboard
Last session: added sync/clock tests · open: calibration screen
Branch feat/clock · 3 uncommitted files
More: /arch who-uses <x> · deps <x> · impact <x> · path <a> <b> · hot-path
```

If the code changed outside Claude since the last build, the hook rebuilds the graph before printing.

### 4.5 When it updates

| Trigger | What runs | Target time |
|---|---|---|
| Each edit by Claude | rebuild of the changed files only (cached) | under 1 s |
| End of Claude's turn | full check (4.6), typecheck and related tests | under 60 s, and only if files changed |
| `git commit`, by anyone | rebuild; stage `graph.json` and `ARCHITECTURE.md` into the same commit; check rules | under 5 s |
| Pull request or push | rebuild; fail if the result differs from the committed graph or breaks a rule | — |

Writes are atomic and locked, so two hooks running at once can't corrupt the files.

### 4.6 How Claude keeps the meaning up to date

At the end of each turn, the Stop hook checks for:

- modules with no `@purpose`
- flows that name missing modules or claim connections that don't exist
- rule violations

If it finds any, it blocks the finish and tells Claude exactly what to fix. For example: "2 new modules lack a purpose: `src/sync/clock`, `src/motion/drivers/keyGlow`." Claude fixes them, then finishes.

A loop guard lets Claude finish on the second attempt even if something is still unresolved. When that happens, the problem goes into the handoff note, so it's never silently dropped.

### 4.7 `/arch` queries

| Command | Shows |
|---|---|
| `/arch` | the map |
| `/arch who-uses <x>` | everything that uses `x` |
| `/arch deps <x>` | everything `x` uses |
| `/arch impact <x>` | everything affected by changing `x`, including screens and scenes |
| `/arch path <a> <b>` | how two parts connect |
| `/arch hot-path` | the route from mic to screen, with the thread of every step |
| `/arch check` | the full check |

The answers come from the graph script, so they're exact and cost almost no tokens.

## 5. Project memory (Phase 1)

**`CLAUDE.md`** is short and points to everything else. It covers:

- what the app is, and its two pillars
- the commands to run, lint, test and build
- the architecture map: loaded automatically, with `/arch` for details
- the golden rules: the hot path, threads and connection rules
- the workflow:
  - spec → plan → approval for anything that touches more than one module
  - tests first for core logic
  - feature branches and Conventional Commits
  - commits only when asked
- where docs go
- the owner's preference: when something is unclear, ask instead of assuming

**`.claude/rules/`**: each rule file loads only when Claude works on matching paths.

| Rule file | Applies to | Phase |
|---|---|---|
| `ios.md` | `ios/**` | 1 |
| `android.md` | `android/**` | 1 |
| `tests.md` | test files | 1 |
| `audio.md` | `src/audio/**`, `native/**` | 2 |
| `sync.md` | `src/sync/**` | 2 |
| `motion.md` | `src/motion/**` | 2 |
| `ui.md` | `src/screens/**`, `src/ui/**` | 2 |

The audio, sync, motion and ui rules wait for Phase 2 because their contents depend on the libraries chosen.

**`docs/`**:

| Path | Holds |
|---|---|
| `adr/` | decision records; 0001 records this setup |
| `specs/` | the feature spec template |
| `motion/` | the motion spec template |
| `glossary.md` | music, audio and motion terms |
| `roadmap.md` | phases and tasks, until a task tracker is picked |
| `troubleshooting.md` | build errors and their fixes; Claude adds an entry each time it solves one, and the build-failure hook reads them |

**Handoff notes** live in `.claude/handoff/`. They stay out of git until A3 (public or private repo) is answered.

## 6. Hooks, settings and safety (Phase 1)

### 6.1 The session lifecycle

```
Claude Code session
├─ starts, /clear, or compaction
│    SessionStart ........ map, last handoff note, branch, saved state
├─ you send a message
│    UserPromptSubmit .... details of any module you name
├─ Claude reads, edits and runs commands
│    PreToolUse .......... blocks secrets, generated files, risky git,
│                          rule-breaking edits; asks before setup changes
│    PostToolUse ......... prettier + eslint, graph rebuilt
│    failed build ........ known fix added to the error
├─ Claude is about to finish
│    Stop ................ graph check, typecheck, related tests
├─ before compaction
│    PreCompact .......... saves working state
├─ Claude needs you
│    Notification ........ macOS alert
└─ session closes
     SessionEnd .......... writes the handoff note

git commit ....... husky: format, graph rebuilt and staged, rules, message
pull request ..... GitHub Actions: lint, typecheck, tests, graph, rules
```

### 6.2 Hook list

All hooks are Node.js scripts in `.claude/hooks/`, using nothing beyond Node and the TypeScript package already installed. Each hook has tests that feed it recorded inputs. These tests use Node's built-in test runner, separate from the app's Jest tests.

| Event | What it does | Blocks? | Time limit |
|---|---|---|---|
| SessionStart (start, resume, `/clear`, compaction) | loads the map, the last handoff note, the branch and uncommitted files, open violations, and the state saved before compaction | no | 2 s |
| UserPromptSubmit | when your message names a module, screen or scene, adds a short note of its purpose, connections and rules; also records when the turn started | no | 0.3 s |
| PreToolUse (Edit, Write) | blocks edits to protected and generated files; blocks an edit that would break a connection rule, before the edit lands; asks the owner before Claude changes its own setup (`.claude/` and the architecture config) | yes | 0.3 s |
| PreToolUse (Bash) | blocks force push and branch deletion; blocks commands that touch secret or protected files (best effort, with the deny rules as a second layer) | yes | 0.1 s |
| PostToolUse (Edit, Write) | runs prettier and eslint --fix on the file and reports anything left unfixed; rebuilds the graph for that file; records the changed files | feedback only | 2 s |
| Failed build (iOS, Android or pods) | matches the error against `troubleshooting.md` and known patterns, and adds the fix | no | 0.5 s |
| Stop | if files changed: graph check (4.6), typecheck, related tests and lint; a macOS alert if the turn took over 30 s | yes | 60 s |
| SubagentStart | gives Claude's helper agents the compact map | no | 1 s |
| PreCompact | saves the working state: changed files, failing checks, branch | no | 1 s |
| SessionEnd | writes the handoff note: what changed, check status, open problems. `/handoff` adds a written summary on request | no | 2 s |
| Notification | a macOS alert when Claude needs the owner | no | 1 s |

A hook that crashes never blocks work. It lets the action through and logs the error to `.claude/state/hook-errors.log`. The security blocks are repeated as permission deny rules, so a crashed hook doesn't leave a gap.

### 6.3 Permissions

| Level | Commands and files |
|---|---|
| Allowed without asking | lint, prettier, eslint, typecheck, jest, the architecture scripts, `pod install`, iOS and Android debug builds, read-only git (`status`, `diff`, `log`) |
| Asks first | `npm install` of new packages, `git commit`, `git push`, `gh pr create`, anything not listed here |
| Never | reading or editing `.env*` files, keystores (`*.keystore`, `*.jks`), certificates or provisioning profiles (`*.p12`, `*.cer`, `*.mobileprovision`); editing `ios/Pods/**`, build folders, `graph.json` or lockfiles by hand; `git push --force`; deleting branches |

- The default permission mode stays as it is.
- The shell sandbox stays off, because iOS and Android builds need wide file and network access. This can be revisited.
- Shared settings live in `.claude/settings.json`, which is committed.
- Personal overrides go in `.claude/settings.local.json`, which is gitignored.

### 6.4 Status line

```
feat/clock · Opus 5.5 · ctx 42% · arch ✓
```

`arch ⚠ 2` means the graph has 2 problems; `/arch check` lists them.

### 6.5 Git hooks (husky + lint-staged)

- **pre-commit:** prettier and eslint on staged files; rebuild the graph and stage it; check the connection rules.
- **commit-msg:** a small script checks the Conventional Commits format, so commitlint isn't needed.

These hooks run on everyone's commits, so the graph stays right even when Claude isn't involved.

### 6.6 CI (GitHub Actions)

`checks.yml` runs on every pull request and every push to main:

- `npm ci`
- lint
- typecheck
- the app's tests and the tooling tests
- graph up to date
- connection rules

It runs on Linux, with no iOS build yet. The Claude GitHub Action comes later.

`gh` is installed with Homebrew. The owner runs `gh auth login` once.

## 7. Skills and slash commands

| Phase | Skills |
|---|---|
| 1 | `/arch`; `/handoff`; `/adr` (new decision record); `/spec` (new feature spec) |
| 2: building | `/new-feature`, `/new-screen`, `/new-component`, `/new-native-module`. Also `/new-scene`, which creates a scene with its driver, motion spec and golden-frame tests, and adds it to the graph |
| 2: checking | `/audio-check` (accuracy on recordings); `/sync-check` (delay report per stage); `/frame-check` (frames Claude looks at); `/perf-check` (frame rate, dropped frames, thread load) |
| 2: knowledge | audio DSP; music theory; motion graphics (Reanimated and worklets, Skia and shaders, Rive and Lottie, frame budget); audio-visual sync (clocks, latency, scheduling); RN New Architecture; iOS audio; Android audio; RN performance |
| 3 | `/release` |

## 8. Specialist agents (Phase 2)

Each agent has its own context and tool list. Its model is chosen once E2 (billing and cost limit) is answered.

| Agent | Owns | Tools |
|---|---|---|
| architect | layout, rules, graph, structural reviews | read, query, edit docs |
| audio-engineer | capture, DSP, detection, native audio | full |
| motion-engineer | scenes, drivers, shaders, frame budget | full |
| sync-engineer | clock, latency, scheduling, calibration | full |
| ios-native, android-native | platform code, permissions, audio sessions | full |
| ui-engineer | screens, design system, accessibility | full |
| test-engineer | recordings, virtual clock, golden frames | full |
| visual-reviewer | compares captured frames with motion specs and designs | read-only |
| performance-auditor | dropped frames, thread load, memory, heat | read and run |
| code-reviewer | checks changes against the rules | read-only |

## 9. How Claude checks what it can't hear or see

### 9.1 Code (Phase 1)

Formatting, lint, typecheck, related tests and graph checks, all run by the hooks in section 6.

### 9.2 Sound (Phase 2)

- **Recordings:** a library of real piano recordings with known answers, covering single notes, chords, scales, fast passages and a noisy room.
- **Test tones:** generated tones that are pure, have overtones, are out of tune, or are mixed with noise.
- **Accuracy test:** an offline test runs detection on all of these and reports accuracy and delay per register (low, middle and high notes). A drop in accuracy fails the test.
- **Real devices:** the final delay checks.

### 9.3 Motion (Phase 2)

Claude can't watch animation, but it can open images and read numbers. So every motion check produces one or the other.

- **Pure drivers.** A driver is a function from (events, time) to animation values. With a virtual clock, Jest can check something like "40 ms after a C4 onset, the C4 key glow is 0.8" without a device.
- **Golden frames.** A test renders a scene at chosen moments from a scripted sequence of events, saves PNGs, and compares them with approved reference images. Claude opens the images to judge new scenes, and the owner approves new reference images. Skia rendering without a screen needs a feasibility check in Phase 2.
- **Contact sheets.** Record the simulator screen, then use ffmpeg (already installed) to turn the recording into one grid image of frames. Claude reads that image to see the motion over time.
- **Sync reports.** Every stage stamps the same clock: sound captured, detected, delivered, frame shown. A test turns the stamps into a delay table and a timeline chart image. A delay over budget fails the test.
- **Performance.** Frame rate and dropped frames per scene, from `dumpsys gfxinfo` on Android and Instruments on iOS, plus UI-thread and JS-thread load. Each scene gets a budget.
- **End-to-end:** Detox or Maestro flows with screenshots.

What still needs the owner: how it *feels*. Whether sound and picture seem to happen together, and whether it looks beautiful, has to be judged on a real device. Simulator timings are not device timings.

## 10. Plugins and integrations (Phase 2, question D2)

Candidates from the official plugin marketplace:

- Code navigation for each language: `typescript-lsp`, `swift-lsp`, `kotlin-lsp`, `clangd-lsp`.
- `context7` for current library docs.
- `github` and `sentry`.
- `figma`, which must be authorized with `/mcp` before use.
- Simulator control, through the third-party XcodeBuildMCP or mobile-mcp. Contact sheets and screenshots depend on it.

## 11. What Phase 1 adds

```
CLAUDE.md               public project instructions
CLAUDE.local.md         gitignored: device, team and Mac details
.claude/
  settings.json         permissions, hooks, status line (shared)
  hooks/                one script per event + lib/ + __tests__/
  rules/                ios.md, android.md, tests.md, game-art.md
  skills/               arch/, handoff/, adr/, spec/ (+ react-native-skia, added earlier)
  statusline.mjs
  state/                gitignored: changed files, caches, hook errors
  handoff/              gitignored (the repo is public): session handoff notes
scripts/architecture/   config, build, check, query, summary + __tests__/
scripts/git/            check-commit-msg.mjs
docs/
  claude-setup/DESIGN.md  this document
  architecture/         graph.json, ARCHITECTURE.md, flows.md
  adr/                  0001-claude-code-setup.md, TEMPLATE.md
  specs/  motion/       templates
  glossary.md  roadmap.md  troubleshooting.md
.husky/                 pre-commit, commit-msg
.github/workflows/checks.yml
```

Also in the repo:

- `package.json` gets the scripts `typecheck`, `test:tooling`, `test:engine`, `arch:build`, `arch:check`, `arch:query` and `prepare`, a lint-staged config, and the dev dependencies `husky` and `lint-staged`.
- `.gitignore` gets the local Claude files.
- `.eslintrc.js` gets an override so ESLint parses the `.mjs` tooling as modern ESM.

Outside the repo (not done yet; section 13):

- Move `FEArchitecture` into the mooKIT repo, after confirming where the owner launches Claude for mooKIT.
- Install `gh`.
- `ANDROID_HOME` waits until Android comes back.

## 12. What was built, and how it was verified (2026-10-23)

Phase 1 was built on the `chore/claude-setup` branch.

| Check | Result |
|---|---|
| Architecture scripts | 20 tests pass. On the real code (35 modules, 207 files) a build takes about 0.2 s. |
| Hooks | 11 tests pass, covering all ten hook events and the status line. They run each hook the way Claude Code does. |
| Whole project | Lint clean, typecheck clean, Jest 125/125, architecture check in CI mode clean. |
| Live, in a real session | <ul><li>A hand edit to `graph.json` was refused.</li><li>A rule-breaking write was blocked before it landed, with both rules named.</li><li>After an edit: prettier, a graph rebuild and the change log.</li><li>A deletion made from the shell was tracked.</li><li>`.env` and the keystore were unreadable.</li><li>No hook errors.</li></ul> |
| Commit messages | Conventional Commits is enforced for Claude's commits. The owner's own commits get only a reminder (their style differs). |

Some hooks can't be triggered from inside the session that installs them: the map at session start and after `/clear` or compaction, the notification, and the handoff note at session end. Their hook tests pass; the owner sees them from the next session on.

What checking the installed Claude Code (2.1.287) and its docs showed:

- Permission rules use `Bash(cmd *)`. A `Read` deny also blocks edits and shell reads such as `cat`.
- A failed shell command fires PostToolUseFailure, with the text in `error`.
- SubagentStart can add context.
- The status line receives `context_window.used_percentage`.
- Hook settings reload live, so `settings.json` was written last.
- ESLint takes about 1.5 s per file, so it stays in the edit hook.

Beyond the first design:

- **Engine regression gate in the Stop hook:**
  - Any change to the C++ engine or the native mic input runs `run.sh scenarios` (18 s).
  - Threading changes also run ThreadSanitizer (48 s).
  - CI runs both.
- **Ramster rule in the PreToolUse hook:** simulator starts and `run-ios` without `--device` are blocked, with the device commands as the fix.
- **`.mjs` linting:** ESLint now parses the `.mjs` tooling as modern ESM.

## 13. Open questions

Answered since the first draft: A3 (public), D4 (iOS first, on the owner's iPhone), M1, M2, M4, M5 and M7 (section 2).

| Ref | Question | Until answered |
|---|---|---|
| A2 | Solo or team? Another AI tool already works here (`.agents/rules`); should there be an `AGENTS.md`? | no `AGENTS.md`; the shared art rule is linked |
| D2 | Which plugins and MCP servers? Which task tracker? | tasks live in `docs/roadmap.md` |
| E1 | Experience level in React Native, Swift, Kotlin, audio/DSP and music theory? | Claude briefly explains audio and motion decisions that aren't obvious |
| E2 | Claude subscription or API billing? Monthly cost limit? | needed before Phase 2 agents |
| E5 | Docs and code comments in English? | English |
| F2 | Can piano samples be recorded: acoustic, digital, or both? Are public datasets OK? | the synthetic piano in `test/PianoSynth.h` |
| M3 | Who makes the designed (Rive) animations? | decide later |
| M6 | What are the oldest iPhone and lowest-end Android that must run smoothly? | needed for performance budgets |
| Motion | Ordinary view transitions (screens, lists): Reanimated? | ask before building one |
| Device | Hold 120 Hz and keep the screen awake: how, and when? | waiting for the owner's instructions |
| Repo | The reference screenshot of another app and the engine spec PDF/DOCX are committed to this public repo. Keep or untrack them? | unchanged |
| Outside | Move FEArchitecture into mooKIT: where does the owner launch Claude for mooKIT? (`gh` is installed and logged in.) | FEArchitecture still loads in this project |
