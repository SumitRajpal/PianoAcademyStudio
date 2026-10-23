# 0001. Claude Code setup: a generated architecture graph, enforced by hooks

- **Status:** Accepted
- **Date:** 2026-10-15; planes by role and the build finished 2026-10-23
- **Decided by:** the owner (questionnaire answers and follow-up choices in [docs/claude-setup/DESIGN.md](../claude-setup/DESIGN.md))

## Context

The owner wanted Claude to know the app's architecture at the start of every session, and to keep that knowledge true as the code changes. An architecture document that Claude updates by hand drifts. The app is real-time: audio detection and 120 fps motion have to stay off the JS thread.

## Options

1. A Markdown document that Claude maintains by following a skill (the FEArchitecture approach).
2. A graph generated from the code, with the meaning written by Claude, checked by hooks, git and CI.

## Decision

Option 2:

- A script builds `docs/architecture/graph.json` and `ARCHITECTURE.md` from the code.
- Claude writes the meaning: `@purpose` headers, `flows.md`, and the Conventions section.
- Hooks load the map at session start and block rule-breaking edits.
- Hooks check the work at the end of each turn, including the note engine's regression gate.
- husky and CI keep the graph committed and up to date.

On 2026-10-23 the owner chose to assign planes by role instead of by folder. The engine inside PianoMaster counts as audio, the LiveKeys table as sync, and the game scenes as motion. The thread rule judges the imported symbols, so a hook or component imported into UI-thread code breaks it, but a constant doesn't.

## Consequences

- Changes to `scripts/architecture/config.mjs` and `.claude/` need the owner's OK.
- Every module needs a purpose, and flows must match the code. The Stop hook and CI enforce both.
- The hooks need Node only, plus the TypeScript package already in the project.
