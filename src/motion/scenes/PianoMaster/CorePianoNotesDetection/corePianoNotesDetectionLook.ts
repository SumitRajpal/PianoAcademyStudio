/**
 * How a key the engine detects lights on the keyboard. The key-table reader
 * (liveKeys.ts) uses both numbers every frame. They are display choices, so
 * they move to PianoStage with the per-frame wiring (migration step 3).
 */

export const CORE_PIANO_NOTES_DETECTION_LOOK = {
  /** Detected keys on CorePiano. */
  keys: {
    /** Light level of the softest strike, so every detected key shows clearly (the hardest is 1). */
    softestLevel: 0.55,
    /** A key struck and released before it could be drawn stays lit this long (ms). */
    shortestLitMs: 120,
  },
} as const;

export type CorePianoNotesDetectionLook =
  typeof CORE_PIANO_NOTES_DETECTION_LOOK;
