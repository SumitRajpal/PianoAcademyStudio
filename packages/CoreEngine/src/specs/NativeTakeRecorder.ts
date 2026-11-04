import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** The phone and its audio route, as iOS reports them when asked. */
export type TakeDevice = {
  /** The model identifier, such as "iPhone14,3". */
  model: string;
  systemVersion: string;
  /** The microphone in use: its port name and type, and its data source (such as "Bottom"). */
  inputPort: string;
  inputPortType: string;
  inputDataSource: string;
  hardwareSampleRate: number;
  ioBufferMs: number;
  inputLatencyMs: number;
};

/** A take in progress, five times a second. */
export type TakeStatus = {
  /** A take is open. */
  recording: boolean;
  /** Samples are being accepted (false once interrupted). */
  capturing: boolean;
  id: string;
  samples: number;
  peakDbfs: number;
  clippedSamples: number;
  droppedSamples: number;
  /** "", "interrupted", "route", "background", "write-error" or "too-long". */
  stopReason: string;
};

/** A closed take's counts, for its meta.json. */
export type TakeStats = {
  id: string;
  samples: number;
  durationSec: number;
  peakDbfs: number;
  clippedSamples: number;
  droppedSamples: number;
  /** Where samples were lost: sample positions in the file, and how many each time. */
  gapPositions: ReadonlyArray<number>;
  gapLengths: ReadonlyArray<number>;
  stopReason: string;
};

/** A take folder on the phone. */
export type StoredTake = {
  id: string;
  /** The size of audio.wav. */
  bytes: number;
  /** meta.json's text, or "" when it has none. */
  meta: string;
};

export interface Spec extends TurboModule {
  /** The folder that holds the takes (Documents/Takes, shared with the Files app). */
  takesFolder(): string;
  freeSpaceBytes(): number;
  device(): TakeDevice;
  /** Opens Takes/<id>/audio.wav and starts recording what the microphone capture hands the engine. */
  startTake(id: string): boolean;
  /** Closes the take and returns its counts. */
  stopTake(): TakeStats;
  getTakeStatus(): TakeStatus;
  /** Writes Takes/<id>/meta.json. */
  saveTakeMeta(id: string, json: string): boolean;
  /** Newest first. */
  listTakes(): ReadonlyArray<StoredTake>;
  deleteTake(id: string): boolean;
}

// Optional: Android, where the module isn't registered yet, runs without it.
export default TurboModuleRegistry.get<Spec>('NativeTakeRecorder');
