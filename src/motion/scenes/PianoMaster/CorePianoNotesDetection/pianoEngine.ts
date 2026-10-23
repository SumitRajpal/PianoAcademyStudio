/**
 * Binds the C++ note engine (a TurboModule) to the noteEventBus, or the mock
 * engine where the native module is missing (Jest).
 */

import { TurboModuleRegistry } from 'react-native';
import type { Spec as NativePianoEngineSpec } from './specs/NativePianoEngine';
import { mockAudioEngine } from './mockAudioEngine';
import { noteEventBus } from './noteEventBus';
import type {
  CalibrationOptions,
  DetectionStats,
  LiveKeys,
  PianoProfile,
} from './types';

let nativeModule: NativePianoEngineSpec | null = null;
let isMockActive = false;
let initialized = false;
let liveKeys: LiveKeys | null | undefined;

function getModule(): NativePianoEngineSpec | typeof mockAudioEngine {
  if (nativeModule) return nativeModule;

  try {
    const mod =
      TurboModuleRegistry.get<NativePianoEngineSpec>('NativePianoEngine');
    if (mod) {
      nativeModule = mod;
      isMockActive = false;
      return mod;
    }
  } catch {
    // Native module unavailable (Jest tests, simulator without native linking)
  }

  isMockActive = true;
  return mockAudioEngine;
}

function ensureEventBinding() {
  if (initialized) return;
  initialized = true;

  const engine = getModule();
  engine.onPianoEvent(event => {
    noteEventBus.publishNote(event);
  });
  engine.onCalibrationEvent(event => {
    noteEventBus.publishCalibration(event);
  });
  engine.onEngineStatus(status => {
    noteEventBus.publishStatus(status);
  });
}

export function startAudioDetector(): boolean {
  ensureEventBinding();
  const engine = getModule();
  return engine.startDetector();
}

export function stopAudioDetector(): void {
  const engine = getModule();
  engine.stopDetector();
}

export function setAudioExpectedNotes(midiNotes: readonly number[]): void {
  const engine = getModule();
  engine.setExpectedNotes(midiNotes);
}

export function setAudioPolyphony(enabled: boolean): void {
  const engine = getModule();
  engine.setPolyphony(enabled);
}

/**
 * The engine's live key table (see LiveKeys), the same object for every
 * caller. null with the mock engine: a JS object cannot be shared with the
 * UI thread, so the mock reaches keys through the event bus instead.
 */
export function getLiveKeys(): LiveKeys | null {
  if (liveKeys === undefined) {
    getModule();
    liveKeys = nativeModule ? (nativeModule.getLiveKeys() as LiveKeys) : null;
  }
  return liveKeys;
}

export function getAudioStats(): DetectionStats {
  const engine = getModule();
  const stats = engine.getEngineStats();
  noteEventBus.publishStats(stats);
  return stats;
}

/** Starts calibrating the keyboard described by `options` (the engine starts if needed). */
export function startPianoCalibration(options: CalibrationOptions): boolean {
  ensureEventBinding();
  const engine = getModule();
  return engine.startCalibration(options);
}

export function stopPianoCalibration(): void {
  const engine = getModule();
  engine.stopCalibration();
}

/** The current profile; a saved calibration is loaded when the app starts. */
export function getPianoCalibrationProfile(): PianoProfile {
  const engine = getModule();
  return engine.getCalibrationProfile();
}

/** Saves the calibration that just finished. False if there is none or it could not be written. */
export function savePianoCalibration(): boolean {
  const engine = getModule();
  return engine.saveCalibrationProfile();
}

/** Forgets the calibration (and deletes the saved file). */
export function clearPianoCalibration(): void {
  const engine = getModule();
  engine.clearCalibrationProfile();
}

export function isAudioMockActive(): boolean {
  getModule();
  return isMockActive;
}

export { mockAudioEngine };
