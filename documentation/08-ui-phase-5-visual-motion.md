# UI Implementation Plan — Phase 5: Visual and motion design v1.0 (based on master v1.3)

Oct 28, 2026 · @sumit

## Summary

Phase 5 sets how the Guided and Practice lesson pages look and move. The menus, Results, Settings, VideoLesson and Set up your piano get their designs from the owner later. Nothing is built yet; this is the design for approval.

- **One frame for every lesson page.** The piano stays at the bottom, and only the area above it changes: the staff for Guided and Practice, the game's own UI for a GameLesson.
- **Games draw their own look,** always 2D in Skia 3.
- **Red means wrong, and only wrong.** The note to play now turns indigo, and every result pairs its colour with a shape, so colour-blind players can read it too.
- **Starting numbers for every animation,** tuned later on the iPhone: a 150 ms pop for a correct note, a 180 ms shake for a wrong one.
- **Note names sit inside the noteheads** when a lesson shows them.
- **No Rive yet:** Results counts the score up instead.

## Decisions

Fifteen decisions came out of the Phase 5 discussion on 28 October 2026. The sections below explain each one.

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| 1 | Scope | The Guided and Practice lesson pages now; the menus, Results, Settings, VideoLesson and Set up your piano when the owner's designs arrive | Owner's choice |
| 2 | Lesson frame | The piano at the bottom of every lesson page; above it the staff (Guided, Practice) or the game's UI, chosen by the game id in the lesson's JSON | Owner's design; one PianoStage (Phase 1) |
| 3 | Game look | Each game has its own style, always 2D in Skia 3 | Owner's choice |
| 4 | Lesson look | The look the lesson screen already has: indigo gradient, white staff card, SF Pro Rounded | It was measured from the reference lesson screen |
| 5 | Note to play now | Indigo (#5F64E8) instead of red | Red means wrong |
| 6 | Colour and shape | A correct note pops, a wrong one shakes, a missed one shows a cross | About 1 in 12 men can't tell red from green |
| 7 | Note animations | Starting numbers below, tuned on the iPhone | The motion spec Phase 1 owed |
| 8 | Keys | The result colour for 300 ms, then back to the glow; stronger colours; the glow falls at most 2.0 per second and fades over 150 ms on release | Phase 3's two open numbers |
| 9 | Note names | A white letter inside each notehead when `showNotes` is true | Owner's choice |
| 10 | Loop strip | The top progress bar; its handles appear while paused when looping is on | No extra strip on screen |
| 11 | Count-in | Beat numbers 1 to 4 over the staff, one per click | The student sees where the bar is |
| 12 | Transitions | Menus slide; lessons, games and Free2Play fade in; Results fades in over the finished lesson | A fade covers the engine starting |
| 13 | Reduce Motion | Colour, shape and fades only; follows the phone unless the in-app setting overrides it | Decision M7 |
| 14 | Celebrations | No Rive in the first build; Results counts the score up | Who makes Rive animations is still open (M3) |
| 15 | Free2Play | Same staff look on a grand staff; unsure notes at 40%; retracted notes fade out over 150 ms | Revisions stay visible but calm |

## Every lesson page

Every lesson page keeps the same frame: the top bar, the area above the piano, and the piano at the bottom. Only the area above the piano changes with the lesson type.

| Lesson type | Area above the piano |
| --- | --- |
| GuidedLesson | The staff with notes |
| PracticeLesson | The staff with notes |
| GameLesson | The game's own UI, chosen by the game id in the lesson's JSON, in the game's own 2D style |

- The game id names a folder in `screens/lesson/GameLesson/games/` (Phase 1). GameLesson loads that game into the area, declaratively; no code chooses it.
- PianoStage stays one component (Phase 1): its top slot holds the staff or the game, and CorePiano sits below.
- VideoLesson's page comes later, with the menu designs.

&#91;embedded content: lesson page · top bar, area above the piano, piano\]

Guided and Practice put the staff above the piano; a GameLesson puts the game named by its game id there. The top bar and the piano stay the same on every lesson page.

## The lesson look

The lesson pages keep the look the lesson screen was measured from; Phase 5 changes only the colours that carry a result.

| Part | Look | Lives in |
| --- | --- | --- |
| Background | Indigo gradient, #3E427F to #8D93FF, ending at the keyboard's top | `lessonDesign.ts` |
| Staff | White card with a soft shadow; notation ink #3A3B3D; symbols from the Bravura and Leland fonts | CoreNotes look files |
| Text | SF Pro Rounded for the title, SF Pro for the timer | `lessonDesign.ts` |
| Accent | Indigo #5F64E8, already Calibration's accent | Shared colours |
| Key glow | Marigold #FFB648, following the sound (Phase 3) | `keyRoleColors.ts` |
| Correct | Green #1F9D55 (new) | CoreNotes skin and key roles |
| Wrong and missed | Red #FF3B30 (new) | CoreNotes skin and key roles |

The green and red are starting values, tuned on the iPhone. Both sit at about 3.5:1 against the white staff, so a coloured note stands out from the black ones.

## Note results

Every result pairs a colour with a shape or a movement, so it reads without colour: about 1 in 12 men, and 1 in 200 women, are colour-blind, most often red–green ([Live Science](https://www.livescience.com/health/genetics/why-is-color-blindness-so-much-more-common-in-men-than-in-women), citing the Cleveland Clinic).

| Result | Colour | Shape or movement | Starting timing |
| --- | --- | --- | --- |
| Note to play now | Indigo, see-through as today | None | Moves with the cursor |
| Correct | Green | Pops to 115% and back | 150 ms |
| Correct, perfect | Green | The pop, plus a ring that grows and fades | 200 ms |
| Wrong | Red | Shakes ±3 pt | 180 ms |
| Missed | Red | A small cross on the note; no movement | When the window closes |
| Checklist tick | Green | A tick drawn above the note | 200 ms |

- A note turned green after a wrong key (Phase 4) gets the plain pop, never the perfect ring.
- With Reduce Motion: colour and shape only; no pop, shake or ring.
- The numbers live in the CoreNotes skin's look file, so each is tuned on the iPhone in a Release build without touching code.

## Keys

A key glows with the sound while it's held, and briefly shows the result of its note.

- **Glow:** marigold, glow = 0.55 + 0.45 × level while held (Phase 3; 0.55 is today's `softestLevel`).
- **Fall:** at most 2.0 per second, so the level's swings from beating strings don't flicker it.
- **Release:** fades out over 150 ms. A very short note stays lit at least 120 ms (today's `shortestLitMs`).
- **Result:** when its note is judged, the key shows green or red for 300 ms, then goes back to its glow if it's still held.
- **Stronger colours:** today's pale role colours (#BFE8CE, #F2C4CB) barely show on a white key, so keys use the notes' green and red.
- **Letters** on the keys always show (Phase 4).

## Note names

When a lesson sets `showNotes` to true, each notehead carries its letter.

- A white letter in SF Pro Rounded, bold, centred in the notehead; about 60% of the notehead's height as a starting value.
- The letter only: a sharp or flat stays on the staff as usual.
- The letter turns with its note: green, red or indigo noteheads keep a white letter.
- From about lesson 10, lessons set `showNotes` to false (Phase 4).

## Top bar, loop strip and count-in

The top bar keeps what the lesson screen already draws, and its progress bar doubles as the loop strip.

- **Top bar:** the pause button, the title, a timer of time played, the bar number and the hand (Phase 4).
- **Progress bar:** the thin bar under the title shows where the song is.
- **Loop strip:** in a lesson with `looping` on, two handles appear on the progress bar while paused and snap to bar lines (Phase 4). The section between them is tinted in the accent.
- **Count-in:** large beat numbers, 1 to 4, appear over the staff, one per click. With Reduce Motion they appear without scaling.

## Screen transitions

Menus slide, and anything that plays the piano fades in, which covers the engine starting.

| Moving to | Transition | With Reduce Motion |
| --- | --- | --- |
| A menu screen | The native stack's slide | A fade |
| A lesson, a game or Free2Play | A fade | A fade |
| Results | A fade over the finished lesson | A fade |

This settles the line in CLAUDE.md that leaves ordinary view transitions open. CLAUDE.md and an ADR record it when building starts, with the owner's OK.

## Reduce Motion and the hot phone

Every animation has a calm version, and effects step down in a fixed order when the phone slows itself down.

- **One motion settings file** declares each calm version (decision M7).
- **It follows the phone's Reduce Motion,** unless the in-app setting overrides it: `reduceMotion`, system, on or off, default system, in a Motion group of the setting registry (Phase 1).

| Animation | Calm version |
| --- | --- |
| Note results | Colour and shape; no pop, shake or ring |
| Staff glide (moving playhead) | An instant cut (Phase 1) |
| Screen transitions | Fades only |
| Count-in | Numbers without scaling |
| Results count-up | The score appears at once |

**When the phone is hot.** Long sessions heat the phone, and it slows itself down. When frames start dropping, effects step down in this order: the perfect ring first, then pops and shakes, then the frame rate from 120 to 60 Hz. Note colours and shapes always stay.

## Free2Play

Free2Play uses the lesson's staff look on a grand staff, and shows the engine's revisions calmly.

- A grand staff with a bass clef; notes are written at `freePlayWriteAt` (0.80) and scroll left (Phase 2).
- A note the engine isn't sure of yet is drawn at 40% opacity, and turns solid when confirmed.
- A note the engine takes back fades out over 150 ms.
- A NoteCorrect moves the note to its new key (Phase 2).

## Results and the menus

Results counts the score up, and the screens without designs are built plainly until the owner's designs arrive.

- **Results** counts the score up from 0 over 600 ms (a starting value); with Reduce Motion it appears at once.
- **No Rive animation** in the first build; who makes Rive animations is still open (M3).
- **Designs later:** the chapter list, the chapter grid, Results, Settings, VideoLesson and Set up your piano. Until then they are built plainly from the UI kit (`src/ui/`), so the first build works end to end, and they are restyled when the designs arrive.

## Motion specs and checks

Each animation gets a short spec in `docs/motion/`, from the repo's template, when it's built: its trigger, timeline, sync, calm version, frame budget and golden frames.

| Spec | Covers |
| --- | --- |
| note-results | Pop, ring, shake, cross and tick |
| key-glow | Glow, fall rate, release fade and result colour |
| staff-camera | Fixed and moving playhead, and the 300 ms glide |
| count-in | Beat numbers |
| loop-strip | Progress bar, handles and section tint |
| screen-transitions | Slides and fades |
| free-play-writing | Unsure, confirmed, retracted and moved notes |
| results-count-up | The score count |

- **Pure drivers:** each animation's values are a function of events and time, tested in Jest on a virtual clock.
- **Golden frames:** rendered headless (`scripts/design`) at chosen moments; the owner approves the reference images.
- **Feel:** judged by the owner on the iPhone, in a Release build.

## Changes to Phases 1–4

These changes were made in the earlier documents on 28 October 2026, when this one was approved.

- **[Phase 1](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX), to v1.4:** settings gain `reduceMotion`; its open item for the green and red motion spec is settled here; the note to play now turns indigo.
- **[Phase 2](https://claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic), to v1.2:** where the Free2Play icon and the Settings gear sit waits for the owner's menu designs; Free2Play gets its look.
- **[Phase 3](https://claude.ai/artifact/XSQ9Tp8uiaZzkcAaf8iqGQ), to v1.2:** its open item is settled: the glow falls at most 2.0 per second and fades over 150 ms on release.
- **[Phase 4](https://claude.ai/artifact/VsvkoSWSWpojhjb9AmHiJg), to v1.1:** its open item is settled: the tick, the note names and the loop strip.

## Open items

Four items stay open; none blocks the lesson pages.

- [ ] Designs for the chapter list, the chapter grid, Results, Settings, VideoLesson and Set up your piano, from the owner.
- [ ] Where the Free2Play icon and the Settings gear sit, with those designs.
- [ ] Each game's look, settled with the game: always 2D in Skia 3.
- [ ] Every starting number, tuned on the iPhone in a Release build.
- [x] Merging Phase 5 into the master, after the owner's yes.

## Merge into master

Merged into master v1.4 on 28 October 2026, after the owner's yes. The changes to Phases 1–4 are made: Phase 1 is v1.4, Phases 2 and 3 are v1.2, and Phase 4 is v1.1.

| Master section | Change |
| --- | --- |
| §4 Configuration | The app group gains `reduceMotion`: system, on or off |
| §12.3 UI contract | Results pair colour with shape (pop, shake, cross); the note to play now is indigo; a key shows its note's result for 300 ms; the glow falls at most 2.0 per second and fades over 150 ms on release |
| §17 References | The Phase 5 document |

## Sources

- [Reevo 2 master document, v1.3](https://claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH)
- [UI Implementation Plan — Phase 1](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX)
- [UI Implementation Plan — Phase 2](https://claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic)
- [UI Implementation Plan — Phase 3](https://claude.ai/artifact/XSQ9Tp8uiaZzkcAaf8iqGQ)
- [UI Implementation Plan — Phase 4](https://claude.ai/artifact/VsvkoSWSWpojhjb9AmHiJg)
- [Live Science: why colour blindness is more common in men](https://www.livescience.com/health/genetics/why-is-color-blindness-so-much-more-common-in-men-than-in-women)
- [PianoAcademyStudio repository](https://github.com/SumitRajpal/PianoAcademyStudio): the lesson look files, the art-style rule for games and the motion spec template
