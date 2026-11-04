/**
 * Microphone problems the user can fix, in their words. The engine overlay
 * and the calibration screen show them; the engine only reports its state.
 */

import type { EngineStatus } from '@pianoacademy/core-engine';

export const STATUS_MESSAGES: Partial<Record<EngineStatus['state'], string>> = {
  permissionPending: 'Waiting for microphone permission…',
  permissionDenied: 'Microphone access is off. Turn it on in Settings.',
  interrupted: 'Listening paused by another app or a call.',
  error: 'The microphone could not start.',
};
