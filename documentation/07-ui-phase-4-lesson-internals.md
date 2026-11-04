# UI Implementation Plan — Phase 4: Lesson internals v1.3 (based on master v1.8)

Oct 28, 2026 · @sumit

## Summary

Phase 4 fixes what happens inside a lesson: one state machine and a controller per lesson type, how guided and practice lessons run, looping, grading and what is saved. Nothing is built yet; this is the design for approval.

- **One principle for both lesson types.** Guided and Practice both run a timeline, a clock and a playhead. Guided flows at the lesson's tempo and stops at each note until it's played; Practice plays the backing song.
- **The checklist is a look, not a format.** All its notes sit on a still staff, the playhead moves across them in order, and each note gets a tick.
- **Declared in the lesson's JSON:** the checklist look (`checklist`), note names on the staff (`showNotes`) and looping (`looping`).
- **Looping.** The student drags two handles to repeat a section. Passes are practice; only a full play-through opens Results.
- **Grading.** Each note earns credit (perfect 100%, good 75%), averaged into a score from 0 to 100.
- **The backing song** is a FLAC file that react-native-audio-api decodes before the lesson starts; the engine keeps it in memory and plays it.

The first build has three lessons: one using only C4, and Jingle Bells as a guided and as a practice lesson. Phase 5 brought this document to v1.1: the look of the tick, the note names and the loop strip. Version 1.2 decodes the backing from FLAC with react-native-audio-api instead of reading a WAV.

## Decisions

Eighteen decisions came out of the Phase 4 discussion on 28 October 2026. The sections below explain each one.

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| 1 | Session | One state machine in LessonKit/Session runs Phase 2's states for every lesson type, tested without React | One behaviour to test; lesson types differ only in their controllers |
| 2 | Controllers | A plain TypeScript controller per lesson type turns the lesson and its settings into engine commands, and engine events into Session events. Pages only render | Testable against the mock engine; GameLesson reuses a controller later |
| 3 | State | No global state library: each lesson page owns its session, and Results loads the saved attempt by id | Nothing outlives a lesson except its record |
| 4 | One principle | Guided and Practice both run a timeline, a clock and a playhead | Owner's rule |
| 5 | Guided clock | Flow and wait: the staff moves at the lesson's tempo and stops at each note until it's played | Teaches rhythm and forgives lateness |
| 6 | Checklist | A lesson setting, not a format: a still staff, the playhead moving across, played in order, a tick on each note | Same engine behaviour; only the look differs |
| 7 | Targets | Exact keys: C4 means C4 | Owner's rule |
| 8 | Chords | While a chord waits, each key counts once struck, in any order | Beginners roll chords |
| 9 | Hints | Letters on the piano keys always show; note names on the staff follow `showNotes`; no other hints | Owner's choice: names leave the staff as the student progresses |
| 10 | Backing | `loadBacking(samples, sampleRate)` in Preparing takes the backing, decoded by react-native-audio-api from a 48 kHz mono FLAC, into memory, and the engine plays it. The backing MIDI becomes JSON when content is built | Nothing reads the disk while playing; the echo canceller needs the exact output (master 11.3); the app never parses MIDI; FLAC is sample-exact, so the song starts on its first beat |
| 11 | Practice end | Finished when the last window closes or the backing ends, whichever is later | The song is heard to its end |
| 12 | Speed | Slower tempo comes later | It needs a re-rendered backing |
| 13 | Looping | Turned on by `looping` in the lesson's JSON; two handles snap to bar lines; a count-in before the first pass only; passes are practice | Owner's choice; declarative |
| 14 | Grading | Credit per note: perfect 100%, good 75%, late 50%, corrected 50% at most, wrong or missed 0, unclear not counted; score = average × 100 | The common pattern in music apps: a judgement per note, turned into a score from 0 to 100 |
| 15 | Results | Score and counts; no stars or locked lessons yet; Next always works | Gamification comes later |
| 16 | Record | Every completed attempt is saved on the phone as data, never audio | Results now; replayable tests and gamification later |
| 17 | Top bar | The timer shows time played; the bar number and hand come from the timeline | Owner's choice |
| 18 | First build | A C4-only lesson, Jingle Bells guided and Jingle Bells practice | Owner's choice; C4 is on every keyboard |

## Inside a lesson

Every lesson page has three parts with one job each. All three run on the JavaScript thread, and none is on the path from a played note to the screen (Phase 3).

| Part | Job |
| --- | --- |
| Session (`LessonKit/Session`) | A pure state machine: Phase 2's states (loading, preparing, blocked, ready, count-in, playing, paused, finished) and the events that move between them. The same for every lesson type |
| Controller (`GuidedLessonController`, `PracticeController`) | Turns the lesson's JSON and its resolved settings into engine commands, and engine events into Session events |
| Page | Renders PianoStage and the top bar from the session's state, and passes the student's taps to the controller |

Every controller has the same shape:

```ts
interface LessonController {
  prepare(lesson: Lesson, settings: ResolvedSettings): Promise<Prepared>; // setScore, loadBacking, checks
  start(): void;    // Guided: the clock waits at the first note. Practice: count-in, then startPractice
  pause(): void;
  resume(): void;   // Practice restarts the current bar with a count-in
  restart(): void;  // a new attempt from the beginning
  setLoop(fromBar: number, toBar: number): void;
  clearLoop(): void;
  dispose(): void;  // stop: releases every key and closes audio
}
```

- **Events in.** The engine wakes JavaScript once per batch (Phase 3). The controller turns Verdicts into progress and Status events into Phase 2's three tiers.
- **The record.** LessonKit/FeedbackDetection records every verdict in order and reads the whole VerdictTable once more at Finished (Phase 3).
- **No global store.** The page owns its session; Results loads the saved attempt by id.
- **Tests.** The Session is tested alone in Jest, and each controller against the mock engine replaying recorded playing.
- **GameLesson, later,** uses whichever controller its game's clock needs (Phase 2).

## GuidedLesson

A guided lesson flows at its tempo and waits at each note until the student plays it, so it teaches rhythm without punishing a slow reader. It has no backing song.

**Flow and wait**

- The clock runs at the lesson's tempo between notes and stops when the playhead reaches a note not yet played. The lesson starts with the clock waiting at the first note (Phase 2).
- The right key counts from `earlyMs` before the note's time, and the staff keeps moving.
- Once the playhead has stopped, a strike within `lateMs` still counts as on time; after that it counts as late.
- When the note is played, the engine moves the cursor and restarts the clock from that spot; JavaScript is told afterwards (Phase 3).
- A strike outside every window, including the right key played too early, is an extra note: nothing turns red, and the student plays the note when it arrives.

**Wrong keys and chords**

- A wrong key turns red only when the engine is at least 90% sure (master 11.1), and the staff keeps waiting.
- A chord waits until each of its keys has been struck once, in any order. Each key turns green as it lands.

**The checklist look**

- A lesson with `checklist: true` shows all its notes at once on a still staff. The playhead moves across them, and each note gets a tick when it's played.
- The behaviour is the same flow and wait, in order; only the look differs. A checklist lesson uses the moving playhead whatever the student's `fixPlayhead` says.
- A checklist longer than the screen turns the page the way the moving playhead does (Phase 1).

**Note names**

- The letters on the piano keys always show.
- Note names on the staff follow the lesson's `showNotes`. Early lessons show them; from about lesson 10, lessons set it to false.
- No other hints are shown: no lit next key, no finger numbers, no extra hint after wrong tries.

&#91;embedded content: guided clock · flow and wait\]

Each dot is a strike. The right key counts from `earlyMs` before its note, so an early note never stops the staff; a note not yet played stops it until it is.

## PracticeLesson

A practice lesson plays the backing song and judges each note in its window. The engine plays the song itself, from memory.

**Loading the backing**

- In Preparing, LessonKit/Backing decodes the backing with react-native-audio-api's `decodeAudioData`, resampled to the engine's output rate, and hands the samples to the engine with `loadBacking(samples, sampleRate)`. Ready waits for it, and nothing reads the disk while playing.
- The engine plays the backing itself, because the echo canceller needs the exact samples sent to the speaker (master 11.3).
- The file is a 16-bit, 48 kHz mono FLAC: lossless and sample-exact, so the song starts exactly on its first beat, at about half the size of a WAV. In memory it takes 6.5 MB for Jingle Bells' 34 seconds.
- **Decoding only.** react-native-audio-api creates no AudioContext here, and the app turns its session management off at start (`AudioManager.disableSessionManagement()`), so only the engine sets the audio session and plays sound while the microphone is on.
- **Smaller app.** FLAC decodes without FFmpeg, so the app can leave out FFmpeg and the Ogg and Opus libraries (`disableFFmpeg`, `disableStaticExternalLibs`), which add several MB.
- **Bundling.** Metro bundles .flac once `flac` joins its asset extensions. The decoder gets a file path, because its asset-id route takes only mp3, wav, mp4, m4a and aac.
- The backing MIDI becomes a JSON note list when content is built (`scripts/content/`), and LessonKit/Score sends it with `setScore`. The app never parses MIDI.
- `setScore` also carries each bar's start time, worked out from `bpm`, the time signature and `leadInMs` (Phase 1), so starts and loops land on bar lines.

**Why the engine plays the backing** (audited on 28 October 2026)

react-native-audio-api decodes the song, and the engine plays it. Playing it from react-native-audio-api instead would cost the three things that make practice mode work:

| Needed for | CoreEngine plays it | react-native-audio-api plays it |
| --- | --- | --- |
| Echo canceller (master 11.3) | Gets every sample sent to the speaker, on the microphone's sample clock | Gets nothing: the backing reaches the microphone uncancelled, and its notes become false notes |
| Staff timing (Phase 3) | Song time comes from the output samples, so the staff shows what is heard | Song time sits on another clock, so the staff drifts from the sound |
| Expected notes on the microphone's timeline (master 11.2) | The measured round trip maps each expected onset to the input | Nothing links its output to the engine's input |
| Audio session | One owner | Two audio stacks sharing one session |

Today's engine only records: on iOS its RemoteIO unit has output switched off, and on Android its Oboe stream is input only. The output path is new work either way, because the latency test plays its chirp through the engine (master 6.6).

**Playing**

- Start opens a one-bar count-in, then `startPractice` from the first bar (Phase 2).
- Each note is judged in its window (master 11.5), and the staff reads song time from the engine's clock (Phase 3).
- A strike outside every window is an extra note: it is recorded and counted on Results, but nothing turns red, because no note is there.
- Resume after a pause restarts the current bar with a count-in (Phase 2).
- Restart begins a new attempt from the first bar with a count-in; the unfinished attempt isn't saved (Phase 2).
- The lesson finishes when the last note's window closes or the backing ends, whichever is later.
- A slower tempo comes later, because it needs a re-rendered backing.

## Looping

A lesson that sets `looping: true` lets the student repeat a section; a lesson without it shows no loop controls.

- **Choosing the section.** While paused, the student drags two handles on a thin strip that shows the whole song, since the staff shows only a few bars at a time. The handles snap to bar lines.
- **Both lesson types.** A guided loop flows and waits as usual; a practice loop plays the backing.
- **Repeats.** Practice counts in before the first pass only, then repeats the section without a gap. Guided has no count-in: the clock waits at the section's first note.
- **The engine jumps back itself,** exactly at the bar line, so JavaScript is never in the loop: `setLoop(fromBar, toBar)` and `clearLoop()`.
- **The VerdictTable** resets the section's rows to pending at each pass, and every Verdict carries the pass number, so a new pass starts when the number changes.
- **Passes are practice, not attempts.** Each pass shows its score in the top bar. Setting a loop ends the current attempt without saving it; only a full play-through from the start, with no loop, opens Results.
- **Leaving the loop.** Clearing it keeps playing from where the playhead is, still as practice; Restart begins a new attempt.
- **The Session** stays in its playing state; the loop is a flag on it, not a new state.

## Lesson settings

Three new keys join the setting registry (Phase 1). A lesson's JSON sets them, and the student can't change them.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `checklist` | boolean | false | All notes on a still staff, the playhead moving across, a tick on each note. Overrides `fixPlayhead` for that lesson |
| `showNotes` | boolean | true | Note names on the staff. The letters on the piano keys always show |
| `looping` | boolean | false | The student may set a loop |

```ts
checklist: { type: 'boolean', default: false, setBy: ['lesson'], group: 'Lesson' },
showNotes: { type: 'boolean', default: true,  setBy: ['lesson'], group: 'Notes' },
looping:   { type: 'boolean', default: false, setBy: ['lesson'], group: 'Lesson' },
```

A lesson declares them beside its grading preset, for example:

```json
"settings": { "grading": "beginner", "showNotes": true, "looping": true }
```

## Grading

Each expected note earns credit for the right key and its timing, and the attempt's score is the average credit, from 0 to 100. This is the common pattern in music apps: [osu!](https://osu.ppy.sh/wiki/Accuracy) weights each judgement and averages them; [Casio's Chordana Play for Piano](https://web.casio.com/app/en/piano/manual/BONDSYivmhtcjb.html) judges every strike Perfect, Good or Miss and shows a score from 0 to 100; [Yousician](https://support.yousician.com/hc/en-us/articles/208014795-How-song-score-is-calculated) and [Melodics](https://support.melodics.com/en/articles/15092017-lesson-scoring) add stars, which wait for gamification here.

| Note result | Credit |
| --- | --- |
| Right key, perfect: the inner half of the window | 100% |
| Right key, good: the rest of the window | 75% |
| Guided only: right key, but the staff had to wait | 50% |
| Right key after a wrong key on the same note | 50% at most |
| Wrong or missed | 0 |
| Unclear: the engine can't tell | Not counted |

- **Score** = 100 × the total credit ÷ the notes counted, rounded to a whole number.
- **Extra notes** are listed on Results but don't lower the score.
- **Corrected notes.** In Practice, a wrong key followed by the right one inside the window still turns green (Phase 1), but earns at most 50%; the VerdictTable marks the row as corrected.
- **Presets** hold the credit beside the windows. Both presets use the same credit; only the windows differ.

```json
{
  "schemaVersion": 1,
  "id": "beginner",
  "earlyMs": 100,
  "lateMs": 100,
  "perfectFraction": 0.5,
  "confirmPosterior": 0.9,
  "credit": { "perfect": 1, "good": 0.75, "late": 0.5, "corrected": 0.5 }
}
```

The advanced preset has `earlyMs` and `lateMs` of 50. Dynamics and note length stay off, so their weights wait until they're turned on (master 16.3).

## Results and the attempt record

Results shows the score and the counts behind it. Every completed attempt is saved on the phone as data, never audio.

| Lesson type | Results shows |
| --- | --- |
| PracticeLesson | Score; notes right, wrong, missed and extra; perfect against good; the average offset, which shows rushing or dragging |
| GuidedLesson | Score; notes right first time; wrong tries; late notes; time taken |

- No stars or locked lessons yet: Next always opens the next lesson. Retry, Next and Chapter stay as Phase 2 set them.

**The record**

```ts
type AttemptRecord = {
  attemptId: string;
  lessonId: number;
  lessonRevision: number;
  lessonType: 'GuidedLesson' | 'PracticeLesson';
  startedAt: string;            // ISO 8601
  durationMs: number;
  settings: ResolvedSettings;   // preset, checklist, showNotes, looping, playhead
  profileId: string;
  engine: 'dsp' | 'neural' | 'fused';
  verdicts: {
    expectedId: number;
    verdict: 'correct' | 'wrong' | 'missed' | 'unclear';
    midiPlayed: number | null;
    timeMs: number | null;
    offsetMs: number | null;
    tier: 'perfect' | 'good' | 'late' | null;
    corrected: boolean;
    confidence: number;
  }[];
  extras: { midi: number; timeMs: number }[];
  statuses: { code: string; timeMs: number }[];
  score: number;                // 0 to 100
};
```

- Saved with MMKV under its id, beside a list of each lesson's attempt ids, newest first. Every completed attempt is kept; each is a few KB.
- Unfinished attempts and loop passes are not saved.
- Played back through the replay engine, a record becomes an automated test (Phase 1).

## Ready screen and top bar

The Ready screen keeps Phase 2's content, and the top bar shows where the student is without ever joining the note path.

- **Ready:** the title, and the first notes lit on the keyboard (Phase 2). Practice adds its Start button; Guided goes straight to playing. Finger numbers are left out, since lessons show no hints beyond note names.
- **Top bar while playing:** the title; a timer of time played, which counts only while playing; the bar number and the hand of the next note, from the timeline and the clock; and, in a loop, the last pass's score.
- **Updates:** the page reads these a few times a second on the JavaScript thread, never per frame and never on the path from a played note to the screen.
- **The look** of both is set in Phase 5: the progress bar doubles as the loop strip, and the count-in shows beat numbers.

## First build

The first build has three lessons in one chapter, reached through the real chapter list and grid (Phase 2).

| Lesson | Type | Backing | Notes |
| --- | --- | --- | --- |
| Only C4 | Set by its JSON | None | C4 only, which every keyboard has |
| Jingle Bells | GuidedLesson | None | Flow and wait |
| Jingle Bells | PracticeLesson | The backing song | Phase 1's example lesson |

- The owner supplies the three JSON files, the backing FLAC and its MIDI.
- The C4 lesson's JSON decides its type and whether it uses the checklist look.
- Lessons stay on keys every keyboard has, and Preparing still checks them against the student's keyboard (Phase 2).

## Changes to Phases 1–3

These changes were made in the earlier documents on 28 October 2026, when this one was approved.

**[Phase 1](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX), to v1.3**

- Settings: adds `checklist`, `showNotes` and `looping`; grading presets gain `perfectFraction` and `credit`.
- Content model: GuidedLesson keeps its timeline. The checklist is a setting, so there's no second format.
- FeedbackDetection: the Guided verdict row becomes flow and wait, and a corrected note earns at most 50%.
- Open items and scope: the guided variants are settled, and the first build has three lessons.

**[Phase 2](https://claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic), to v1.1**

- Ready: the title and the first notes lit, nothing more; its open item is closed.
- Lesson states: a loop is a flag on the playing state, and setting one ends the attempt unsaved.
- First build: the three lessons.

**[Phase 3](https://claude.ai/artifact/XSQ9Tp8uiaZzkcAaf8iqGQ), to v1.1**

- Clock: Guided runs at rate 1 between notes and 0 while waiting; it re-anchors when the note is played and at each loop pass.
- Commands: adds `loadBacking`, `setLoop` and `clearLoop`; `setScore` carries the backing notes and the bar start times.
- VerdictTable and the event record: the tier gains late, and each verdict gains a corrected flag and the pass number.

**Version 1.2, 28 October 2026:** Phase 1 moves to v1.5 (the backing is a FLAC decoded by react-native-audio-api, and LessonKit/Backing joins the layout), and Phase 3 to v1.3 (`loadBacking(samples, sampleRate)`).

## Open items

Three items stay open; none blocks the build plan.

- [ ] The three lesson JSON files, the backing (a 16-bit, 48 kHz mono FLAC) and its MIDI, from the owner.
- [ ] The C4 lesson's type and look, set in its JSON.
- [ ] Whether the Ready screen should show finger numbers; they're left out for now, since lessons show no other hints.
- [x] The look of the tick, the note names and the loop strip (Phase 5).
- [x] Merging Phase 4 into the master, after the owner's yes.

## Merge into master

Merged into master v1.3 on 28 October 2026, after the owner's yes. The changes to Phases 1–3 are made: Phase 1 is v1.3, Phases 2 and 3 are v1.1. The v1.3 update follows master v1.8, which follows Reevo 2 only: the attempt record's `engine` loses legacy. It changes nothing further in the master.

| Master section | Change |
| --- | --- |
| §3.2 Common currency | VerdictTable: the pass number in its header, the section's rows reset at each loop pass, the late tier and the corrected flag |
| §4 Configuration | Lesson settings `checklist`, `showNotes` and `looping`; grading presets gain the credit per note |
| §6.2 Sample clock | Guided runs at rate 1 between notes and 0 while waiting |
| §11.1 Learning mode | Flow and wait; the right key counts from `earlyMs` before its note; a chord completes when each key is struck once; strikes outside every window are extra notes |
| §11.2 Practice mode | The backing is decoded into memory before Ready and played by the engine; backing notes arrive as JSON; the end rule; loops |
| §11.5 Grading | Credit per note and the score from 0 to 100 |
| §12.1 JSI surface | `loadBacking`, `setLoop` and `clearLoop`; `setScore` carries the bar start times and the backing notes |
| §12.2 Event format | The late tier, the corrected flag and the pass number |
| §16.3 Open items | Grading weights settled for key and timing; dynamics and note length wait until they're turned on |

**Version 1.2** merged into master v1.5 on 28 October 2026: §6.1 (only the engine sets the audio session; react-native-audio-api only decodes), §11.2 and §12.1 (the backing is decoded from FLAC by react-native-audio-api and handed to the engine), and §17.

## Sources

- [Reevo 2 master document, v1.2](https://claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH)
- [UI Implementation Plan — Phase 1](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX)
- [UI Implementation Plan — Phase 2](https://claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic)
- [UI Implementation Plan — Phase 3](https://claude.ai/artifact/XSQ9Tp8uiaZzkcAaf8iqGQ)
- [osu! wiki: Accuracy](https://osu.ppy.sh/wiki/Accuracy)
- [Casio Chordana Play for Piano: Scoring performances](https://web.casio.com/app/en/piano/manual/BONDSYivmhtcjb.html)
- [Yousician: How song score is calculated](https://support.yousician.com/hc/en-us/articles/208014795-How-song-score-is-calculated)
- [Melodics: Lesson scoring](https://support.melodics.com/en/articles/15092017-lesson-scoring)
- [PianoAcademyStudio repository](https://github.com/SumitRajpal/PianoAcademyStudio)
