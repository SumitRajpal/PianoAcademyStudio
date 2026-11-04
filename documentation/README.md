# Plan documents

Every plan document for Piano Academy Studio lives in this folder: the Reevo 2 engine master, the reviews merged into it, and the five UI implementation phases. It is the one home for them from 4 November 2026. The Claude Docs and claude.ai project copies they came from are retired; when a copy and this folder disagree, this folder wins.

## Reading order

| # | File | Document | Version | Status |
| --- | --- | --- | --- | --- |
| 1 | [01-engine-master-plan.md](01-engine-master-plan.md) | Reevo 2(V1) — Piano Detection Engine: End-to-End Implementation Plan (the master) | v1.5 | The plan everything builds on |
| 2 | [02-engine-re-audit.md](02-engine-re-audit.md) | Reevo 2 Engine Re-Audit: Maths, Capabilities and Cases | v1.0, based on master v1.5 | Not merged yet |
| 3 | [03-calibration-engine.md](03-calibration-engine.md) | Reevo 2 Calibration Engine | v1.0, based on master v1.5 | Not merged yet |
| 4 | [04-ui-phase-1-structure.md](04-ui-phase-1-structure.md) | UI Implementation Plan — Phase 1: Structure | v1.5, based on master v1.4 | Merged into master v1.2–v1.5 |
| 5 | [05-ui-phase-2-app-flow.md](05-ui-phase-2-app-flow.md) | UI Implementation Plan — Phase 2: App flow | v1.2, based on master v1.3 | Merged into master v1.2 |
| 6 | [06-ui-phase-3-engine-to-ui.md](06-ui-phase-3-engine-to-ui.md) | UI Implementation Plan — Phase 3: Engine to UI communication | v1.3, based on master v1.4 | Merged into master v1.2 and v1.5 |
| 7 | [07-ui-phase-4-lesson-internals.md](07-ui-phase-4-lesson-internals.md) | UI Implementation Plan — Phase 4: Lesson internals | v1.2, based on master v1.4 | Merged into master v1.3 and v1.5 |
| 8 | [08-ui-phase-5-visual-motion.md](08-ui-phase-5-visual-motion.md) | UI Implementation Plan — Phase 5: Visual and motion design | v1.0, based on master v1.3 | Merged into master v1.4 |

Background and working files:

| File | What it is |
| --- | --- |
| [research/engine-comparison-report.md](research/engine-comparison-report.md) | The research report that started Reevo 2: Apex v1, Apex v2 and Reevo compared, the 26 cases audited, a maths-first design |
| [bench/audit_calcs.py](bench/audit_calcs.py) | Re-derives every number in the engine re-audit. `python3 audit_calcs.py`, about a minute |
| [bench/calibration_calcs.py](bench/calibration_calcs.py) | Re-derives every number in the calibration engine. `python3 calibration_calcs.py`, a few minutes |

Both scripts need numpy and scipy, use fixed seeds, and reproduce the numbers their documents quote.

## Links inside the documents

The documents still link to their old claude.ai addresses. Each one maps to a file here:

| Old link | File |
| --- | --- |
| claude.ai/artifact/FHiwgewYvGVz3CX6KBbjWH | 01-engine-master-plan.md |
| claude.ai/artifact/ECKQ3VBdurxDwTsogGotuo | 02-engine-re-audit.md |
| claude.ai/artifact/KfKcSTTkcFL2nkBQGTzJJG | 03-calibration-engine.md |
| claude.ai/artifact/KZJ7B9hdt1JBTQnBrSUdGX | 04-ui-phase-1-structure.md |
| claude.ai/artifact/7cWZX9oLsfPML9rmjFWjic | 05-ui-phase-2-app-flow.md |
| claude.ai/artifact/XSQ9Tp8uiaZzkcAaf8iqGQ | 06-ui-phase-3-engine-to-ui.md |
| claude.ai/artifact/VsvkoSWSWpojhjb9AmHiJg | 07-ui-phase-4-lesson-internals.md |
| claude.ai/artifact/Wm4YFa1Nv93oVfAByzo3zQ | 08-ui-phase-5-visual-motion.md |

The Docs versions held diagrams that Markdown cannot carry. Each one left a line that starts `[embedded content: …]`, naming what it showed; the tables and text around it carry the same facts.

## Versioning rules

Agreed with Sumit on 22 October 2026; the home of the master moved to this folder on 4 November 2026. Nothing else changed.

**The master document**

- The master is [01-engine-master-plan.md](01-engine-master-plan.md). There is no second copy.
- Its version is tracked in the change log below, not inside the master itself.

**When the master is updated**

- After every major change to the architecture or the engine.
- Before any update, Claude asks: "Shall I update the master document?" It updates only after a yes.

**Versions for every new document**

- Every new document carries its own version (v1.0, v1.1, …) and names the master version it builds on, for example "Echo canceller design note v1.0 (based on master v1.1)".
- It ends with a "Merge into master" list: every master section it changes, and how.
- It joins this folder with the next free number, and its row goes in the reading order above.

**Merging, after a yes**

- Apply the changes to the master and to any phase document they touch.
- Raise the master's version here: a minor step for a merged update (v1.1 to v1.2), a major step for an architecture restructure (v2.0).
- Add a row to the change log below, in the same commit as the change.

**Set aside**

- The Two-Octave Strategy Audit v1.0 (28 October 2026) was set aside on 4 November 2026. It is not part of the plan, and nothing from it is merged. The calibration engine still names it as one of its sources; read those mentions as history.

## Master change log

| Version | Date | Source | Sections changed |
| --- | --- | --- | --- |
| v1.0 | 22 Oct 2026 | Original end-to-end plan | All 17 sections |
| v1.1 | 22 Oct 2026 | Review of five mathematical critiques | 1, 2.4, 2.8, 2.10, 3.2, 4, 5.2, 6.6, 7.4, 8.6, 8.9, 8.11, 9.3–9.11, 10.4, 10.5, 11.3, 11.5, 13.2, 13.4, 14.4, 14.6, 14.9, 15, 16.2, 17 |
| v1.2 | 28 Oct 2026 | UI Implementation Plan: Phase 1 Structure v1.2, Phase 2 App flow v1.0, Phase 3 Engine to UI communication v1.0 | 1, 3.1, 3.2, 3.3, 4, 6.2, 6.4, 6.7, 8.1, 8.11, 8.12, 10.7, 11.1, 11.2, 11.4, 11.5, 12 (intro), 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 16.3, 17 |
| v1.3 | 28 Oct 2026 | UI Implementation Plan: Phase 4 Lesson internals v1.0 | 3.2, 4, 6.2, 11.1, 11.2, 11.5, 12.1, 12.2, 16.3, 17 |
| v1.4 | 28 Oct 2026 | UI Implementation Plan: Phase 5 Visual and motion design v1.0 | 4, 12.3, 17 |
| v1.5 | 28 Oct 2026 | UI Implementation Plan: Phase 4 Lesson internals v1.2 (the backing is a FLAC decoded by react-native-audio-api; the engine still plays it) | 6.1, 11.2, 12.1, 17 |
