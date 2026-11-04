# Feature: Reevo 2 only

- **Status:** Built on 4 November 2026 on `claude/chore-setup`. Approved the same day with both recommendations: keep v1.2 running until Reevo 2 replaces it (1a), and delete the project's copy of the report (2a)
- **Owner's request:** 4 November 2026, 19:29: "all thing related to Apexv1 apex v2 and previous engine and caliberation should be removed we are only following the latest engine whcih is reevo 2". Earlier the same day: "we will be implementing the new Engine which is reevo 2".

## Goal

The plan and the repository follow one engine, Reevo 2, with its calibration engine. Apex v1, Apex v2, the original Reevo and v1.2 stop being part of the plan, the documents and the harness.

## What exists today

| What | Where | Tied to |
| --- | --- | --- |
| The Apex v2.0 design, as a PDF and a DOCX | `documentation/research/` | Apex v2, from which v1.2 was built |
| The research report comparing Apex v1, Apex v2 and Reevo | `documentation/research/engine-comparison-report.md`, and a copy in the claude.ai "Piano" project | All three older designs |
| About 25 comparisons in the master, such as "keeps Reevo's five-state machine" or "replaces Reevo's fast-forward" | Sections 1, 2.2, 3, 3.1, 6.3, 6.5, 7.2, 8.7, 8.11, 9, 9.1, 9.4, 10, 12, 12.1, 12.6, 14.2, 14.3 and 17 | The original Reevo |
| v1.2 in the plan: the Phase 0 baseline and its rejection log, the legacy switch, the A/B test | Master 1, 4, 5, 5.4, 5.5, 5.7, 6, 12, 12.2, 12.5, 12.7, 13, 13.5, 13.8 and 16.1; the Phase 1, 3 and 4 documents; one phrase in the re-audit | v1.2 |
| v1.2's code: capture (mic input, ring buffer, LiveKeys), detection, two-strike calibration, the TurboModule, the 46-scenario gate | `packages/CoreEngine/`: `cpp/legacy/`, `bindings/`, `src/`, `ios/`, `android/`, `test/` | v1.2, which the app runs today |
| The screens that use it | The Calibration screen, the lesson screen's diagnostics overlay, `App.tsx` | v1.2 |
| Phase 0's v1.2 parts, built today | The rejection log in `Cascade.h`, the replay runner, the golden baseline, the gate table in the harness guide | v1.2 |
| Mentions in the repository's own docs | CLAUDE.md, the glossary, the roadmap, the harness guide, the Phase 0 spec, ADR 0004, the step 2 spec | All of them |

## Questions for the owner

1. **v1.2's code.** Reevo 2 has no code yet, and the master builds it on the app's existing capture code.
   - (a) Keep v1.2 running until Reevo 2 replaces it. *Recommended*: no work goes into it, and the plan stops measuring or comparing against it, but the app keeps hearing notes and keeps today's calibration screen while Reevo 2 is built. Phase 7 puts Reevo 2 in its place and deletes it.
   - (b) Delete v1.2's detection and calibration now, keeping only the capture code Reevo 2 builds on. The app can't hear notes or calibrate until Reevo 2 reaches the phone in Phase 7, so until then every iPhone check is visual only.
   - (c) Keep v1.2 as the plan has it: the Phase 0 baseline and an A/B switch until Phase 8. Only the Apex and Reevo material goes.
2. **The claude.ai project.** Delete its copy of the comparison report too?
   - (a) Yes. *Recommended*: the repository's `documentation/` folder is the plan's home, and the project's copies are retired.
   - (b) No, the repository only.

## Changes, with 1(a) and 2(a)

### Documents

- Delete `documentation/research/` (the Apex v2.0 PDF and DOCX, and the comparison report), and the project's copy of the report.
- **Master v1.8.** Merge into master:

| Section | Change |
| --- | --- |
| 1 | Reevo 2 described on its own: one engine, DSP and neural evidence, one decision layer. "Base" becomes a new engine on the app's existing capture code; "Engines" becomes "Evidence: DSP, neural or fused". The success targets are confirmed in Phase 8, with no baseline to beat |
| 2.2 | The energy-at-bin finding stays, without naming Reevo |
| 3, 3.1 | "Reevo's structure" goes. 3.1 becomes "The engine's parts": the same twelve parts, each described as Reevo 2 builds it |
| 4 | `legacyEngine` removed; `rejectionLog` points to 5.5 |
| 5, 5.4, 5.6, 5.7 | Phase 0 builds the corpus and the harness, with no v1.2 baseline. Its exit: the corpus, synchronised labels, and a scorer checked on takes with known answers |
| 5.5 | Becomes "Rejection log and miss causes": Reevo 2's own log (4, Diagnostics) records what held back each candidate and each expected note not detected, and the harness publishes a histogram of miss causes for every build |
| 6, 6.3, 6.5 | "v1.2's proven capture code" becomes "the app's existing capture code"; the comparisons with Reevo go |
| 7.2, 8.7, 8.11, 9, 9.1, 9.4, 10, 12, 12.1, 12.6, 14.2, 14.3 | Each part described on its own. The findings that justify it stay, without naming the engine they came from |
| 12.2 | `source` is dsp, neural or fused |
| 12.5 | "Legacy engine toggle" becomes "Replacing today's engine": Phase 7 puts Reevo 2 where v1.2's detection and calibration were, and deletes that code |
| 12.7, 13, 13.8 | The legacy switch and the "better than v1.2" gate go |
| 13.5 | "A/B against v1.2" becomes "Paired comparisons": the same McNemar test, now between evidence modes (14.11) and between a change and the build before it |
| 16.1 | The order of work without the v1.2 baseline, switch and removal steps |
| 17 | The research report and the earlier design conversation leave the references |

- **The other plan documents:** Phase 1 to v1.7 (the `legacy/` row), Phase 3 to v1.5 (`source` loses legacy, and a sentence on today's engine goes) and Phase 4 to v1.3 (`engine` loses legacy), each based on master v1.8. The re-audit, a record merged into v1.6, stays v1.0: two phrases stop naming v1.2, and its status note says so.
- **README:** the reading order and versions, the research rows go, and the change log gains v1.8.
- **The repository's docs:** CLAUDE.md and the glossary say the current engine stays only until Phase 7 replaces it, and the glossary's listening terms describe Reevo 2; the roadmap drops the baseline; the step 2 spec stops naming Apex.

### Code and the harness

- `Cascade.h` goes back to how it was this morning: no rejection log in v1.2.
- The harness keeps what doesn't depend on an engine: the scorer and its 21 tests, the synthetic golden takes, and the WAV reader and writer. The replay runner, its tests and the golden baseline go; Reevo 2's runner arrives with its first stage, Phase 2's front end. `npm run harness:test` and `harness:score` stay; `harness:replay` and `harness:check` return with the runner.
- v1.2 itself is untouched until Phase 7.
- The harness guide, the Phase 0 spec and ADR 0004 say what slice 1 keeps and what waits for Reevo 2.

### With 1(b) instead

Also deleted now: v1.2's detection and calibration C++, the TurboModule's detection and calibration calls, the scenario gate, the Calibration screen and the diagnostics overlay; `App.tsx` opens the lesson screen directly. Kept: the iOS and Android mic input, the ring buffer and LiveKeys. The Xcode project, the Android CMake file, CI, the hooks (your OK, being in `.claude/`) and CLAUDE.md's checks change with it, and one Release build on the iPhone checks that the app starts and the keys still draw.

### With 1(c) instead

Only the Apex and Reevo material goes. Master v1.8 keeps v1.2's baseline and switch, and the harness stays as built.

## Tests and checks

- typecheck, lint, Jest (the same three render tests fail as before), `test:tooling` and the architecture check.
- With 1(a): the scenario gate stays at 46 of 46 after the revert; `npm run harness:test` runs the scorer's 21 tests and the WAV and golden-take tests.
- Every link in `documentation/` and `docs/` resolves. Outside this spec, which records the request, a search finds no file that names Apex, and "Reevo" always means Reevo 2.
- On the phone: nothing with 1(a) or 1(c); 1(b) needs one Release build.

## Results (4 November 2026)

| Check | Result |
| --- | --- |
| typecheck, lint | Pass |
| Jest | 126 of 129; the same three render tests fail as before |
| `npm run test:tooling` | 38 of 38 |
| Architecture check | Passes; the generated map drops the runner and lists the new harness test |
| The current engine's scenario gate | 46 of 46; `Cascade.h` is byte for byte as it was before Phase 0 |
| `npm run harness:test` | C++: 26 of 26. Python: 21 of 21 |
| Links | 31 documents, none broken |
| Search | Outside this spec, no file names Apex or the original Reevo |
| claude.ai project | Its copy of the comparison report is deleted |

Found while building:

- **The ladder take clipped.** Its ff strikes peaked at 1.26 of full scale, which the new no-clipping test caught. Every level is now two thirds as loud, so ff peaks at 0.84, under master 6.5's clip flag.
- **The glossary described the current engine.** Its listening terms named MPM pitch, 10 voices, two-strike calibration and a free or lesson mode. They now describe Reevo 2: 32 voices, profile v3 and the three modes; MPM is gone.
- **The `main` branch still holds the two Apex files**, in the engine's old folder, and the claude.ai project syncs `main`. They go when this branch is merged.

## Delivery

Commits on `claude/chore-setup`: the plan documents (master v1.8, the phase documents and the README), then the harness and the revert, then the repository's docs.
