# UI Implementation Plan — Phase 1: Structure v1.7 (based on master v1.8)

Oct 23, 2026 · @sumit

## Summary

Phase 1 fixes the app's structure: where each module lives, what it may use, how lessons are written in JSON, and how a played note turns green or red. Nothing is built yet; this is the design for approval.

- **CoreEngine** becomes a local native package holding everything detection-related, for iOS and Android.
- **CorePiano and CoreNotes** stay in PianoMaster as independent parts that every lesson reuses.
- **Screens** get one folder per route. The four lesson types share **LessonKit** and play on **PianoStage**.
- **Lessons are JSON.** A chapter lists lesson ids, and each lesson holds a millisecond timeline of expected notes. Static in the app now, Firebase later.
- **FeedbackDetection.** CoreEngine matches each played note against the timeline once, and that verdict colours the note within a frame.
- **Settings are declarative.** Each is declared once, and all of them show on one Settings page.

Phase 2 settled the app flow in its own document, [UI Implementation Plan — Phase 2](https://claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic), and brought this one to v1.1 on 28 October 2026: the Results route, a live timeline and bass clef for Free2Play, and the first build's path. Phase 3 settled engine and UI communication and brought this one to v1.2: Nitro specs in the engine package, and the switch to Nitro in migration step 2. Phase 4 settled lesson internals and brought it to v1.3: three lesson settings, the grading credit, flow and wait for guided lessons, and three first-build lessons. Phase 5 brought it to v1.4: the Reduce Motion setting, the motion spec for results, and an indigo note to play now. Phase 4's backing change brought it to v1.5: the backing is a FLAC decoded by react-native-audio-api in LessonKit/Backing. Master v1.6, which merged the engine re-audit and the calibration engine, brought it to v1.6 on 4 November 2026: the calibration folder now holds profile v3, four layers each swapped on its own (§8.11). Master v1.8, which follows Reevo 2 only, brought it to v1.7 the same day: `legacy/` holds the app's current core only until Reevo 2 replaces it (§12.5).

## Decisions

Twenty-six decisions came out of the Phase 1 discussion on 23 October 2026. The sections below explain each one.

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| 1 | Engine location | CoreEngine is a local native package, `packages/CoreEngine/`, holding everything detection-related | It owns its iOS and Android audio code, and its pure C++ core builds for the desktop harness (§5.6) and Python (§14.3) |
| 2 | Platforms | Built for iOS and Android; tested on iOS for now | Android testing comes later |
| 3 | Atomic rule | One unit, one folder, `index.ts` as its only door, look file and tests beside it | Each module stays where it belongs, at every layer |
| 4 | Core modules | CorePiano, CoreNotes and CoreEngine import nothing above themselves | The word Core in a name promises that |
| 5 | Engine output | CoreEngine exports data and commands, never components | Screens wire it to the UI |
| 6 | Vocabulary | A Chapter holds lessons; the lesson types are VideoLesson, GuidedLesson, GameLesson and PracticeLesson | Lesson means one thing in code |
| 7 | Screens | One folder per route under `src/screens/`; the route name is the folder path | Routes stay declarative and easy to find |
| 8 | First screen | `PianoChapterList.tsx`, with icons for Free2Play and Settings | Owner's design |
| 9 | Chapter screen | The chapter's lessons as a horizontal grid; a tap opens that lesson | Owner's design |
| 10 | Lesson pages | One page per lesson type, filled from JSON | Scales to any number of chapters |
| 11 | Games | Live in `screens/lesson/GameLesson/games/`; EggHatch moves there unchanged | Only GameLesson loads games |
| 12 | Shared code | LessonKit holds what lessons share; PianoStage is the playing surface | Lesson types never import each other |
| 13 | Navigation | React Navigation 7, native stack, static configuration; params carry ids only | 8.0 is still pre-release; routes stay typed |
| 14 | Content source | Static JSON in the app during development, Firebase later, behind one ContentSource | The switch replaces one adapter |
| 15 | Identity | Numeric ids that never change or repeat: chapters from 1, lessons from 1001 | Position and display numbers stay separate |
| 16 | Timing | Each expected note has `startMs` and `durationMs`; the playhead is a timer | Notes must be played at exact moments |
| 17 | First song | Jingle Bells; the owner supplies the lesson JSON | The first content to build and test with |
| 18 | Fixed playhead | A vertical line at 30% from the left; the staff enters from the right | 70% of the screen shows what's coming |
| 19 | Moving playhead | The staff holds still; at 80% across it glides 300 ms and the line lands at 30% | The next notes stay in view, and timing never breaks |
| 20 | Staff | One straight strip of equal bars, drawn only where visible | A long song costs the same as a short one |
| 21 | Matching | One matcher, inside CoreEngine | Screen and score can never disagree |
| 22 | Timing windows | Symmetric: ±100 ms for beginners, ±50 ms advanced; never overlapping | On-time notes pass, and one strike counts for one note |
| 23 | Recording | Data only: key, time and verdict, never audio | Feeds results, gamification and replayable tests |
| 24 | Settings | Every declarative setting in one registry, shown on one Settings page | Everything tracked in one place |
| 25 | Automated tests | Maestro on the iOS Simulator; the real iPhone for manual, performance and microphone checks | Maestro can't drive a physical iPhone yet |
| 26 | Crashes and feedback | Firebase Crashlytics; TestFlight for testers' screenshots | Free, and fits the Firebase plan |

## Principles

Every module follows the same seven rules, and the dependency rules below enforce them.

1. **One unit, one folder.** Each folder has an `index.ts` as its only door, with its look file and tests beside it. In motion the unit is a drawable part; in CoreEngine, a pipeline stage; in screens and kits, one responsibility.
2. **Core means independent.** CorePiano, CoreNotes and CoreEngine import nothing above themselves.
3. **The JS thread stays out of the hot path.** A played note reaches the screen through the UI thread only. JS gets the same events in order, for records and text.
4. **One source of truth per fact.** One timeline, one matcher, one window per note, one setting registry.
5. **Declared, not coded.** Routes, lessons, settings and skins are declared as data, and code reads them.
6. **Identity is not position.** Ids never change; order and display numbers are computed.
7. **Measured, not guessed.** Timing uses onset timestamps, and latency is measured per audio route (§2.10, §6.6).

## Repository layout

All detection moves into one package, lesson data gets its own folder, and `src/` is grouped by role. Route folders mirror route names, and the C++ folders follow the master's phases.

```text
PianoAcademyStudio/
├── packages/
│   └── CoreEngine/                 everything detection (AUDIO + SYNC by role)
│       ├── cpp/                    pure C++: no React Native, no OS calls
│       │   ├── capture/            sample ring, 64-bit clock, catch-up             §6
│       │   ├── frontend/           tiers, partial frequencies, noise, onsets       §7
│       │   ├── calibration/        protocol, estimation, profile v3                §8
│       │   ├── evidence/           DSP evidence, joint model, interval test        §9
│       │   ├── decision/           per-key states, thresholds, timestamps          §10
│       │   ├── modes/              priors, score follower, echo canceller, matcher §11
│       │   ├── neural/             features, model interface, fusion               §14
│       │   ├── live/               LiveKeys, NoteEventRing, verdict table
│       │   └── legacy/             the current core, until Reevo 2 replaces it     §12.5
│       ├── bindings/               the only C++ that sees React Native
│       ├── ios/  android/          audio I/O, model runtimes, module registration
│       ├── src/                    TypeScript; index.ts is the only door
│       │   ├── specs/              Nitro specs (*.nitro.ts)
│       │   ├── commands/           start, stop, config, calibration, score, practice
│       │   ├── live/               reads the tables each frame, writes to the sinks it's given
│       │   ├── events/             noteEventBus
│       │   └── mock/               mock and replay engine: Jest, tests, UI work without a piano
│       ├── test/  tools/           C++ gates; desktop harness, Python bindings     §5.6 §14.3
│       └── models/  docs/          shipped neural models; engine notes
├── content/                        lesson data, flat and keyed by id
│   ├── catalog.json                the chapter order
│   ├── chapters/1.json             title, cover image, lesson ids in order
│   ├── lessons/1001.json …         one self-contained file per lesson
│   ├── presets/grading/            beginner.json, advanced.json
│   └── media/                      images, videos, backing songs; file name = media id
├── e2e/                            Maestro flows
├── scripts/content/                validator and asset-map generator, run in CI
├── src/
│   ├── app/navigation/             static route config: route → screen
│   ├── screens/                    route name = folder path; page + controller inside
│   │   ├── PianoChapterList/       first screen; Free2Play and Settings icons
│   │   ├── Chapter/                the horizontal lesson grid
│   │   ├── lesson/
│   │   │   ├── VideoLesson/
│   │   │   ├── GuidedLesson/       page + GuidedLessonController
│   │   │   ├── GameLesson/         page + games/ (EggHatch; birds-on-staff later)
│   │   │   └── PracticeLesson/     page + PracticeController
│   │   ├── Results/                an attempt's results: retry, next, chapter
│   │   ├── Free2Play/              writes notes on a grand staff as you play
│   │   ├── Calibration/            set up your piano, or recalibrate
│   │   └── Settings/               built from the setting registry
│   ├── LessonKit/                  shared by every lesson type
│   │   ├── Content/                schema, validation, ContentSource (bundled now, Firebase later)
│   │   ├── Contract/               what every lesson page receives and reports back
│   │   ├── Session/                count-in, play, pause, finish
│   │   ├── Score/                  lesson JSON → CoreNotes timeline, engine score, windows
│   │   ├── Backing/                decodes the backing FLAC (react-native-audio-api), hands it to CoreEngine
│   │   ├── FeedbackDetection/      records verdicts into an AttemptRecord
│   │   └── Results/                shows the record
│   ├── PianoStage/                 top slot + CorePiano + the per-frame wiring
│   ├── motion/scenes/PianoMaster/
│   │   ├── CorePiano/              unchanged
│   │   ├── CoreNotes/              timeline (lesson or live), layout, camera, state, skins, symbols
│   │   └── shared/                 PianoState and its sink, colours, paint, glyphs
│   ├── AppSettings/                setting registry, saved choices, layer resolver
│   ├── services/CrashReporting/    Crashlytics behind one interface
│   ├── ui/                         plain UI kit: cards, grid, buttons, icons
│   └── shared/                     piano model, typography (unchanged)
└── ios/  android/                  app shells only; no engine code
```

## Modules

Each module has one job; the thread column says where its code runs.

| Module | Job | Runs on |
| --- | --- | --- |
| CoreEngine | Hears the piano: capture, detection, calibration and matching against the timeline. Publishes LiveKeys, the verdict table and ordered events | Audio, DSP and neural threads; its TypeScript commands on JS |
| CorePiano | Draws the keyboard, any range, from PianoState | UI thread (Skia) |
| CoreNotes | Draws the staff from a timeline (a lesson's, or written live in Free2Play), moved by a clock, coloured by NotesState, in a skin | UI thread (Skia) |
| PianoStage | The playing surface: a top slot (CoreNotes or a game scene), CorePiano, and one frame callback feeding both from CoreEngine | UI thread |
| LessonKit/Content | Loads chapters and lessons by id, validates them and resolves media ids | JS |
| LessonKit/Contract | What every lesson page receives (the lesson id and the loaded lesson) and what it reports back | JS |
| LessonKit/Session | Count-in, play, pause, finish | JS |
| LessonKit/Score | Turns a lesson's JSON into the CoreNotes timeline, the engine's score and each note's window | JS |
| LessonKit/Backing | Decodes a lesson's backing FLAC with react-native-audio-api and hands the samples to CoreEngine (Phase 4) | JS |
| LessonKit/FeedbackDetection | Records every verdict, in order, into an AttemptRecord | JS |
| LessonKit/Results | Shows the AttemptRecord | JS |
| Lesson pages | VideoLesson, GuidedLesson, GameLesson and PracticeLesson: each composes LessonKit, PianoStage and CoreEngine | JS and UI |
| Games | A game scene, its CoreNotes skin and its options schema, in `games/<key>/` | UI thread |
| AppSettings | The setting registry, the saved choices and the layer resolver | JS |
| services/CrashReporting | Firebase Crashlytics behind one interface | JS |

## Dependency rules

Imports point one way: screens use kits, kits use core modules, and core modules use nothing above them. The architecture checker (`scripts/architecture/config.mjs`) enforces these rules; changing it needs the owner's OK, and approving this document gives it for the rules below.

&#91;embedded content: dependency layers · every import points down\]

Each arrow is an allowed import. AppSettings has no arrow down because core modules never read settings, and CoreEngine stands alone.

1. CoreEngine imports nothing from the app. It speaks MIDI numbers; note names belong to the UI.
2. CorePiano and CoreNotes never import CoreEngine, LessonKit, PianoStage, AppSettings, a screen, a game or each other. They share only `PianoMaster/shared` and `src/shared`.
3. Only `app/`, `screens/`, LessonKit and PianoStage import CoreEngine, and only through its index.
4. Screens never import each other; they meet through navigation.
5. LessonKit and PianoStage never import a screen, a game or each other.
6. CoreNotes never imports a game; GameLesson hands the game's skin in.
7. Games never import CoreEngine; GameLesson feeds them state.
8. Only `LessonKit/Content` reads content files; everything else asks it by id.
9. Only `LessonKit/Backing`, and later `services/Sound`, import react-native-audio-api. `app/` turns its session management off at start, and CoreEngine never imports it.
10. Core modules never read AppSettings; screens resolve settings and pass plain values in.
11. UI-thread code never imports JS-thread code, and per-frame code never hands work back to JS. (Existing rule.)
12. No circular imports. (Existing rule.)

Today the `audio-no-ui` rule watches `src/audio/**`, a folder that doesn't exist, so the engine's import of PianoMaster's key state passes every check. The move to the package points the rule at the real engine.

## Navigation

Routes are declared once, in React Navigation 7's static configuration with a native stack. Version 8.0 is still pre-release ([blog](https://reactnavigation.org/blog)), so the move to it waits until it's stable.

| Route | Screen | Params |
| --- | --- | --- |
| `PianoChapterList` | First screen, with the Free2Play and Settings icons | none |
| `Chapter` | The chapter's lessons as a horizontal grid | `chapterId` |
| `lesson/VideoLesson` | Video page | `lessonId` |
| `lesson/GuidedLesson` | Guided lesson page | `lessonId` |
| `lesson/GameLesson` | Game page | `lessonId` |
| `lesson/PracticeLesson` | Practice page | `lessonId` |
| `Results` | An attempt's results, with Retry, Next and Chapter; replaces the lesson page | `lessonId`, `attemptId` |
| `Free2Play` | Free play: writes notes on a grand staff as you play | none |
| `Calibration` | Set up your piano, or recalibrate; returns to the screen that opened it | none |
| `Settings` | Settings | none |

- A route's name is its folder path under `src/screens/`.
- A lesson opens with `navigate('lesson/' + lesson.type, { lessonId })`. The JSON's `type` names the route, so there's no switch statement anywhere.
- Params carry ids only; the page asks `LessonKit/Content` for the lesson. React Navigation's docs ask for exactly this ([params](https://reactnavigation.org/docs/params/)).
- A deep link to a lesson takes the same path.

## Content model

A chapter lists lesson ids in order, and each lesson file holds everything about that lesson, including a millisecond timeline of the notes the student must play.

**Identity**

- Every chapter and lesson has a number that never changes and is never reused: chapters from 1, lessons from 1001.
- Position is the chapter's list order. "Lesson 1.4" is computed for display, never stored.
- A game key such as `birds-on-staff` names code, not a lesson. Many lessons can use one game with different notes.
- Note ids are unique inside a lesson, so lesson 1005, note 9 names one note across the app.

**Chapter file**: `content/chapters/1.json`. Its six lessons are a video (1001), two guided lessons (1002, 1003), a game (1004) and two practices (1005, 1006).

```json
{
  "schemaVersion": 1,
  "id": 1,
  "revision": 1,
  "title": "Introduction to C",
  "image": "chapter-1-cover",
  "lessons": [1001, 1002, 1003, 1004, 1005, 1006]
}
```

**Lesson file**: `content/lessons/1005.json`, Jingle Bells, at the master's 120 BPM with a 2-second count-in and the chorus twice in 34 seconds (§11.2). The note list continues to the end of the song.

```json
{
  "schemaVersion": 1,
  "id": 1005,
  "revision": 1,
  "type": "PracticeLesson",
  "title": "Jingle Bells",
  "image": "lesson-1005-card",
  "settings": { "grading": "beginner" },
  "backing": { "audio": "jingle-bells-backing", "midi": "jingle-bells-backing" },
  "timeline": {
    "durationMs": 34000,
    "leadInMs": 2000,
    "bpm": 120,
    "timeSignature": [4, 4],
    "keySignature": "C",
    "staves": ["treble"],
    "expected": [
      { "id": 1,  "startMs": 2000, "durationMs": 500,  "pitch": "E4", "value": "quarter", "hand": "R", "finger": 3, "lyric": "Jin" },
      { "id": 2,  "startMs": 2500, "durationMs": 500,  "pitch": "E4", "value": "quarter", "hand": "R", "finger": 3, "lyric": "gle" },
      { "id": 3,  "startMs": 3000, "durationMs": 1000, "pitch": "E4", "value": "half",    "hand": "R", "finger": 3, "lyric": "bells," },
      { "id": 4,  "startMs": 4000, "durationMs": 500,  "pitch": "E4", "value": "quarter", "hand": "R", "finger": 3, "lyric": "jin" },
      { "id": 5,  "startMs": 4500, "durationMs": 500,  "pitch": "E4", "value": "quarter", "hand": "R", "finger": 3, "lyric": "gle" },
      { "id": 6,  "startMs": 5000, "durationMs": 1000, "pitch": "E4", "value": "half",    "hand": "R", "finger": 3, "lyric": "bells," },
      { "id": 7,  "startMs": 6000, "durationMs": 500,  "pitch": "E4", "value": "quarter", "hand": "R", "finger": 3, "lyric": "jin" },
      { "id": 8,  "startMs": 6500, "durationMs": 500,  "pitch": "G4", "value": "quarter", "hand": "R", "finger": 5, "lyric": "gle" },
      { "id": 9,  "startMs": 7000, "durationMs": 500,  "pitch": "C4", "value": "quarter", "hand": "R", "finger": 1, "lyric": "all" },
      { "id": 10, "startMs": 7500, "durationMs": 500,  "pitch": "D4", "value": "quarter", "hand": "R", "finger": 2, "lyric": "the" },
      { "id": 11, "startMs": 8000, "durationMs": 2000, "pitch": "E4", "value": "whole",   "hand": "R", "finger": 3, "lyric": "way," }
    ],
    "chords": [
      { "startMs": 2000,  "durationMs": 8000, "symbol": "C" },
      { "startMs": 10000, "durationMs": 4000, "symbol": "F" },
      { "startMs": 14000, "durationMs": 4000, "symbol": "G" }
    ]
  }
}
```

- `expected` is what the student must play. Optional per note: `dots`, `dynamic`, `articulation`, and `windowMs` to override one note's window.
- `value` and `durationMs` differ whenever a note is held shorter than written (staccato), so both stay.
- `chords` are the symbols shown above the staff. `backing` names the song's audio and its MIDI, which the engine uses to explain the speaker's notes (§11.3); backing notes are never expected. The audio is a 16-bit, 48 kHz mono FLAC, decoded by react-native-audio-api, and the MIDI becomes a JSON note list when content is built (Phase 4).
- A timeline may add a `pedal` track.
- GuidedLesson and GameLesson use the same `timeline`. GameLesson adds `game` and `gameOptions`, checked by the game's own schema. VideoLesson has `video` instead of a timeline. A guided lesson's checklist look is a setting, not a second format (Phase 4).

**Worked out at load, never typed**: MIDI numbers and key colours; barlines, from `bpm`, the time signature and `leadInMs`; the student's chords (notes sharing a `startMs` and hand); each note's window; and the lookup that finds the notes near the playhead.

**Checked in CI** by `scripts/content/`:

- Notes are sorted by time, and each `value` fits its slot at the lesson's `bpm`.
- The same key never overlaps itself, and everything ends inside `durationMs`.
- Every key is on the keyboard.
- Ids are unique across all files, and every referenced lesson, preset and media id exists.

**Ready for Firebase**

- Screens ask `LessonKit/Content` for a chapter or lesson by id. A bundled source answers now; a Firebase source replaces it later, and nothing above it changes.
- Media are named by logical id: a bundled file now, through the generated asset map, and a Firebase Storage URL later.
- One schema checks bundled JSON in CI now and downloaded JSON at runtime later.
- `revision` changes whenever a lesson's content changes, so saved results and caches know they're stale.

## Review of the earlier lesson format

The earlier format (formatVersion 4.0.0) had good bones but mixed the music with the engine's tuning, the screen's look, grading rules and documentation. A lesson file now holds only what a lesson author decides.

| Block | Verdict | Where it went |
| --- | --- | --- |
| `formatVersion`, `revision` | Kept | `schemaVersion` and `revision` in every file |
| `lesson` | Trimmed | Title, tempo, and time and key signatures stay. `mode` and `subMode` go: `type` decides behaviour, and settings decide the look |
| `notes` | Facts kept | `startMs`, `durationMs`, spelled pitch, hand and finger stay. MIDI, key colour, chords, neighbours and windows are derived. `keyNumber` goes: a third key numbering beside the master's MIDI − 21 and the repo's MIDI |
| `instrument` | Moved | To the calibration profile: the piano is measured, not declared (§8). `focusRange` stays as a lesson setting (§4) |
| `audioInput` | Removed | To CoreEngine's configuration; several values contradicted the master (below) |
| `staffDisplay` | Split | Staves and clefs stay with the music. Playhead position, speed and look-ahead go to Settings |
| `evaluation` | Moved | To grading presets the lesson names. Its priors were the master's defaults (§4), and confirmation timing is the engine's decision (§12.3) |
| `chords` (note groups), `timeIndex`, `notesRules`, `enums` | Removed | Derived at load, or written once as the schema and checked in CI |
| `runtimeContracts` | Moved | `noteResult` and `attemptSummary` become FeedbackDetection's AttemptRecord; the event messages go to Phase 3 (§12.2) |

The `audioInput` values that contradicted the master:

- A fixed onset threshold: thresholds come from the false-alarm budget (§2.4).
- A fixed 40 ms latency: latency is measured per audio route (§6.6).
- A timbre-similarity gate: non-piano templates replaced fixed gates (§9.4).
- A level-ratio re-strike rule: re-strikes come from attack evidence, never level (§9.5).

## CoreNotes and the playhead

CoreNotes draws one straight staff from the timeline, moved by a clock it's given, coloured by NotesState, in a skin. The playhead is a vertical line whose position always comes from the clock, so it can't drift off its note.

| Part | Job |
| --- | --- |
| `timeline/` | Events in time: a lesson's, as LessonKit/Score hands them over, or appended live from detections in Free2Play (pure data) |
| `layout/` | Time to x through the tempo, so every bar has the same width; key to height on the staff. Computed once per lesson |
| `camera/` | Each frame on the UI thread: where the staff sits and where the playhead is |
| `state/` | NotesState: each note's verdict and when it arrived |
| `skins/` | NotationSkin by default; a game's skin, such as the birds, handed in by GameLesson |
| `symbols/`, StaffPaper, Playhead, DurationBar | Existing atoms, plus a BassClef for Free2Play's grand staff |

**The camera rule** is the same for both modes:

```text
playheadX = songX(now) − cameraX
fixed:  cameraX = songX(now) − 0.30 × screenWidth
moving: cameraX holds still; when playheadX passes 0.80 × screenWidth,
        it glides to songX(now) − 0.30 × screenWidth over 300 ms
```

&#91;embedded content: playhead modes · fixed and moving\]

The accent line is the playhead. Fixed mode keeps it at 30%; moving mode lets it run to 80%, then glides the staff so it lands back at 30%.

- **Fixed playhead** (`fixPlayhead: true`, the default): the line stays at 30% from the left. The staff and notes enter from the right and move left, so 70% of the screen shows what's coming.
- **Moving playhead**: the staff holds still and the line travels right. At 80% across, the staff glides forward in 300 ms and the line lands back at 30%, on its note. At 120 BPM and 67 points per beat, that's about every 7 beats, or 3.5 seconds.
- With the phone's Reduce Motion on (decision M7), the glide becomes an instant cut.
- **Drawing only what's visible**: each bar is recorded once as a Skia picture, and each frame draws only the bars in view. No FlatList or ScrollView: React would put the JS thread back into every frame.

**Which clock the playhead reads**

- PracticeLesson: the backing song's playback position, from CoreEngine's audio clock (§6.2, §11.2). A JS timer would run ahead of what's heard by the output latency: tens of milliseconds on the speaker, 100–300 ms on Bluetooth (§6.6).
- GuidedLesson: the same timeline, and the clock runs at the lesson's tempo, stopping at each note not yet played (Phase 4).
- GameLesson: the game picks one of the two.

## FeedbackDetection

CoreEngine hears what the student plays and matches it against the timeline once; that one verdict colours the note, fills the record and becomes the grade.

1. The lesson's timeline says what to play and when, for example a C quarter note at 2500 ms.
2. The clock runs, and CoreNotes moves the staff.
3. CoreEngine detects each played note: its key and its onset timestamp (§10.3).
4. CoreEngine's matcher maps it to the expected note whose window holds it, and writes a Verdict.
5. PianoStage's frame callback reads the verdict table with the key table, so the key and the note change colour in the same frame.
6. LessonKit/FeedbackDetection receives the same verdicts in order on the JS thread and records them.

&#91;embedded content: FeedbackDetection · one verdict, two paths\]

The verdict takes two paths: to the screen within a frame on the UI thread, and to the record in order on the JS thread.

**Why the matcher sits in CoreEngine.** The engine already holds the timeline (`setScore`, `startPractice`, §12.1), and the master puts grading in the C++ core (§11.5, §12.6). A second matcher on screen could show green for a note the score counts as missed.

**Verdict rules**

| What happens | The note on screen | Final? |
| --- | --- | --- |
| The right key is struck inside the window | Green, the moment it's heard | Yes, unless the engine withdraws the note (§12.3) |
| A wrong key, and the engine is at least 90% sure (§11.1) | Red | No: it turns green if the right key comes before the window closes |
| Nothing is played inside the window | Red, as missed, when the window closes | Yes |
| A Guided lesson | Flow and wait: the right key counts from earlyMs before its note, and a note not yet played stops the staff until it is. Red for a sure wrong key, green when the right key comes | Yes, once green |

While the engine is less than 90% sure, nothing turns red; a Guided lesson simply keeps waiting. A note turned green after a wrong key earns at most half its credit (Phase 4). The note to play now is marked in indigo, so red only ever means wrong (Phase 5).

**Timing windows**

- Windows sit on both sides of the expected time, from the grading preset: ±100 ms for beginners, ±50 ms advanced (§4). A C expected at 1500 ms passes between 1400 and 1600 ms, or between 1450 and 1550 ms.
- A window opening exactly at the expected time would fail a perfectly timed note up to half the time, because measured onsets wobble a few milliseconds (§2.10).
- `earlyMs` and `lateMs` are separate settings, and `windowMs` overrides one note.
- Windows never overlap: each is cut to half the gap to the next note on the same hand. One strike can never count for two notes, so a green is final the moment it shows.
- Inside the window, the inner half counts as perfect and the rest as good, so the skin can make a perfect hit's animation stronger.
- `LessonKit/Score` computes every window once and hands it to the engine with the score, so the matcher and the screen use the same numbers.

**Names and the record**

- `Detection`: what CoreEngine heard (key, onset time, velocity, confidence).
- `Verdict`: its judgment on one expected note (correct, wrong or missed, the timing offset and the tier).
- `AttemptRecord`: every verdict of one attempt, in order. It's data only, never audio. It feeds Results now and gamification later, and played back through the replay engine it becomes an automated test.
- The green and red animations live in the skin, with their timings in the skin's look file.

## Settings

Every declarative setting is declared once in `src/AppSettings/`, and the Settings page (`Settings.tsx`, opened from the gear icon on PianoChapterList) builds itself from that list.

```ts
fixPlayhead: { type: 'boolean', default: true, setBy: ['user'], group: 'Playhead' },
earlyMs:     { type: 'number', default: 100, range: [25, 200], setBy: ['lesson', 'user'], group: 'Grading' },
```

- **Layers.** Each value starts at its default, then the lesson JSON, then the student's choice. `setBy` lists which layers may change it, so nothing is overridden silently.
- **Everything in one place.** The page holds the master's configuration groups (§4: instrument, mode, grading, engine, priors, calibration, device, practice, diagnostics) and the app's own (playhead, notes).
- **Measured values are read-only.** Latency and other measurements show on the page, but no slider can overwrite them.
- **Storage.** Choices are saved on the phone with MMKV, as the master stores profiles (§12.4).
- **Independence.** Core modules never read settings; screens resolve them and pass plain values in.

**Playhead settings**

| Setting | Default | Meaning |
| --- | --- | --- |
| `fixPlayhead` | true | true: the staff moves; false: the playhead moves |
| `playheadPosition` | 0.30 | Where the fixed playhead sits, and where the moving one lands after a glide |
| `turnAt` | 0.80 | How far the moving playhead travels before the staff glides |
| `turnGlideMs` | 300 | How long the glide takes; 0 is an instant cut (Reduce Motion) |

**Lesson settings**, set only by the lesson's JSON (Phase 4):

| Setting | Default | Meaning |
| --- | --- | --- |
| `checklist` | false | All notes on a still staff, the playhead moving across, a tick on each note; overrides `fixPlayhead` |
| `showNotes` | true | Note names on the staff; the letters on the piano keys always show |
| `looping` | false | The student may set a loop |

**Motion** (Phase 5): `reduceMotion` is system, on or off. The default, system, follows the phone's Reduce Motion, and the student can override it.

**Grading settings**, per preset:

| Setting | Beginner | Advanced |
| --- | --- | --- |
| `earlyMs` | 100 | 50 |
| `lateMs` | 100 | 50 |
| Perfect tier | ±50 ms | ±25 ms |
| Credit per note (Phase 4) | Perfect 100%, good 75%, late 50%, after a wrong key at most 50% | Same |

## Platforms, testing and feedback

The app builds for iOS and Android from the start; testing runs on iOS for now, and Android testing comes later.

- **Android.** CoreEngine's `android/` folder keeps building. The Oboe mic glue isn't wired yet, so the engine won't run on Android until it is. The rule to ask before an Android build stays until building starts.
- **Automated end-to-end tests.** Maestro flows (free, open source) live in `e2e/` and run on the iOS Simulator, because Maestro can't drive a physical iPhone yet ([docs](https://docs.maestro.dev/get-started/supported-platform/ios/uikit)). CLAUDE.md's never-a-simulator rule gains one exception: automated flows only.
- **The real iPhone** stays for manual, performance and microphone checks, with frame rate judged on Release builds.
- **Lesson input in tests.** CoreEngine's replay engine feeds recorded playing, so Guided and Practice run end to end with nobody at the piano.
- **Crashes.** Firebase Crashlytics, which costs nothing ([pricing](https://firebase.google.com/pricing)), behind `services/CrashReporting/`.
- **Tester feedback.** TestFlight testers send marked-up screenshots and add context to crash reports ([TestFlight](https://developer.apple.com/testflight/)).
- **Fixes from issues.** The Claude Code GitHub Action can turn an issue into a pull request ([docs](https://code.claude.com/docs/en/github-actions)), and GitHub doesn't charge Actions minutes for public repositories ([billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)). How it's set up is an open item.

## Migration plan

When building starts, four pull requests reshape the repository without changing behaviour, and each passes its gates before the next begins.

1. **Untangle in place.** Sinks replace the engine's imports of PianoMaster's `pianoState`. PianoMaster stops re-exporting the engine. The diagnostics overlay, `STATUS_MESSAGES` and `calibrationGuide` move out to the screens that use them. Gate: golden frames identical.
2. **Move the engine.** Create the package with npm workspaces and move the C++, tests, spec, TypeScript side and the iOS and Android audio code into it, with the codegen config. Point `config.mjs` at the new path. Once Phase 3's spike passes, the bindings move to Nitro HybridObjects. Gates: the engine's scenario gate, ThreadSanitizer, and keys still lighting on the iPhone.
3. **Build the layers.** `LessonScreen`'s layout becomes PianoStage; LessonKit and the route folders appear; `CalibrationScreen` becomes `screens/Calibration`; `App.tsx` hands over to navigation; EggHatch moves to `screens/lesson/GameLesson/games/`. Gate: golden frames identical.
4. **Rules and docs.** Add the new rules to `config.mjs`, and update `flows.md`, the glossary and CLAUDE.md (platforms, the simulator exception, paths). ARCHITECTURE.md regenerates.

Each step also gets its spec and an ADR, as the repository's CLAUDE.md asks. Changes to `config.mjs`, CLAUDE.md and `.claude/` need the owner's OK; approving this document gives it for the changes listed here.

## Scope

The first build proves the core loop with one song; everything else is named and typed now and built later.

**First build**

- CoreEngine in its package, built for iOS and Android
- CoreNotes with its timeline, camera and NotationSkin
- CorePiano and CoreNotes working together on PianoStage
- Three lessons: one using only C4, and Jingle Bells as a GuidedLesson and as a PracticeLesson (Phase 4)
- FeedbackDetection with green and red notes
- The Settings page

**Later**

- VideoLesson
- GameLesson and the birds-on-staff game
- Gamification and progress
- Content from Firebase
- Android testing

The student reaches them through the real chapter list and grid, with one chapter holding both (Phase 2).

## Open items

Four questions stay parked; Phase 4 settled the guided variants, and Phase 5 the motion spec for results.

- [ ] The Claude GitHub Action: which Claude plan it runs on, and whether its fixes always arrive as reviewed pull requests, never auto-merged.
- [ ] Which Android phone to test on, once Android testing starts.
- [x] The guided lesson's variants (checklist, moving notes), discussed with the lesson implementation.
- [ ] Which games GameLesson offers, and EggHatch's role among them.
- [ ] Offline play once content comes from Firebase.
- [x] A motion spec in `docs/motion/` for the green and red note animations.

## Notes for Phase 3

Reading the code and the master for Phase 1 surfaced six points for the engine and UI communication phase; Phase 3 settles all six.

- **The repo already pulls.** The engine writes LiveKeys (128 MIDI slots, seqlocks, a version counter), and a UI-thread frame callback reads it. JS is woken once per batch through a ring any number of readers can follow. The master's §6.4 and §12.1 still describe JS draining `pollEvents` every frame, so the master is behind the code.
- **There's no dedicated UI worklet thread.** Reanimated's UI runtime runs on the main thread, shared with all drawing, so every worklet spends the same 8.3 ms frame at 120 Hz.
- **The wave isn't in LiveKeys yet.** Keys light at a fixed level while held. Attack, decay and release need a per-key level in the table or an envelope drawn on the UI side.
- **Three event formats exist.** The repo uses noteOn and noteOff; the master defines NoteOn, NoteOff, NoteConfirm, NoteRetract, NoteCorrect and Status (§12.2); the earlier lesson file used a KEY\_DOWN family. Phase 3 settles one, plus the Verdict events.
- **Key numbering differs.** The master indexes keys as MIDI − 21 inside the engine; the repo and the content use MIDI.
- **Nitro Modules is installed but unused.** It's a candidate for Reevo 2's binding surface.

## Merge into master

Merged into master v1.2 on 28 October 2026, together with Phases 2 and 3.

| Master section | Change |
| --- | --- |
| §1 Decisions | Add: CoreEngine as a local package; the modes named GuidedLesson (Learning), PracticeLesson (Practice) and Free2Play (Free play); built for iOS and Android, tested on iOS first |
| §4 Configuration | Settings become one registry with layers (default, lesson, user) and `setBy`. Add the Playhead group. Grading gains `earlyMs`, `lateMs`, per-note `windowMs`, the no-overlap rule and the perfect tier |
| §6.4 Threads | The JavaScript thread no longer drains events every frame: the UI thread reads LiveKeys and the verdict table, and JS is woken per batch. Details in Phase 3 |
| §11.1 Learning mode | The score is the lesson's timeline JSON (`startMs`, `durationMs`, pitch, value, hand, finger, lyric), supplied as JSON rather than imported from MusicXML or MIDI |
| §11.2 Practice mode | The playhead reads the backing song's playback position from the audio clock |
| §11.5 Grading | Matching runs per note window as notes arrive. Windows never overlap, so live verdicts are the final grades. Add the verdict rules |
| §12.1 JSI surface | Add the verdict table beside LiveKeys; `setScore` carries each note's window |
| §12.2 Event format | Add Verdict events; the format is settled in Phase 3 |
| §12.3 UI contract | Green at once, red only at 90% or more, missed when the window closes |
| §12.4 Persistence | Content is bundled now and comes from Firebase later. AttemptRecords are stored as data, never audio |
| §16.3 Open items | Add the Android test phone and the GitHub Action setup |

## Sources

- [Reevo 2 master document, v1.1](https://claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH)
- [PianoAcademyStudio repository](https://github.com/SumitRajpal/PianoAcademyStudio)
- [React Navigation: passing parameters to routes](https://reactnavigation.org/docs/params/)
- [React Navigation blog](https://reactnavigation.org/blog)
- [Maestro: iOS platform support](https://docs.maestro.dev/get-started/supported-platform/ios/uikit)
- [Firebase pricing](https://firebase.google.com/pricing)
- [TestFlight](https://developer.apple.com/testflight/)
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
