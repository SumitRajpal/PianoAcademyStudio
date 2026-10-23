# Roadmap

Phases of the Claude setup ([DESIGN.md](claude-setup/DESIGN.md)) and open work. App features come from the owner's instructions; this file only tracks what has been agreed.

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
