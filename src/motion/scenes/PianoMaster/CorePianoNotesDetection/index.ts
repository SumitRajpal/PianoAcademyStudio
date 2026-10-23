/**
 * @purpose Acoustic note detection: the C++ engine (mic, pitch, calibration) and its bridge to PianoMaster. Detected keys light CorePiano from a lock-free native key table read on the UI thread; JS listeners get every note in order; the calibration guide says what to play.
 * @thread ui
 */

export {
  CorePianoNotesDetection,
  STATUS_MESSAGES,
} from './CorePianoNotesDetection';
export {
  calibrationKeys,
  calibrationPrompt,
  classifyPianoType,
  describeKey,
  describeProfile,
  KEYBOARD_CHOICES,
  keyboardChoiceFor,
  type CalibrationFeedback,
  type CalibrationFlash,
  type CalibrationPrompt,
  type KeyboardChoice,
} from './calibrationGuide';
export {
  CORE_PIANO_NOTES_DETECTION_LOOK,
  type CorePianoNotesDetectionLook,
} from './corePianoNotesDetectionLook';
export {
  createLiveKeysReader,
  detectedKeyLevel,
  readLiveKeys,
  useLiveKeys,
  type LiveKeysReader,
} from './liveKeys';
export { mockAudioEngine } from './mockAudioEngine';
export { noteEventBus } from './noteEventBus';
export {
  clearPianoCalibration,
  getAudioStats,
  getLiveKeys,
  getPianoCalibrationProfile,
  isAudioMockActive,
  savePianoCalibration,
  setAudioExpectedNotes,
  setAudioPolyphony,
  startAudioDetector,
  startPianoCalibration,
  stopAudioDetector,
  stopPianoCalibration,
} from './pianoEngine';
export { CALIBRATION_STATE } from './types';
export type {
  AudioEngineStatus,
  CalibrationListener,
  CalibrationOptions,
  CalibrationProgressEvent,
  CalibrationStepEvent,
  CorePianoNotesDetectionProps,
  DetectedNoteEvent,
  DetectionStats,
  DetectionTelemetry,
  DetectorOptions,
  EngineStatus,
  LiveKey,
  LiveKeys,
  NoteEventListener,
  PianoProfile,
  StatsListener,
  StatusListener,
} from './types';
export {
  useCorePianoNotesDetection,
  type UseCorePianoNotesDetectionOptions,
} from './useCorePianoNotesDetection';
