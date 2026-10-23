---
name: adr
description: Records an architecture decision as a numbered ADR in docs/adr/ (a library choice, a structure, a rule, a trade-off). Use for /adr, and when the owner makes a decision that later work must follow.
argument-hint: "<short title>"
---

# Architecture decision record

1. Find the next number: the highest `docs/adr/NNNN-*.md`, plus one, padded to 4 digits.
2. Copy `docs/adr/TEMPLATE.md` to `docs/adr/NNNN-<kebab-case-title>.md` and fill it in for: $ARGUMENTS
3. Write it as a plain record: context, the options that were on the table, the decision, and what follows from it. Say who decided (normally the owner) and when.
4. Status is `Accepted` only when the owner decided. If you're proposing, use `Proposed` and ask.
5. If it replaces an older ADR, mark the old one `Superseded by NNNN` and link both ways.
6. If the decision changes a connection rule or plane, say so: `scripts/architecture/config.mjs` changes need the owner's OK.
