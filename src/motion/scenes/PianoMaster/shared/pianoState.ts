/**
 * The key state of the piano: which keys are lit, in which role, and how
 * strongly. It lives on the UI thread, so lessons and the mic can change it
 * every frame without React re-rendering.
 */

import { useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { MIDI_MAX } from '../../../../shared/piano';

/** What a lit key means. Each role has its own colour in the theme. */
export const KeyRole = {
  None: 0,
  /** A key that is being played. */
  Pressed: 1,
  /** A key the player should play next. */
  Target: 2,
  Correct: 3,
  Wrong: 4,
} as const;
export type KeyRole = (typeof KeyRole)[keyof typeof KeyRole];

/**
 * The light of every MIDI note, indexed by MIDI number (0–127). Because it
 * covers all notes, one state can drive keyboards of any range.
 */
export type PianoKeyLights = {
  /** Role of each key, a KeyRole value. */
  roles: number[];
  /** How strongly each key is lit, from 0 (off) to 1. */
  levels: number[];
};

export type PianoState = SharedValue<PianoKeyLights>;

const NOTE_COUNT = MIDI_MAX + 1;

export function createKeyLights(): PianoKeyLights {
  return {
    roles: new Array<number>(NOTE_COUNT).fill(KeyRole.None),
    levels: new Array<number>(NOTE_COUNT).fill(0),
  };
}

/** Creates the key state for one or more CorePiano keyboards. */
export function usePianoState(): PianoState {
  const [initial] = useState(createKeyLights);
  return useSharedValue(initial);
}

/**
 * Lights a key in a role, `level` from 0 to 1. Notes outside MIDI are ignored.
 * This is a worklet: call it on the UI thread (a frame callback, a gesture)
 * or from JS.
 */
export function lightKey(
  state: PianoState,
  midi: number,
  role: KeyRole,
  level: number = 1,
): void {
  'worklet';
  if (!Number.isInteger(midi) || midi < 0 || midi >= NOTE_COUNT) {
    return;
  }
  const clamped = Math.min(1, Math.max(0, level));
  state.modify(lights => {
    'worklet';
    lights.roles[midi] = role;
    lights.levels[midi] = clamped;
    return lights;
  });
}

export function unlightKey(state: PianoState, midi: number): void {
  'worklet';
  lightKey(state, midi, KeyRole.None, 0);
}

export function unlightAllKeys(state: PianoState): void {
  'worklet';
  state.modify(lights => {
    'worklet';
    lights.roles.fill(KeyRole.None);
    lights.levels.fill(0);
    return lights;
  });
}
