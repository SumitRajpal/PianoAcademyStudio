---
name: spec
description: Starts a feature the owner's way. Writes a spec in docs/specs/, then a plan, gets the owner's approval, and only then builds. Use for /spec and before any change that touches more than one module.
argument-hint: "<feature name>"
---

# Feature spec → plan → approval → build

1. **Read first.** Run `/arch impact` and `/arch show` on the modules involved. Read their rules and the related docs (note-events.md for anything the mic touches; the motion libraries rule for anything that moves).
2. **Ask.** List every open question with options and a recommendation. Don't assume app details; the owner decides.
3. **Spec.** Copy `docs/specs/TEMPLATE.md` to `docs/specs/<kebab-case-name>.md` and fill it in for: $ARGUMENTS. For motion, also fill in a motion spec from `docs/motion/TEMPLATE.md`.
4. **Plan.** List the files to add or change, the tests to write first, the checks that prove it works (Jest, pixel renders, the engine gate, a Release build on the owner's iPhone), and what the owner must look at on the phone.
5. **Approval.** Show the spec and plan; build only after the owner says yes.
6. **Build.** Tests first for core logic. Keep `@purpose` headers and `docs/architecture/flows.md` true. Record decisions with `/adr`.
