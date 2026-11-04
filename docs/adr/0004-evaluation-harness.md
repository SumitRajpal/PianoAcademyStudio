# 0004. The evaluation harness: a C++ replay runner, a scorer, recordings outside git

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decided by:** the owner, approving the [Phase 0 harness spec](../specs/phase-0-harness.md) on 2026-11-04

## Context

Master section 5 makes measurement come first: a labelled corpus, a desktop harness that replays it through any engine deterministically, a scorer for the 5.1 metrics with confidence intervals, and v1.2's rejection log and baseline. The engine is C++ in `packages/CoreEngine`. The repository is public, and the recordings will be hours of 48 kHz audio from your rooms.

## Options

1. **Runner:** C++ that drives the engine's own code hop by hop, beside the engine (`packages/CoreEngine/tools/`); or Python bindings first (master 14.3). The C++ runner reuses the scenario suite's driver and needs no binding work; the bindings come with the neural lane.
2. **Scorer:** Python with numpy and mir\_eval; TypeScript on Node; or C++.
3. **Recordings:** a folder outside the repository (`PIANO_CORPUS`), with short synthetic golden takes in git; Git LFS in the public repository; or a private cloud folder.

## Decision

The C++ runner, the Python scorer with mir\_eval, and recordings outside git; the synthetic golden takes are rendered on demand, and only their baseline report is committed.

## Consequences

- Developing the harness needs Python 3 with numpy and mir\_eval, installed from a pinned `requirements.txt`.
- No recording of a room ever enters the public repository; a harness run names the corpus folder.
- The scenario suite's driver and the runner share one way of feeding audio, so a replay matches the tests and the phone.
