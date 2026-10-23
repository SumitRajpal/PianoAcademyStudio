import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CORE_PIANO_NOTES_DETECTION_LOOK } from './corePianoNotesDetectionLook';
import type { CorePianoNotesDetectionProps, EngineStatus } from './types';
import { useCorePianoNotesDetection } from './useCorePianoNotesDetection';

/** Microphone problems the user can fix, in their words. */
export const STATUS_MESSAGES: Partial<Record<EngineStatus['state'], string>> = {
  permissionPending: 'Waiting for microphone permission…',
  permissionDenied: 'Microphone access is off. Turn it on in Settings.',
  interrupted: 'Listening paused by another app or a call.',
  error: 'The microphone could not start.',
};

/**
 * Connects the note engine to the PianoMaster scene: detected keys light on
 * CorePiano through `pianoState` (on the UI thread, without React renders).
 * With `showDiagnostics` it also shows a small tuner and timing overlay, and
 * a Calibrate button when `onCalibrate` is given.
 */
export function CorePianoNotesDetection({
  pianoState,
  expected,
  polyphony,
  autoStart = true,
  showDiagnostics = false,
  onNoteDetected,
  onCalibrationComplete,
  onCalibrate,
  style,
}: CorePianoNotesDetectionProps) {
  const { latestNote, stats, status, activeNotes, profile } =
    useCorePianoNotesDetection({
      pianoState,
      expected,
      polyphony,
      autoStart,
      // Timing stats only while the diagnostics are on screen.
      statsIntervalMs: showDiagnostics ? 1000 : 0,
      onNoteDetected,
      onCalibrationComplete,
    });

  if (!showDiagnostics) {
    return null;
  }

  const look = CORE_PIANO_NOTES_DETECTION_LOOK;
  const isPresent = latestNote !== null && activeNotes.size > 0;
  const cents = latestNote?.cents ?? 0;
  const isInTune = Math.abs(cents) <= look.tuner.toleranceCents;
  const isFlat = cents < -look.tuner.toleranceCents;

  const needleColor = isInTune
    ? look.tuner.inTuneColor
    : isFlat
    ? look.tuner.flatColor
    : look.tuner.sharpColor;

  const needleOffset = Math.max(-50, Math.min(50, cents));

  return (
    <View style={[styles.hudContainer, style]} pointerEvents="box-none">
      <View style={styles.hudCard}>
        <View style={styles.topRow}>
          <View style={styles.noteRow}>
            <Text style={styles.noteLabel}>
              {isPresent ? latestNote?.name : '—'}
            </Text>
            <Text style={[styles.centsLabel, { color: needleColor }]}>
              {isPresent
                ? `${cents > 0 ? '+' : ''}${Math.round(cents)}¢`
                : '0¢'}
            </Text>
          </View>

          {onCalibrate ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.calBtn,
                profile?.isCalibrated && styles.calBtnDone,
              ]}
              onPress={onCalibrate}
            >
              <Text style={styles.calBtnText}>
                {profile?.isCalibrated ? '✓ Calibrated' : 'Calibrate'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Cents deviation meter */}
        <View style={styles.meterTrack}>
          <View
            style={[
              styles.needle,
              {
                backgroundColor: needleColor,
                transform: [
                  {
                    translateX:
                      (needleOffset / 50) * (look.tuner.meterWidth / 2),
                  },
                ],
              },
            ]}
          />
        </View>

        {/* Microphone problems the user can fix */}
        {STATUS_MESSAGES[status.state] ? (
          <Text style={styles.statusText}>
            {status.message || STATUS_MESSAGES[status.state]}
          </Text>
        ) : null}

        {/* Telemetry info */}
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            DSP: {stats.avgUs.toFixed(1)}µs | Max: {stats.maxUs.toFixed(0)}µs |
            Late: {stats.lateHops} | Skipped: {stats.droppedHops}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hudContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 999,
  },
  hudCard: {
    backgroundColor: CORE_PIANO_NOTES_DETECTION_LOOK.hud.backgroundColor,
    borderColor: CORE_PIANO_NOTES_DETECTION_LOOK.hud.borderColor,
    borderWidth: CORE_PIANO_NOTES_DETECTION_LOOK.hud.borderWidth,
    borderRadius: CORE_PIANO_NOTES_DETECTION_LOOK.hud.borderRadius,
    paddingHorizontal: CORE_PIANO_NOTES_DETECTION_LOOK.hud.paddingHorizontal,
    paddingVertical: CORE_PIANO_NOTES_DETECTION_LOOK.hud.paddingVertical,
    alignItems: 'center',
    shadowColor: CORE_PIANO_NOTES_DETECTION_LOOK.hud.shadowColor,
    shadowOpacity: CORE_PIANO_NOTES_DETECTION_LOOK.hud.shadowOpacity,
    shadowRadius: CORE_PIANO_NOTES_DETECTION_LOOK.hud.shadowRadius,
    shadowOffset: CORE_PIANO_NOTES_DETECTION_LOOK.hud.shadowOffset,
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  noteLabel: {
    fontSize: CORE_PIANO_NOTES_DETECTION_LOOK.typography.noteSize,
    fontWeight: '700',
    color: CORE_PIANO_NOTES_DETECTION_LOOK.typography.textColor,
  },
  centsLabel: {
    fontSize: CORE_PIANO_NOTES_DETECTION_LOOK.typography.centsSize,
    fontWeight: '600',
  },
  calBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  calBtnDone: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
  },
  calBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  meterTrack: {
    width: CORE_PIANO_NOTES_DETECTION_LOOK.tuner.meterWidth,
    height: CORE_PIANO_NOTES_DETECTION_LOOK.tuner.meterHeight,
    backgroundColor: CORE_PIANO_NOTES_DETECTION_LOOK.tuner.meterBackground,
    borderRadius: 2,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needle: {
    width: 6,
    height: 10,
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statsText: {
    fontSize: CORE_PIANO_NOTES_DETECTION_LOOK.typography.statsSize,
    color: CORE_PIANO_NOTES_DETECTION_LOOK.typography.mutedColor,
    fontFamily: 'Menlo',
  },
  statusText: {
    fontSize: CORE_PIANO_NOTES_DETECTION_LOOK.typography.statsSize,
    color: CORE_PIANO_NOTES_DETECTION_LOOK.tuner.sharpColor,
    fontWeight: '600',
    marginBottom: 4,
    maxWidth: 220,
    textAlign: 'center',
  },
});
