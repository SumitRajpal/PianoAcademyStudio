import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type PianoNoteEvent = {
  type: 'noteOn' | 'noteOff';
  midi: number;
  cents: number;
  velocity: number;
  /** Stream time: ms of audio analysed since startDetector() (excludes the device's input latency). */
  tMs: number;
};

export type EngineStats = {
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

export type CalibrationOptions = {
  /** false: split-scale anchors (~6-7 keys); true: also the chromatic middle octave. */
  fullMode: boolean;
  /** The user's keyboard, lowest and highest MIDI note. */
  lowestMidi: number;
  highestMidi: number;
};

export type CalibrationProgressEvent = {
  /** -3 too short, -2 not a piano, -1 wrong key, 0 stay quiet, 1 strike 1, 2 strike 2, 3 key done, 4 all done. */
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
  measuredKeys: ReadonlyArray<number>;
};

export interface Spec extends TurboModule {
  startDetector(): boolean;
  stopDetector(): void;
  setExpectedNotes(midiNotes: ReadonlyArray<number>): void;
  setPolyphony(enabled: boolean): void;
  getEngineStats(): EngineStats;
  /** Every note, in order. Notes are batched: JS is woken at most once at a time, never once per note. */
  onPianoEvent(callback: (event: PianoNoteEvent) => void): void;
  /**
   * The engine's key table (a JSI host object, see LiveKeys in ../types.ts):
   * readable from JS and from worklets on the UI thread, O(1) per key.
   */
  getLiveKeys(): CodegenTypes.UnsafeObject;
  onEngineStatus(callback: (status: EngineStatus) => void): void;
  startCalibration(options: CalibrationOptions): boolean;
  stopCalibration(): void;
  /** The saved profile is loaded at startup; this returns the current one. */
  getCalibrationProfile(): PianoProfile;
  /** Saves the profile of the calibration that just finished. False if there is none or writing failed. */
  saveCalibrationProfile(): boolean;
  /** Forgets the calibration and deletes the saved file. */
  clearCalibrationProfile(): void;
  onCalibrationEvent(callback: (event: CalibrationProgressEvent) => void): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePianoEngine');
