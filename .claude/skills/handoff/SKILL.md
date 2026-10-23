---
name: handoff
description: Writes a session handoff note to .claude/handoff/ so the next session knows what was done, what was decided and what's next. Use for /handoff, or when the owner says they're stopping for now.
disable-model-invocation: true
---

# Handoff note

The SessionEnd hook already writes an automatic note: changed files, the last check, anything still failing. This skill adds what only you know.

Write `.claude/handoff/<YYYY-MM-DD>T<HHMM>-summary.md` (local time; the latest file loads at the next session start), with:

```markdown
# Handoff <date> <time>

## Done
- what changed, and why, in the owner's terms

## Decided
- decisions the owner made this session (also record big ones with /adr)

## Open
- unfinished work, failing checks, questions waiting for the owner

## Next
- the first concrete step for the next session
```

Keep it short: about 20 lines. The note stays out of git (the repo is public), so mentioning local details is fine.
