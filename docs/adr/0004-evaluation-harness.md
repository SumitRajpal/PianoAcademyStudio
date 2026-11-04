# 0004. The evaluation harness: a C++ replay runner, a scorer, recordings outside git

- **Status:** Accepted; amended 2026-11-04
- **Date:** 2026-11-04
- **Decided by:** the owner, approving the [Phase 0 harness spec](../specs/phase-0-harness.md) on 2026-11-04, and the same day choosing to follow Reevo 2 only ([spec](../specs/reevo-2-only.md))

## Context

Master section 5 makes measurement come first: a labelled corpus, a desktop harness that replays it through the engine deterministically, and a scorer for the 5.1 metrics with confidence intervals. The engine is C++ in `packages/CoreEngine`. The repository is public, and the recordings will be hours of 48 kHz audio from your rooms.

## Options

1. **Runner:** C++ that drives the engine's own code hop by hop, beside the engine (`packages/CoreEngine/tools/`); or Python bindings first (master 14.3). The C++ runner needs no binding work; the bindings come with the neural lane.
2. **Scorer:** Python with numpy and mir\_eval; TypeScript on Node; or C++.
3. **Recordings:** a folder outside the repository (`PIANO_CORPUS`), with short synthetic golden takes in git; Git LFS in the public repository; or a private cloud folder.

## Decision

The C++ runner, the Python scorer with mir\_eval, and recordings outside git. The synthetic golden takes are rendered on demand; once the runner exists, only their report is committed.

## Amendment (2026-11-04)

The runner was first built for the app's current engine, with a rejection log in its cascade and a recorded baseline. When the owner chose to follow Reevo 2 only, those were removed. The runner returns with Reevo 2's first stage, built the same way.

## Consequences

- Developing the harness needs Python 3 with numpy and mir\_eval, installed from a pinned `requirements.txt`.
- No recording of a room ever enters the public repository; a harness run names the corpus folder.
- Until Reevo 2's first stage exists, the harness can score runs but cannot make them.
