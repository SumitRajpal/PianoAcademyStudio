/**
 * Visual tokens for the engine diagnostics overlay: the card, the tuner
 * indicator and the text.
 */

export const ENGINE_DIAGNOSTICS_LOOK = {
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
  typography: {
    noteSize: 20,
    centsSize: 11,
    statsSize: 10,
    textColor: '#1A1A1A',
    mutedColor: '#7F8C8D',
  },
} as const;

export type EngineDiagnosticsLook = typeof ENGINE_DIAGNOSTICS_LOOK;
