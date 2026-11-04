/**
 * High-fidelity in-memory audio detection simulator for Jest testing and development.
 */

import type {
  CalibrationOptions,
  CalibrationProgressEvent,
  DetectedNoteEvent,
  DetectionStats,
  EngineStatus,
  PianoProfile,
} from './types';

const DEFAULT_PROFILE: PianoProfile = {
  isCalibrated: false,
  lowestMidi: 21,
  highestMidi: 108,
  a4ReferenceHz: 440.0,
  ambientNoiseDb: -60.0,
  calibratedGateDb: -48.0,
  minVelocityDb: -42.0,
  maxVelocityDb: -6.0,
  meanInharmonicityB: 0.00035,
  measuredKeys: [],
};

class MockAudioEngine {
  private running = false;
  private calibrating = false;
  private expectedNotes: number[] = [];
  private polyphony = false;
  private startedAt = 0;
  private callback: ((event: DetectedNoteEvent) => void) | null = null;
  private calCallback: ((event: CalibrationProgressEvent) => void) | null =
    null;
  private statusCallback: ((status: EngineStatus) => void) | null = null;
  private activeTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private calibrationOptions: CalibrationOptions | null = null;

  private profile: PianoProfile = { ...DEFAULT_PROFILE };

  startDetector(): boolean {
    if (!this.running) {
      this.running = true;
      this.startedAt = Date.now();
      this.statusCallback?.({ state: 'running', message: '' });
    }
    return true;
  }

  stopDetector(): void {
    const wasRunning = this.running;
    this.running = false;
    this.calibrating = false;
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    if (wasRunning) this.statusCallback?.({ state: 'stopped', message: '' });
  }

  setExpectedNotes(notes: readonly number[]): void {
    this.expectedNotes = [...notes];
  }

  setPolyphony(enabled: boolean): void {
    this.polyphony = enabled;
  }

  isPolyphonyEnabled(): boolean {
    return this.polyphony;
  }

  getEngineStats(): DetectionStats {
    return { avgUs: 28.5, maxUs: 312.0, lateHops: 0, droppedHops: 0 };
  }

  onPianoEvent(cb: (event: DetectedNoteEvent) => void): void {
    this.callback = cb;
  }

  onEngineStatus(cb: (status: EngineStatus) => void): void {
    this.statusCallback = cb;
  }

  startCalibration(options: CalibrationOptions): boolean {
    this.calibrationOptions = options;
    this.calibrating = true;
    this.startDetector();
    return true;
  }

  stopCalibration(): void {
    this.calibrating = false;
  }

  isCalibrating(): boolean {
    return this.calibrating;
  }

  getCalibrationProfile(): PianoProfile {
    return this.profile;
  }

  /** Like the native engine: a finished calibration is saved only when asked. */
  saveCalibrationProfile(): boolean {
    return this.profile.isCalibrated;
  }

  clearCalibrationProfile(): void {
    this.profile = { ...DEFAULT_PROFILE };
  }

  onCalibrationEvent(cb: (event: CalibrationProgressEvent) => void): void {
    this.calCallback = cb;
  }

  /** Test helper: deliver a calibration event (missing fields get defaults). */
  simulateCalibrationStep(event: Partial<CalibrationProgressEvent>): void {
    if (!this.calCallback) return;
    const fullEvent: CalibrationProgressEvent = {
      state: event.state ?? 1,
      currentMidi: event.currentMidi ?? 60,
      keyIndex: event.keyIndex ?? 0,
      totalKeys: event.totalKeys ?? 7,
      strikeNumber: event.strikeNumber ?? 1,
      measuredMidi: event.measuredMidi ?? -1,
      detectedMidi: event.detectedMidi ?? -1,
      measuredFreqHz: event.measuredFreqHz ?? 0,
      centsOffset: event.centsOffset ?? 0,
      strikeRmsDb: event.strikeRmsDb ?? -24.0,
      measuredB: event.measuredB ?? 0,
    };
    if (fullEvent.state === 4) {
      this.calibrating = false;
      this.profile = {
        ...this.profile,
        isCalibrated: true,
        lowestMidi: this.calibrationOptions?.lowestMidi ?? 21,
        highestMidi: this.calibrationOptions?.highestMidi ?? 108,
      };
    }
    this.calCallback(fullEvent);
  }

  /** Test helper: report an engine status (e.g. a denied microphone). */
  simulateStatus(status: EngineStatus): void {
    this.statusCallback?.(status);
  }

  /**
   * Simulate a note strike in tests or mocks.
   */
  simulateNote(
    midi: number,
    durationMs: number = 300,
    cents: number = 0,
    velocity: number = 0.8,
  ): void {
    if (!this.running || !this.callback) return;

    // In expected-notes mode, ignore notes that are not in the expected set
    if (this.expectedNotes.length > 0 && !this.expectedNotes.includes(midi)) {
      return;
    }

    // Emit noteOn (tMs is stream time, as from the native engine)
    this.callback({
      type: 'noteOn',
      midi,
      cents,
      velocity,
      tMs: Date.now() - this.startedAt,
    });

    // Schedule noteOff
    const prevTimer = this.activeTimers.get(midi);
    if (prevTimer) clearTimeout(prevTimer);

    const timer = setTimeout(() => {
      if (this.running && this.callback) {
        this.callback({
          type: 'noteOff',
          midi,
          cents: 0,
          velocity: 0,
          tMs: Date.now() - this.startedAt,
        });
      }
      this.activeTimers.delete(midi);
    }, durationMs);

    this.activeTimers.set(midi, timer);
  }
}

export const mockAudioEngine = new MockAudioEngine();
