# Roadmap

Phases of the Claude setup ([DESIGN.md](claude-setup/DESIGN.md)) and the app's implementation lanes. App features come from the owner's instructions; this file only tracks what has been agreed.

## Implementation (from 2026-11-04)

The plan lives in [documentation/](../documentation/README.md): the engine master v1.6 and the five UI phases. On 4 November 2026 the owner chose the order: reshape the repository first (lane A, steps 1 and 2), then build the engine's Phase 0 harness (lane B). The master's own order of work is its section 16.1.

### Lane A: reshape the repository (UI Phase 1, migration plan)

- [ ] Step 1: untangle in place. [Spec](specs/migration-step-1-untangle-in-place.md) and [ADR 0002](adr/0002-engine-output-through-sinks.md); built on 2026-11-04, waiting for the owner's iPhone check
- [ ] Step 2: move the engine into `packages/CoreEngine/`; the bindings move to Nitro once Phase 3's spike passes on the iPhone. [Spec](specs/migration-step-2-move-the-engine.md) and [ADR 0003](adr/0003-core-engine-workspace-package.md); built on 2026-11-04, waiting for the owner's iPhone check (one build covers steps 1 and 2)
- [ ] Step 3: build the layers: PianoStage, LessonKit, the route folders, navigation
- [ ] Step 4: rules and docs: Phase 1's rules in `config.mjs`, flows, glossary, CLAUDE.md

### Lane B: the Reevo 2 DSP engine (master sections 5–13)

- [ ] Phase 0: recording rig, corpus and ground truth, metrics, the desktop harness, the v1.2 rejection log and baseline (master 5). [Spec](specs/phase-0-harness.md), [ADR 0004](adr/0004-evaluation-harness.md) and [guide](harness.md). Slice 1 (runner, scorer, rejection log, synthetic takes) built on 2026-11-04; next: slice 2, the app's developer recording mode, then slice 3, the PSR-E343 rig and your recordings
- [ ] Phase 1: capture hardening, in parallel (6)
- [ ] Phases 2–5: front end, calibration engine, evidence and decisions, offline through the harness, then live (7–10). Calibration follows its own build order (8.13)
- [ ] Phase 6: modes: learning, then practice with Jingle Bells, then free play (11)
- [ ] Phase 7: integration beside the legacy v1.2 engine (12)
- [ ] Phase 8: the release gate; DSP becomes the default and v1.2 is removed (13)

### Lane C: the neural engine (master section 14)

- [ ] N1–N11, from when Phase 2's features and the Phase 0 rig exist. Personal or paid use is settled before N2 (master 16.3)

### Lane D: the app (UI Phases 2–5)

- [ ] App flow, engine-to-UI structures, lesson internals, and the visual and motion design, built on lane A's layers after step 3

## Phase 1: Claude setup machinery (built 2026-10-23)

- [x] Architecture graph, checks, `/arch` queries; planes by role
- [x] CLAUDE.md, path rules (ios, android, tests, game art), skills (`/arch`, `/handoff`, `/adr`, `/spec`)
- [x] Hooks for the whole session, permissions, status line
- [x] Docs: ADRs, spec and motion templates, glossary, troubleshooting
- [x] Git hooks (husky + lint-staged, Conventional Commits) and CI checks
- [x] `gh` installed and logged in
- [ ] Outside the repo: move the user-level FEArchitecture skill into the mooKIT repo (waiting for the owner: where they launch Claude for mooKIT)

## Phase 2: after the owner's app details

- [ ] Specialist agents (audio, motion, sync, iOS, test, visual review, performance, code review); models chosen after the billing question (E2)
- [ ] ADR for the motion library rule (Skia + Reanimated for piano motion, Rive for the rest)
- [ ] Motion settings file: Reduce Motion follows the phone, with an in-app override (owner's decision)
- [ ] Device behaviour: hold 120 Hz, keep the screen awake, orientation lock (waiting for the owner's instructions)
- [ ] Motion checks: contact sheets from the phone, sync reports, frame-drop budgets
- [ ] Plugins and integrations (D2)

## Phase 3: later

- [ ] Parallel worktrees, scheduled architecture audits, the setup packaged as a plugin, release pipelines
