/**
 * The engine's events on the JS thread, for any number of listeners.
 *
 * Notes arrive in batches (the engine wakes JS at most once at a time) and in
 * order. A listener for one key (subscribeKey) costs nothing for the other
 * keys' notes: a note reaches only the listeners of its own key plus those of
 * every note. A component that only needs "is C4 down?" should not listen at
 * all: it reads the key table (getLiveKeys().isDown(60)) in O(1) when it
 * needs to. Key lights never come through here: the UI thread reads the key
 * table directly (see liveKeys.ts).
 */

import type {
  CalibrationListener,
  CalibrationProgressEvent,
  DetectedNoteEvent,
  DetectionStats,
  EngineStatus,
  NoteEventListener,
  StatsListener,
  StatusListener,
} from './types';

const EMPTY_STATS: DetectionStats = {
  avgUs: 0,
  maxUs: 0,
  lateHops: 0,
  droppedHops: 0,
};
const STOPPED: EngineStatus = { state: 'stopped', message: '' };

const KEY_COUNT = 128;

class NoteEventBus {
  private noteListeners = new Set<NoteEventListener>();
  private keyListeners: (Set<NoteEventListener> | undefined)[] = new Array(
    KEY_COUNT,
  );
  private statsListeners = new Set<StatsListener>();
  private calibrationListeners = new Set<CalibrationListener>();
  private statusListeners = new Set<StatusListener>();
  private latestStats: DetectionStats = EMPTY_STATS;
  private latestStatus: EngineStatus = STOPPED;

  subscribeNote(listener: NoteEventListener): () => void {
    this.noteListeners.add(listener);
    return () => {
      this.noteListeners.delete(listener);
    };
  }

  /** Notes of one key only (MIDI 0-127). */
  subscribeKey(midi: number, listener: NoteEventListener): () => void {
    if (!Number.isInteger(midi) || midi < 0 || midi >= KEY_COUNT) {
      throw new RangeError(`subscribeKey: ${midi} is not a MIDI note`);
    }
    const listeners = (this.keyListeners[midi] ??= new Set());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  subscribeStats(listener: StatsListener): () => void {
    this.statsListeners.add(listener);
    return () => {
      this.statsListeners.delete(listener);
    };
  }

  subscribeCalibration(listener: CalibrationListener): () => void {
    this.calibrationListeners.add(listener);
    return () => {
      this.calibrationListeners.delete(listener);
    };
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  publishNote(event: DetectedNoteEvent): void {
    for (const listener of this.noteListeners) {
      listener(event);
    }
    const keyListeners = this.keyListeners[event.midi];
    if (keyListeners) {
      for (const listener of keyListeners) {
        listener(event);
      }
    }
  }

  publishStats(stats: DetectionStats): void {
    this.latestStats = stats;
    for (const listener of this.statsListeners) {
      listener(stats);
    }
  }

  publishCalibration(event: CalibrationProgressEvent): void {
    for (const listener of this.calibrationListeners) {
      listener(event);
    }
  }

  publishStatus(status: EngineStatus): void {
    this.latestStatus = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  getLatestStats(): DetectionStats {
    return this.latestStats;
  }

  getLatestStatus(): EngineStatus {
    return this.latestStatus;
  }

  clear(): void {
    this.noteListeners.clear();
    this.keyListeners = new Array(KEY_COUNT);
    this.statsListeners.clear();
    this.calibrationListeners.clear();
    this.statusListeners.clear();
    this.latestStats = EMPTY_STATS;
    this.latestStatus = STOPPED;
  }
}

export const noteEventBus = new NoteEventBus();
