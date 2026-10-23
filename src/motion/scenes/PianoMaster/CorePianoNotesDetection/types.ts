import type { StyleProp, ViewStyle } from 'react-native';
import type { NoteInput } from '../../../../shared/piano';
import type { PianoState } from '../shared/pianoState';

export type DetectedNoteEvent = {
  type: 'noteOn' | 'noteOff';
  midi: number;
  cents: number;
  velocity: number;
  /** Stream time: ms of audio analysed since the detector started. */
  tMs: number;
};

export type DetectionStats = {
  avgUs: number;
  maxUs: number;
  /** Hops whose analysis took longer than the hop lasts (5.33 ms). */
  lateHops: number;
  /** Hops skipped after a stall so latency cannot build up. */
  droppedHops: number;
};

export type EngineStatus = {
  state:
    | 'running'
    | 'stopped'
    | 'permissionPending'
    | 'permissionDenied'
    | 'interrupted'
    | 'error';
  message: string;
};

/** Calibration progress. `state` values are the CALIBRATION_STATE constants. */
export type CalibrationProgressEvent = {
  state: number;
  /** The key to play now. */
  currentMidi: number;
  keyIndex: number;
  totalKeys: number;
  /** The strike expected now: 1 (soft) or 2 (firm). */
  strikeNumber: number;
  /** The key the measurement fields describe, or -1. */
  measuredMidi: number;
  /** Wrong key: the key that was played instead, or -1. */
  detectedMidi: number;
  measuredFreqHz: number;
  centsOffset: number;
  strikeRmsDb: number;
  measuredB: number;
};

export const CALIBRATION_STATE = {
  tooShort: -3,
  notPiano: -2,
  wrongKey: -1,
  measuringNoise: 0,
  waitStrike1: 1,
  waitStrike2: 2,
  keyDone: 3,
  allDone: 4,
} as const;

export type CalibrationOptions = {
  /** false: anchors across the keyboard (~6-7 keys); true: also the middle octave (~16 keys). */
  fullMode: boolean;
  /** The user's keyboard. */
  lowestMidi: number;
  highestMidi: number;
};

export type PianoProfile = {
  isCalibrated: boolean;
  lowestMidi: number;
  highestMidi: number;
  a4ReferenceHz: number;
  ambientNoiseDb: number;
  calibratedGateDb: number;
  minVelocityDb: number;
  maxVelocityDb: number;
  meanInharmonicityB: number;
  /** The keys struck during calibration. */
  measuredKeys: readonly number[];
};

export type CalibrationStepEvent = CalibrationProgressEvent;

/**
 * The engine's live key table, read straight from native memory (a JSI host
 * object) by JS and by worklets on the UI thread. The analysis thread writes
 * it in O(1) per note, without locks, and no reader can slow it down. Indexed
 * by MIDI number (0-127), so it serves a keyboard of any size.
 */
export type LiveKeys = {
  /** Changes so far: unchanged means nothing to do. */
  readonly version: number;
  /**
   * The keys changed after version `since`, flattened:
   * [version, midi, down, velocity, struck, midi, down, velocity, struck, ...]
   * `down` and `struck` are 1 or 0. `struck`: the key was struck among those
   * changes, even if it is up again by now. `version` is the one to pass next
   * time. since < 0: every key that is down now. null when a key was being
   * written at that instant: ask again next frame.
   */
  changes(since: number): number[] | null;
  /** One key, O(1). null when it was being written at that instant. */
  key(midi: number): LiveKey | null;
  /** Whether a key is down: O(1), one atomic read, never null. */
  isDown(midi: number): boolean;
};

export type LiveKey = {
  midi: number;
  down: boolean;
  /** Of the last strike; kept after the release. */
  velocity: number;
  /** Of the last strike. */
  cents: number;
  /** Stream time of the last change (strike or release). */
  tMs: number;
  /** Strikes so far: a new value means the key was struck again. */
  strikes: number;
};

export type NoteEventListener = (event: DetectedNoteEvent) => void;
export type StatsListener = (stats: DetectionStats) => void;
export type CalibrationListener = (event: CalibrationProgressEvent) => void;
export type StatusListener = (status: EngineStatus) => void;

export type DetectorOptions = {
  /** Optional subset of expected MIDI notes for score-informed detection mode */
  expected?: readonly NoteInput[];
  /** Enable blind polyphonic chord estimation (default: false) */
  polyphony?: boolean;
};

export type AudioEngineStatus = {
  running: boolean;
  isMock: boolean;
  isCalibrating?: boolean;
};

export type CorePianoNotesDetectionProps = {
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

export type DetectionTelemetry = DetectionStats & {
  lastMidi: number | null;
  lastNoteName: string | null;
  lastCents: number;
  activeCount: number;
  profile?: PianoProfile | null;
};
