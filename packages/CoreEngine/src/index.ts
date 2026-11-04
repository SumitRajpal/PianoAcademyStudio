/**
 * @purpose Acoustic note detection: the C++ engine (mic, pitch, calibration) and its TypeScript side, and the take recorder that saves what the mic hears for the evaluation harness. Detected keys go to the key sink the screen hands over, from a lock-free native key table read on the UI thread; JS listeners get every note in order. It speaks MIDI numbers and imports nothing from the app.
 */

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
export {
  takeRecorder,
  type StoredTake,
  type TakeDevice,
  type TakeStats,
  type TakeStatus,
} from './takeRecorder';
export type {
  AudioEngineStatus,
  CalibrationListener,
  CalibrationOptions,
  CalibrationProgressEvent,
  CalibrationStepEvent,
  DetectedNoteEvent,
  DetectionStats,
  DetectionTelemetry,
  DetectorOptions,
  EngineStatus,
  KeySink,
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
