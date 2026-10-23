---
paths:
  - "**/__tests__/**"
  - "**/*.test.*"
  - "scripts/design/**"
  - "src/**/test/**"
---

# Tests

- **App code:** Jest (`npm test`). `jest/skiaEnvironment.js` loads CanvasKit, so Skia drawing renders headless. Pixel checks of looks live next to the component (`__tests__/`); whole-screen renders live in `scripts/design/__tests__/`.
- **Tooling** (`.mjs` in `scripts/` and `.claude/hooks/`): Node's built-in runner, `npm run test:tooling`.
- **The note engine (C++):** `src/motion/scenes/PianoMaster/CorePianoNotesDetection/test/run.sh`.
  - `scenarios` is the regression gate for every engine change.
  - `engine` runs the threads and the live key table under ThreadSanitizer, for any threading change.
  - Synthetic audio comes from `test/PianoSynth.h`, and `harsh` gives a harsher synth.
  - Add a scenario for every engine bug you fix.
- Write tests first for core logic: detection, timing, scoring, motion drivers. Lighter tests for screens.
- Keep tests deterministic: pass time in explicitly instead of using real timers. Motion worklets are pure functions of time, so test them at chosen moments.
- A real piano isn't available to Claude. Say what the synthetic tests cover, and ask the owner to try it on the phone.
