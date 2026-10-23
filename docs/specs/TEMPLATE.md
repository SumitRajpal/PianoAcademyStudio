# Feature: name

- **Status:** Draft | Approved | Built
- **Owner's request:** what was asked, in their words, with the date

## Goal

What the player or learner gets, in one or two sentences.

## Behaviour

- What happens, step by step, including what the mic hears and what moves on screen.
- Edge cases: no mic permission, interruption, wrong note, very soft or loud playing, a locked or slow phone.

## Questions for the owner

1. Question, with options and a recommendation.

## Design

- **Modules touched** (from `/arch impact`), and any new modules with their plane and thread.
- **Data flow**, as it will appear in `docs/architecture/flows.md`.
- **Hot path:** confirm the JS thread stays out of note → screen.
- **Motion:** link the motion spec in `docs/motion/`.

## Tests and checks

- Tests written first (core logic), pixel renders, engine scenarios.
- What the owner checks on the phone (Release build for frame rate).
