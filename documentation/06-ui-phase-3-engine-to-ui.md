# UI Implementation Plan — Phase 3: Engine to UI communication v1.5 (based on master v1.8)

Oct 28, 2026 · @sumit

## Summary

Phase 3 fixes how the engine talks to the screens: four shared structures with one writer, read by the UI thread every frame and by JavaScript in batches, plus commands that go one way. Nothing is built yet; this is the design for approval.

- **The screen never waits for JavaScript.** PianoStage's frame callback reads the engine's tables directly on the UI thread.
- **Four structures, one writer each:** LiveKeys, VerdictTable, Clock and the event ring, all written by the DSP thread.
- **Keys glow with the sound.** A held key follows its measured level and is never dimmer than mid yellow.
- **The staff keeps time with what's heard.** The clock is a straight line that each frame evaluates at its own display time.
- **The bindings move to Nitro.** They're rewritten here anyway, and MMKV brings Nitro into the app regardless; a spike on the iPhone gates the switch.

With Phases 1 and 2, this completes the plan's design. The three documents merged into master v1.2 on 28 October 2026. Phase 4 brought this one to v1.1: the guided clock, three new commands and the loop fields. Phase 5 brought it to v1.2: the glow's fall rate and release fade. Phase 4's backing change brought it to v1.3: loadBacking takes decoded samples. Master v1.6, which merged the engine re-audit and the calibration engine, brought it to v1.4 on 4 November 2026: the status codes and their tiers below.

## Decisions

Eleven decisions came out of the Phase 3 discussion on 28 October 2026. The sections below explain each one.

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| 1 | Paths | Three: tables for current state, the event ring for history, commands one way | Each reader gets what it needs without waiting on another |
| 2 | Structures | LiveKeys, VerdictTable, Clock and the event ring, each written only by the DSP thread | One writer means lock-free reads and no contention |
| 3 | UI reads | PianoStage's frame callback reads the tables every frame on the UI thread | The JS thread is never on the path from a played note to the screen |
| 4 | JS reads | Woken once per batch; follows the ring with its own cursor; reads the VerdictTable once more at Finished | A stalled JS thread never loses a verdict |
| 5 | Key glow | Follows the measured level; never below mid yellow while held; flashes on a re-strike; fades out on release | Owner's choice: a wave, not a blink, and always visible |
| 6 | Clock | A straight line (position, rate, host time) evaluated at each frame's display time; the formula in C++ | One number per frame, testable in the harness |
| 7 | Guided position | Moves inside the engine when the right note lands; JS is told afterwards | The next note never waits for JS |
| 8 | Events | One 48-byte record for every event type, each carrying a note id | One ring, one format, revisions linked to their note |
| 9 | Bindings | Nitro HybridObjects written in C++, replacing the TurboModule and its hand-written host object, once a spike passes | Rewritten here anyway; Nitro arrives with MMKV v4; typed, and shared by both platforms |
| 10 | Budget | At most 0.2 ms per frame for all reads, measured on Release builds | The master's integration gate (§12.7) |
| 11 | Recovery | The ring keeps 256 events; a reader that falls behind rebuilds from the tables | Already proven in today's code and its ThreadSanitizer tests |

## Data paths

&#91;embedded content: data paths · 2 engine threads, 4 structures, 2 readers\]

The DSP thread is the only writer. The UI thread reads the tables every frame; JavaScript follows the ring once per batch and sends commands back. In Free2Play the UI thread follows the ring too.

## The four shared structures

Each structure lives in the engine's C++ core and is written only by the DSP thread; readers never lock or wait.

| Structure | Holds | Updated | Read by |
| --- | --- | --- | --- |
| LiveKeys (exists, extended) | One slot per MIDI key: down, strike count, velocity, cents and onset time (today); new: level from 0 to 1, a note id and a confidence | On every key change; the level every hop while the key sounds | UI every frame; JS on demand (`isDown`) |
| VerdictTable (new) | One row per expected note: pending, correct, wrong, missed or unclear; the key played; how early or late in ms; perfect, good or late (Guided); whether a wrong key came first. The header holds the lesson cursor, the note expected now and the loop pass (Phase 4) | As each verdict lands, and when the cursor moves | UI every frame; JS once more at Finished |
| Clock (new) | Two straight lines, song time and stream time (time on the microphone's audio), each a position, a rate and the host time of that position | Every hop, and at every jump: start, pause, resume, a cursor move | UI every frame |
| Event ring (exists, extended) | The last 256 events in order; new types NoteConfirm, NoteRetract, NoteCorrect, Verdict and Status | As events happen | JS listeners, and the UI in Free2Play, each with its own cursor |

- **Versions:** LiveKeys and the VerdictTable each count their changes, so a reader that sees the same count skips all work, as LiveKeys does today.
- **Sizes:** LiveKeys has 128 slots. The VerdictTable is allocated by `setScore` before the engine starts, so nothing is allocated while playing.

## The wave on the keys

A held key's yellow follows the sound: bright on a firm strike, fading as the note decays, flashing back on a re-strike, and never dimmer than mid yellow, so it's always visible.

- **Level, from the engine:** the key's sound between its noise floor (0) and its calibrated fortissimo (1), from the joint model's amplitude (§9.3, §8.5).
- **Glow, in the UI:** glow = floor + (1 − floor) × level while the key is down. The floor is 0.55, today's `softestLevel`: mid yellow.

| Moment | What the key does |
| --- | --- |
| Strike | Jumps at once to its level: a firm strike near full yellow, a soft one near mid yellow |
| Held | Follows the level down, never below mid yellow, and falls no faster than 2.0 per second (Phase 5), because beating strings swing the level by several dB (§9.5) |
| Re-strike | A new strike count flashes it back to the new strike's level, even when the level barely rose |
| Release | Fades out over 150 ms from where it is (Phase 5) |
| Very short note | Stays lit at least 120 ms, today's `shortestLitMs`, so every strike is seen |

The floor, fall rate and fade live in a look file on the UI side (today `CORE_PIANO_NOTES_DETECTION_LOOK.keys`), since the engine exports no UI.

## The clock

The staff stays on time because the clock and the frames share one time base, and each frame asks where the music is at the moment it reaches the screen.

- **One time base per platform:** host time on iOS (what `CACurrentMediaTime` counts) and the monotonic clock on Android. Audio timestamps (§6.2) and frame timestamps both use it.
- **Frames carry their display time.** On iOS a frame callback's timestamp is CADisplayLink's `targetTimestamp`, the moment the frame will be on screen. On Android it's the frame's vsync start, so a measured offset is added. Both come from react-native-worklets 0.13's frame queue.
- **The clock is a straight line.** The engine publishes a position, a rate and the host time of that position. The frame calls `clock.songAt(frame.timestamp)`: one call, primitive arguments, one number back. The formula lives in C++, where the harness tests it.

| Mode | Rate | Re-anchored |
| --- | --- | --- |
| Practice | 1 | Every hop, from the output samples, so the staff shows what the student hears after output latency (§6.6) |
| Guided | 1 between notes, 0 while waiting at a note | When the note is played, the clock restarts at rate 1 from it; and at each loop pass (Phase 4) |
| Tempo-follow (later) | The score follower's tempo ratio (§11.1) | Every estimate |
| Paused | 0 | On resume, at the start of the bar, with a count-in |
| Free2Play | Uses `streamAt(t)`, played time on the microphone | Every hop |

In Free2Play each note is drawn where it was played, so detection delay only places a new note a few points behind the write point: 50 ms is about 7 points at 120 BPM and 67 points per beat.

## One frame in PianoStage

Every frame, PianoStage's single frame callback makes its reads, then CorePiano and CoreNotes draw.

1. `t = frame.timestamp`, the moment this frame reaches the screen.
2. **Clock:** `songAt(t)` moves the CoreNotes camera; Free2Play uses `streamAt(t)`.
3. **LiveKeys:** if its change count moved, the changed keys go to PianoState (down, up, new strikes); then the levels of sounding keys set each key's glow.
4. **VerdictTable:** if its change count moved, the changed rows go to NotesState (green or red, with the moment each arrived, for the animation) and to PianoState's Correct and Wrong roles.
5. **Free2Play only:** new ring events write, confirm, erase or move noteheads.

- **Budget:** at most 0.2 ms for all the reads, the master's integration gate (§12.7), measured by a probe in PianoStage on Release builds.
- **No allocation:** changes and levels arrive in a buffer that each reader allocates once and the engine fills, as Nitro's ArrayBuffers allow. Methods take primitive arguments and return numbers, as Nitro's performance guide advises.
- **Same frame:** a key and its note change together, because both come from one read.

## What "no lag" means

The screen adds at most one frame to the time physics needs to hear a note, and the JS thread is never on this path.

| Stage | Time | Set by |
| --- | --- | --- |
| Hearing the note: the window fills and the engine decides | 25 ms treble, 50 ms middle, 100 ms deep bass (95th percentile, mf and louder) | Physics, and the master's gate (§1) |
| The DSP thread picks up the hop | At most 2 ms | Its poll (§6.4) |
| Waiting for the next frame | 0–8.3 ms at 120 Hz | The display |
| Reading and drawing | Inside that frame | PianoStage, with at most 0.2 ms of reads |

Grading never uses these delays: verdicts are judged on onset timestamps (§2.10).

## The JS side and commands

JavaScript records, decides and sends commands; it never draws a note.

- **noteEventBus stays:** the engine wakes JS once per batch, never once per note, and listeners follow every note or one key.
- **FeedbackDetection** records verdicts from the ring, then reads the whole VerdictTable once at Finished, so the record is complete even after a JS stall.
- **Lesson controllers** handle Status events in Phase 2's three tiers.

| Command | Sent when | What it does |
| --- | --- | --- |
| `setScore(score)` | Preparing, before `start`, or while paused | Expected notes with their windows, the bar start times and, in Practice, the backing notes; allocates the VerdictTable |
| `start(config)` | A playing screen opens | Opens audio and starts the engine's threads in the config's mode |
| `setConfig(config)` | A setting changes while running | Validated, then swapped at the next hop (§4) |
| `startPractice(fromBar)` | Start, or resume in Practice | Locks the backing and the expected notes to song time from that bar (§12.1) |
| `loadBacking(samples, sampleRate)` | Preparing, in Practice | Takes the backing samples, decoded from FLAC by react-native-audio-api, into memory; Ready waits for it (Phase 4) |
| `setLoop(fromBar, toBar)`, `clearLoop()` | A loop is set or cleared | The engine jumps back at the bar line itself (Phase 4) |
| `pause()`, `resume()` | The pause menu | Holds or re-anchors the clock |
| `setLessonPosition(note)` | Restart | Moves the cursor |
| `stop()` | The screen closes | Releases every key and closes audio |
| `runLatencyTest()` | Preparing, on a route not yet measured | The chirp test (§6.6) |
| Calibration and profile calls | Set up your piano, Settings | `beginCalibration`, `calibrationStep`, `commitProfile`, `loadProfile`, `exportProfile`, `importProfile` (§8, §12.1) |

These replace today's `startDetector`, `setExpectedNotes` and `setPolyphony`.

## The event record

Every event in the ring uses one 48-byte record: the master's format (§12.2) plus the verdict fields.

| Field | Meaning |
| --- | --- |
| `type` | NoteOn, NoteOff, NoteConfirm, NoteRetract, NoteCorrect, Verdict or Status |
| `noteId` | Links a detected note's NoteOn, its revisions and its NoteOff |
| `midi` | The key as a MIDI number; the engine's internal key index (MIDI − 21) never leaves it |
| `onsetSample`, `timeMs` | The 64-bit sample position, and the latency-corrected time (§10.3) |
| `velocity`, `dynamicLevel` | 0 to 1, and the dynamic level the measured error allows (§2.9) |
| `confidence` | The probability that the note is real and is this key |
| `source` | dsp, neural or fused |
| `flags` | Tentative, release observable, acoustic end, outside focus |
| `expectedId`, `verdict`, `offsetMs`, `tier` | Verdicts only: the lesson note judged; correct, wrong, missed or unclear; early or late in ms; perfect, good or late; whether a wrong key came first; the loop pass (Phase 4) |
| `status` | Status events only: one of the codes below |

| Status | Tier (Phase 2) |
| --- | --- |
| Interrupted, route changed, microphone refused, transpose suspected | Pauses the lesson |
| Noisy room or noisy register, microphone overloaded, microphone blocked, nothing heard, wind on microphone, processing detected, neural engine off for heat or low-power mode, timing off on Bluetooth | Notice while playing |
| Re-scan needed, piano mismatch, unisons need tuning | Message after the lesson |

Master v1.6 replaced "calibration needed" with the targeted fixes of §8.12, so a status names what to redo. "Noise state changed" is a status too, but it goes to telemetry and never to the screen (§10.7).

## Bindings: why Nitro

The engine's bindings move from a TurboModule with a hand-written host object to Nitro HybridObjects written in C++, once a spike on the iPhone confirms them.

| Reason | Detail |
| --- | --- |
| They're rewritten anyway | Phase 3 adds two objects, new fields, events and commands, so the bindings are rebuilt whichever tool is used; switching now costs nothing extra |
| Nitro arrives regardless | react-native-mmkv v4, planned for settings and profiles, is a Nitro module and requires `react-native-nitro-modules`; one binding technology beats two |
| Readable from worklets | Nitro objects work in any JS runtime, including react-native-worklets' UI runtime, through synchronous calls |
| Lighter calls | Today's host object turns each property name into a string and builds a new function on every access. Nitro's objects use `jsi::NativeState`, about 5× faster in Margelo's benchmark. At about six reads a frame both stay far inside 0.2 ms, so this is a bonus, not the reason |
| One C++ layer | HybridObjects can be written in C++ for both platforms, with generated registration replacing the hand-written iOS provider and Android `OnLoad.cpp`; TypeScript types come from one spec |

Risks, and how they're handled:

- **Nitro is pre-1.0** (0.36 in the repo). Its version is pinned and upgraded deliberately, together with MMKV.
- **Its code generator, nitrogen, joins the build** and runs in CI.
- **A spike gates the switch.** Before the migration, a C++ Clock HybridObject is read from PianoStage's frame callback on the iPhone. It must work from the UI runtime, cost no more per frame than today's host object, and leave the C++ core's ThreadSanitizer tests unchanged. If it fails, the bindings stay a TurboModule, with the host object rewritten on `jsi::NativeState`.
- **The C++ core never changes either way:** only `bindings/` sees React Native (Phase 1).

## Changes to today's code and to Phase 1

Most of today's engine-to-UI code stays; Phase 3 extends it and replaces only the bindings.

- **LiveKeys and the ring** gain the fields and event types above. Their seqlocks, the per-batch wake and `NoteEventReader`'s resynchronisation stay as they are.
- **VerdictTable and Clock** are new, with ThreadSanitizer tests beside `live_keys_test`: one writer, several readers, no torn reads.
- **`liveKeys.ts`** stops importing `pressKey` and `releaseKey`; PianoStage hands it sinks (Phase 1, migration step 1).
- **Engine side, not UI:** the worker polls every 0.5 ms and drops stale backlog; the master replaces dropping with catch-up (§6.3).

The [Phase 1 document](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX) moves to v1.2: the engine package's `src/specs/` holds Nitro specs, and migration step 2 includes the switch to Nitro once the spike passes.

## Verification

Each part has a check that passes or fails on its own.

| Check | Passes when |
| --- | --- |
| ThreadSanitizer on LiveKeys, VerdictTable, Clock and the ring | No races or torn reads with one writer and several readers, including a reader the ring has lapped |
| The clock in the harness | `songAt` and `streamAt` are exact to one sample on synthetic timestamps, across start, pause, resume and cursor jumps |
| Per-frame probe | All of PianoStage's reads take at most 0.2 ms at the 99th percentile on the iPhone, in a Release build |
| Nitro spike | Works from the UI runtime, and costs no more per frame than today's host object |
| End to end | The replay engine plays a recorded Jingle Bells take, and Maestro checks that the verdicts and the record match the expected sequence |

## Open items

One item stays open; none blocks the build plan.

- [x] The release fade's duration and the glow's fall rate (Phase 5, visual design).
- [ ] How Android's frame offset is measured, on the first Android test phone.
- [x] Merging Phases 1–3 into the master, after the owner's yes.

## Merge into master

Merged into master v1.2 on 28 October 2026, together with Phases 1 and 2. The v1.4 update follows master v1.6 and changes nothing further in the master. The v1.5 update follows master v1.8, which follows Reevo 2 only: `source` loses legacy. It changes nothing further in the master.

| Master section | Change |
| --- | --- |
| §3.2 Common currency | Add the engine's output contract: LiveKeys, VerdictTable, Clock and the event ring |
| §6.2 Sample clock | The Clock: song and stream lines in host time, evaluated at each frame's display time |
| §6.4 Threads | JS no longer drains events every frame; the UI thread reads the tables, and JS is woken once per batch |
| §10.7 Events and revisions | Add Verdict and Status events, and the status list with its tiers |
| §12.1 JSI surface | Nitro HybridObjects: the commands, `liveKeys`, `verdicts`, `clock` and the event listener; `pollEvents` goes |
| §12.2 Event format | The 48-byte record with verdict fields |
| §12.3 UI contract | Key glow follows the level with a mid-yellow floor; green at once, red only at 0.9 or more |
| §12.6 One core, two platforms | The bindings are C++ HybridObjects shared by iOS and Android |
| §12.7 Exit criteria | Per-frame reads at most 0.2 ms at the 99th percentile on device; the Nitro spike |

## Sources

- [Reevo 2 master document, v1.1](https://claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH)
- [UI Implementation Plan — Phase 1](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX)
- [UI Implementation Plan — Phase 2](https://claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic)
- [Nitro: worklets](https://nitro.margelo.com/docs/worklets)
- [Nitro: performance tips](https://nitro.margelo.com/docs/performance-tips)
- [Margelo: How to make pure JSI code faster](https://margelo.com/blog/make-jsi-run-faster)
- [react-native-mmkv README](https://cdn.jsdelivr.net/gh/mrousavy/react-native-mmkv@main/README.md)
- [Reanimated: useFrameCallback](https://docs.swmansion.com/react-native-reanimated/docs/advanced/useFrameCallback)
- [react-native-worklets on npm](https://www.npmjs.com/package/react-native-worklets)
- [PianoAcademyStudio repository](https://github.com/SumitRajpal/PianoAcademyStudio)
