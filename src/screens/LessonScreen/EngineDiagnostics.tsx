/**
 * The lesson's connection to the note engine, with an overlay for checking it
 * on the phone. Detected keys light the lesson keyboard through PianoMaster's
 * key sink, on the UI thread and without React renders. With
 * `showDiagnostics` it also shows a small tuner and timing overlay, and a
 * Calibrate button when `onCalibrate` is given.
 */

import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  usePianoKeySink,
  type NoteInput,
  type PianoState,
} from '../../motion/scenes/PianoMaster';
import {
  useCorePianoNotesDetection,
  type DetectedNoteEvent,
  type PianoProfile,
} from '@pianoacademy/core-engine';
import { noteName, parseNote } from '../../shared/piano';
import { ENGINE_DIAGNOSTICS_LOOK } from './engineDiagnosticsLook';
import { STATUS_MESSAGES } from './micStatusMessages';

export type EngineDiagnosticsProps = {
  /**
   * The shared piano state from usePianoState(). When passed, detected notes
   * press and release its keys on the UI thread, straight from the engine's
   * key table: no JS thread in between and no React re-render.
   */
  pianoState?: PianoState;

  /**
   * Expected notes for score-informed detection mode (MIDI numbers or names like ['C4', 'E4', 'G4']).
   * Filters out extraneous acoustic noise and semitone spillover.
   */
  expected?: readonly NoteInput[];

  /**
   * Enable polyphonic chord estimation (default: false).
   */
  polyphony?: boolean;

  /**
   * Whether to automatically start microphone capture on mount (default: true).
   */
  autoStart?: boolean;

  /**
   * Render real-time telemetry HUD overlay (latency, CPU microsecond budget, cents meter).
   */
  showDiagnostics?: boolean;

  /**
   * Optional callback fired when any note is confirmed or released.
   */
  onNoteDetected?: (event: DetectedNoteEvent) => void;

  /**
   * Optional callback fired when piano calibration completes.
   */
  onCalibrationComplete?: (profile: PianoProfile) => void;

  /** Shows a Calibrate button in the diagnostics that calls this (to open the calibration screen). */
  onCalibrate?: () => void;

  /**
   * Optional styling container for the diagnostic overlay.
   */
  style?: StyleProp<ViewStyle>;
};

export function EngineDiagnostics({
  pianoState,
  expected,
  polyphony,
  autoStart = true,
  showDiagnostics = false,
  onNoteDetected,
  onCalibrationComplete,
  onCalibrate,
  style,
}: EngineDiagnosticsProps) {
  // The engine speaks MIDI numbers; note names are resolved here, once per list.
  const expectedMidi = useMemo(
    () => (expected ? expected.map(note => parseNote(note)) : undefined),
    [expected],
  );
  const keySink = usePianoKeySink(pianoState);
  const { latestNote, stats, status, activeNotes, profile } =
    useCorePianoNotesDetection({
      keySink,
      expected: expectedMidi,
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

  const look = ENGINE_DIAGNOSTICS_LOOK;
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
              {isPresent && latestNote ? noteName(latestNote.midi) : '—'}
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
    backgroundColor: ENGINE_DIAGNOSTICS_LOOK.hud.backgroundColor,
    borderColor: ENGINE_DIAGNOSTICS_LOOK.hud.borderColor,
    borderWidth: ENGINE_DIAGNOSTICS_LOOK.hud.borderWidth,
    borderRadius: ENGINE_DIAGNOSTICS_LOOK.hud.borderRadius,
    paddingHorizontal: ENGINE_DIAGNOSTICS_LOOK.hud.paddingHorizontal,
    paddingVertical: ENGINE_DIAGNOSTICS_LOOK.hud.paddingVertical,
    alignItems: 'center',
    shadowColor: ENGINE_DIAGNOSTICS_LOOK.hud.shadowColor,
    shadowOpacity: ENGINE_DIAGNOSTICS_LOOK.hud.shadowOpacity,
    shadowRadius: ENGINE_DIAGNOSTICS_LOOK.hud.shadowRadius,
    shadowOffset: ENGINE_DIAGNOSTICS_LOOK.hud.shadowOffset,
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
    fontSize: ENGINE_DIAGNOSTICS_LOOK.typography.noteSize,
    fontWeight: '700',
    color: ENGINE_DIAGNOSTICS_LOOK.typography.textColor,
  },
  centsLabel: {
    fontSize: ENGINE_DIAGNOSTICS_LOOK.typography.centsSize,
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
    width: ENGINE_DIAGNOSTICS_LOOK.tuner.meterWidth,
    height: ENGINE_DIAGNOSTICS_LOOK.tuner.meterHeight,
    backgroundColor: ENGINE_DIAGNOSTICS_LOOK.tuner.meterBackground,
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
    fontSize: ENGINE_DIAGNOSTICS_LOOK.typography.statsSize,
    color: ENGINE_DIAGNOSTICS_LOOK.typography.mutedColor,
    fontFamily: 'Menlo',
  },
  statusText: {
    fontSize: ENGINE_DIAGNOSTICS_LOOK.typography.statsSize,
    color: ENGINE_DIAGNOSTICS_LOOK.tuner.sharpColor,
    fontWeight: '600',
    marginBottom: 4,
    maxWidth: 220,
    textAlign: 'center',
  },
});
