/**
 * Visual tokens for acoustic note detection feedback, tuner indicators, and diagnostic HUD.
 */

export const CORE_PIANO_NOTES_DETECTION_LOOK = {
  hud: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderWidth: 1,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tuner: {
    inTuneColor: '#2EB872', // Crisp mint green
    flatColor: '#3498DB', // Sky blue
    sharpColor: '#E74C3C', // Warm coral blush
    meterWidth: 120,
    meterHeight: 4,
    meterBackground: 'rgba(0, 0, 0, 0.06)',
    toleranceCents: 5, // Notes within +/- 5 cents are considered perfectly in tune
  },
  /** Detected keys on CorePiano. */
  keys: {
    /** Light level of the softest strike, so every detected key shows clearly (the hardest is 1). */
    softestLevel: 0.55,
    /** A key struck and released before it could be drawn stays lit this long (ms). */
    shortestLitMs: 120,
  },
  typography: {
    noteSize: 20,
    centsSize: 11,
    statsSize: 10,
    textColor: '#1A1A1A',
    mutedColor: '#7F8C8D',
  },
} as const;

export type CorePianoNotesDetectionLook =
  typeof CORE_PIANO_NOTES_DETECTION_LOOK;
