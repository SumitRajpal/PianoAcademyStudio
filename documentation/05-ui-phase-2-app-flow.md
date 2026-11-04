# UI Implementation Plan — Phase 2: App flow v1.3 (based on master v1.6)

Oct 28, 2026 · @sumit

## Summary

Phase 2 fixes how the app flows: which screen leads where, when the engine listens, how every lesson runs from loading to results, and when the piano is calibrated. Nothing is built yet; this is the design for approval.

- **Launch always opens PianoChapterList.** Nothing is set up at launch.
- **Calibration waits for the first screen that plays the piano,** a lesson or Free2Play, then returns to it. A profile only comes from a completed calibration.
- **The microphone runs only on screens that play the piano,** and during setup.
- **Every lesson type runs the same states:** loading, preparing, ready, count-in, playing, paused and finished, then Results.
- **Free2Play writes what you play** on a grand staff.
- **The engine gains three checks** that stop a profile from going stale without anyone noticing.

Phase 2 also moves Phase 1 to v1.1. Phase 4 brought this document to v1.1: the Ready screen, loops and the three first-build lessons. Phase 5 brought it to v1.2: Free2Play's look, with the menu designs left for later. Master v1.6, which merged the engine re-audit and the calibration engine, brought it to v1.3 on 4 November 2026: calibration measures the keyboard size (any count from 25 to 88, confirmed by the student), every playing screen starts with a 1.5 s session check, the engine's statuses and their tiers grew, and recalibration asks only for the smallest fix.

## Decisions

Seventeen decisions came out of the Phase 2 discussion on 28 October 2026. The sections below explain each one.

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| 1 | First screen | Launch always opens PianoChapterList; there's no onboarding route | Nothing needs setting up before the student sees the lessons |
| 2 | When to calibrate | Before the first screen that plays the piano opens, if no profile is saved; also from Settings, or when the engine asks | The student is then at the piano, with the phone where it will stay (§8.1). Chapter 1 opens with a video, which needs no microphone |
| 3 | Setting up | An explanation with one Continue button, iOS's microphone prompt, piano type, phone placement, calibration (which measures the keyboard size and asks the student to confirm it), then back to the screen that asked | Apple's guidelines: ask for a permission when its feature is first used, and give the screen before the prompt a single Continue button |
| 4 | Profiles | Created only by a calibration that completes and passes its quality check (§8.10). An interrupted run resumes from its last step; a failed one saves nothing | The engine measures what it can't guess; the master rejected generic templates |
| 5 | Pianos | One active profile in the app; profiles stored by id (§8.11) | A second piano later is a picker screen, not a data migration |
| 6 | Microphone | On only during setup and on screens that play the piano: GuidedLesson, PracticeLesson, GameLesson and Free2Play. It starts as the screen opens | Battery and heat (§14.10), no microphone indicator over menus, and videos keep the phone's audio to themselves |
| 7 | Starting | Practice has a Start button; Guided starts at once, its clock waiting at the first note | Hands are on the keys before anything moves |
| 8 | Pausing Practice | Resume restarts the current bar with a count-in | The backing re-locks to the audio clock; `startPractice` takes the bar to start from (Phase 3) |
| 9 | Leaving a lesson | Only from the pause menu; the back swipe is off on playing screens; an unfinished attempt isn't saved | A hand brushing the screen edge mustn't end a lesson |
| 10 | Results | Its own route, `Results` with `lessonId` and `attemptId`, replacing the lesson page; Retry, Next and Chapter | Back from Results goes to the chapter, never into a finished lesson |
| 11 | End of a chapter | Next opens the next chapter's first lesson; after the last chapter, the chapter list | Owner's choice |
| 12 | Settings during a lesson | Not reachable; the pause menu is Resume, Restart and Leave | Changing grading or the playhead mid-attempt would make its record inconsistent |
| 13 | Screen | Kept awake on playing screens; 120 Hz is already allowed in Info.plist | Nobody touches the phone while playing, and auto-lock would cut the microphone |
| 14 | Interruptions | Three kinds: pause the lesson, a notice while playing, a message after the lesson | Matches the engine's status events (§6.7, §10.7) |
| 15 | Free2Play | A grand staff that writes notes as they're played, at 80% across, placed by time | A mirror for the student and a live test bench for the engine |
| 16 | Profile checks | The engine adds a transpose watch, a piano-mismatch status and refinement from correct lesson notes | The master caught only tuning drift and noise (§10.7); since v1.6 its health monitor also watches every calibration layer (§8.12) |
| 17 | First build | The real chapter list and grid, with one chapter holding three lessons: only C4, and Jingle Bells guided and practice (Phase 4) | Navigation and content are exercised from day one |

## Screen flow

&#91;embedded content: screen flow · 8 screens\]

Tinted screens run the microphone. Set up your piano opens from a lesson or Free2Play when no profile is saved, or from Settings to recalibrate, and returns to whichever screen opened it.

## How each screen uses the engine

Each screen that plays the piano starts the engine in its own mode as it opens; menus and videos leave the microphone off.

| Screen | Microphone | Engine runs | What the screen sends |
| --- | --- | --- | --- |
| Set up your piano (`Calibration` route) | On | Calibration (§8) | Piano type, each calibration step, the keyboard size the student confirmed, then the profile to save (§8.1, §8.3, §12.1) |
| PianoChapterList, Chapter, Settings, Results | Off | Nothing | Nothing; settings are saved and apply the next time the engine starts |
| GuidedLesson | On | Learning mode (§11.1) | Settings, then the score with its windows; the engine moves through the lesson itself |
| PracticeLesson | On | Practice mode (§11.2) | Settings, the score with its windows, the backing (loadBacking), then `startPractice` from the beginning or from a bar |
| GameLesson | On | Learning or Practice, whichever clock its game uses | As Guided or Practice |
| VideoLesson | Off | Nothing | Nothing; the video keeps the phone's audio to itself |
| Free2Play | On | Free mode (§11.4) | Settings only |

## A lesson from start to finish

Every lesson type runs the same states, managed by LessonKit/Session; only the start differs.

&#91;embedded content: lesson states · 8 states, 2 other screens\]

Practice begins with Start and a count-in; Guided goes straight to Playing. Dashed boxes are other screens.

| State | What happens | Moves on when |
| --- | --- | --- |
| Loading | The lesson's JSON is fetched by id and validated | Loaded: Preparing. Fails: an error with a Back button |
| Preparing | The engine starts and checks: microphone allowed, profile saved, every key the lesson needs on this keyboard (§2.5), audio route usable and measured (§6.1, §6.6). It also listens for 1.5 s, the session check: noise state, θ\* per tier and wind (§8.2); in Practice that listening may fall in the count-in instead | All pass: Ready. No profile: Set up your piano, then back here. Anything else: Blocked |
| Blocked | Says what's wrong and the fix: allow the microphone in iOS Settings, disconnect a Bluetooth headset (§6.1), or pick a lesson that fits this keyboard | Fixed: Preparing |
| Ready | The title, and the first notes lit on the keyboard | Practice: Start opens the count-in. Guided: straight to Playing |
| Count-in | One bar of clicks in the song's audio; the echo canceller adapts and latency is re-checked (§11.2) | The bar ends: Playing |
| Playing | The clock runs, and each note turns green or red | The lesson ends (Practice: the last window closes or the backing ends, whichever is later; Guided: the last note is played): Finished. Pause or interruption: Paused |
| Paused | The clock stops; the menu is Resume, Restart and Leave | Resume: Guided continues at its note; Practice restarts the current bar with a count-in |
| Finished | The attempt is complete | Results replaces the lesson page |

A loop (Phase 4) is a flag on Playing, not a new state. Setting one ends the attempt unsaved; only a full play-through reaches Finished.

## Setting up the piano

The piano is calibrated before the first screen that plays it opens, not at launch, and a profile only comes from a completed calibration.

1. A lesson or Free2Play opens, and Preparing finds no saved profile.
2. **Set up your piano** opens (the `Calibration` route):
   1. Why the app listens, with one Continue button and no way around it, as Apple's guidelines ask of a screen before a permission prompt.
   2. iOS asks for the microphone. If it's refused, the screen explains how to allow it in iOS Settings.
   3. Piano type, acoustic or digital (§8.1).
   4. Where to put the phone: where it will stay while playing (§8.1).
   5. Calibration (§8.1): 1.5 s of silence; the lowest and highest keys, from which the app works out the keyboard size, any count from 25 to 88, and the student confirms it (§8.3); anchor keys at each loudness; the chromatic scan in standard mode; the sound check and the quality check. Quick mode takes about a minute; the planner stops early in a quiet room and adds strikes in a noisy one.
3. The profile is saved, and the app returns to the screen that asked, which runs Preparing again.

Rules:

- **Only a completed calibration creates a profile.** It must pass the quality check (§8.10); a failed run saves nothing.
- **Interruptions resume.** A call during calibration pauses it, and it resumes from the last completed step.
- **Recalibration** comes from Settings, or when the engine asks. The engine asks for the smallest fix (§8.12): a re-scan when the phone has moved or the tuning has drifted, the chirp for a new route, a full calibration for a different piano (piano mismatch). It returns to Settings, or to the lesson that asked.
- **One piano for now.** The app keeps one active profile, and recalibrating replaces it. Profiles are still stored by id (§8.11; `loadProfile` in §12.1), so several pianos later needs a picker screen, not a migration.

## Interruptions and notices

The engine reports what happened (§6.7, §10.7), and the lesson responds in one of three ways.

| Kind | Examples | What the lesson does |
| --- | --- | --- |
| Pauses the lesson | A call or Siri; headphones plugged in or out; the app sent to the background; microphone access revoked (§6.7); a transpose change suspected | Pauses. The engine has already released every key; the student taps Resume |
| Notice while playing | Room too noisy, or one register too noisy for soft notes (§7.4); microphone overloaded, so move the phone back (§6.5); microphone blocked by a hand or a case (§10.4); nothing heard while the lesson expects notes, so check the keyboard's volume and headphones (§10.7); wind on the microphone (§8.2); the input still processing the sound (§8.9); phone too hot or in low-power mode, so the neural engine is off (§14.10); Bluetooth headphones, so timing isn't graded (§6.6) | A short message; playing continues |
| Message after the lesson | Re-scan needed: the phone moved or the tuning drifted (§8.12); piano mismatch; unisons need tuning (§8.7) | Shown on Results and the chapter list until resolved |

## Free2Play

Free2Play shows the keyboard with a grand staff above it that writes down each note as it's played. It's a mirror for the student, and the best live test bench for the engine, because every missed or ghost note shows.

- **A grand staff.** Free play spans the whole keyboard, so CoreNotes adds a bass staff and a BassClef atom; today it has only a treble staff.
- **A live timeline.** CoreNotes gets a second source of events: notes appended as they're detected, beside a lesson's fixed timeline.
- **Written at 80% across.** Nothing is coming up in free play, so a playhead at 30% would leave most of the screen empty. Notes appear at the write point and scroll left as they age. `freePlayWriteAt` (default 0.80) joins the setting registry.
- **Placed by time, not rhythm.** Free play has no tempo, so note values can't be written reliably. Each note is a notehead where it was struck, with a DurationBar that grows while the key is held. Rhythm notation needs tempo tracking: later, if ever.
- **Sharps by default** (C♯, not D♭), since there's no key signature.
- **Revisions show.** In fused mode a tentative note is drawn at 40% opacity until confirmed, and fades out over 150 ms if it's retracted (Phase 5); a NoteCorrect moves it to the right key (§9.7, §12.3). The master expects about 93% of notes right in free play, against 93–99% in lessons (§15, case 19).
- **Same frame as the key.** The note is written on the UI thread, from the same LiveKeys read that lights the key.
- **Only what's visible is drawn,** as in lessons.

## Keeping the profile valid

When this phase was written, the master flagged only tuning drift beyond 30 cents and noise 10 dB above calibration (§10.7). Three additions to the engine close the gaps, worst first.

| Gap | What goes wrong | Addition |
| --- | --- | --- |
| Transpose changed after calibrating | Calibration maps a transposed keyboard back to the keys pressed (§8.3). If Transpose is pressed later, every correct C4 sounds as a perfectly tuned C♯4. Drift detection sees nothing, and every note is reported wrong, breaking the release gate of at most 1 false accusation per 100 correct notes (§1) | **Transpose watch** in the matcher: a run of notes all off by the same whole number of semitones pauses the lesson with "Is Transpose on?" instead of reporting wrong notes |
| A different piano, or a voice other than PIANO | Timbre and stretch no longer fit, though tuning may stay within 30 cents. Calibration checks the voice only once (§8.10) | **Piano-mismatch status** when confident notes keep missing the profile's partials by more than 3σ, the test calibration's own quality check uses |
| Lessons teach the profile nothing | Refinement uses only isolated notes (§8.12), though a lesson knows which key was expected | **Refinement from correct lesson notes:** every note matched as correct is a labelled sample for the per-key refinement |

The transpose watch's run length and the mismatch window become engine settings, checked in the harness (§5.6).

Master v1.6 keeps all three and goes further: every calibration layer is refined while playing, and a health monitor turns each kind of drift into the smallest recalibration that fixes it, from a silent noise update to a re-scan of the placement layer (§8.12). The statuses that ask for those fixes, and their tiers, are in §10.7 and in the table above.

## Changes to Phase 1

Phase 2 moves the [Phase 1 document](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX) to v1.1; these changes are made there.

- **Navigation:** adds the `Results` route (`lessonId`, `attemptId`). The `Calibration` route now means Set up your piano or recalibrate, returning to the screen that opened it.
- **Repository layout:** adds `screens/Results/`.
- **CoreNotes:** a live timeline for Free2Play beside the lesson timeline, and a BassClef atom for the grand staff.
- **Scope and open items:** the first build's chapter list and grid are settled.

## Open items

Two details wait for later phases. Phase 4 settled the Ready screen: the title and the first notes lit, nothing more.

- [ ] Where the Free2Play icon and the Settings gear sit on PianoChapterList, and what a chapter card shows (with the owner's menu designs, later).
- [x] What the Ready screen shows beyond the title and first notes, such as hand position or fingering (Phase 4, lesson internals).
- [ ] The transpose watch's run length and the mismatch window, set in the engine harness (§5.6).

## Merge into master

Merged into master v1.2 on 28 October 2026, together with Phases 1 and 3. The v1.3 update follows master v1.6 and changes nothing further in the master.

| Master section | Change |
| --- | --- |
| §4 Configuration | Add `freePlayWriteAt` (0.80), the transpose watch's run length and the mismatch window |
| §6.7 Route changes and interruptions | The lesson pauses and the student resumes; a Practice resume restarts the current bar with a count-in |
| §8.1 Calibration protocol | Calibration runs before the first screen that plays the piano, after a pre-permission screen and iOS's prompt; an interrupted run resumes from its last step |
| §8.11 Profile storage | The app keeps one active profile for now; storage stays by id |
| §8.12 Online refinement | Notes matched as correct in lessons feed the per-key refinement |
| §10.7 Events | New statuses: transpose suspected, piano mismatch |
| §11.1 Learning mode | The transpose watch in the matcher |
| §11.4 Free play | The UI writes notes on a grand staff; tentative notes faint, retracted ones erased |
| §12.3 UI contract | Free2Play follows NoteConfirm, NoteRetract and NoteCorrect on the written staff |

## Sources

- [Reevo 2 master document, v1.1](https://claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH)
- [UI Implementation Plan — Phase 1](https://claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX)
- [Apple Human Interface Guidelines: Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy)
- [PianoAcademyStudio repository](https://github.com/SumitRajpal/PianoAcademyStudio)
