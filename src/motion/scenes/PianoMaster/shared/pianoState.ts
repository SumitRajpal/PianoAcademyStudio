/**
 * The key state of the piano: which keys are held down, and which are lit in
 * a lesson role and how strongly. It lives on the UI thread, so lessons and
 * the mic can change it every few milliseconds without React re-rendering.
 */

import { useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { MIDI_MAX, parseNote, type NoteInput } from '../../../../shared/piano';

/** What a lit key means. Each role has its own colour in the theme. */
export const KeyRole = {
  None: 0,
  /** The colour of held keys (see pressKey); also usable as a lesson role. */
  Pressed: 1,
  /** A key the player should play next. */
  Target: 2,
  Correct: 3,
  Wrong: 4,
} as const;
export type KeyRole = (typeof KeyRole)[keyof typeof KeyRole];

/**
 * The state of every MIDI note, indexed by MIDI number (0–127). Because it
 * covers all notes, one state can drive keyboards of any range.
 *
 * Two independent layers, so input never erases what the lesson shows:
 * - the lesson layer (`roles`, `levels`): target, correct and wrong keys;
 * - the input layer (`pressed`): the keys being held down right now.
 *
 * Held keys are also kept as a sparse set (`held` + `heldSlot`): pressing,
 * releasing and checking a key is O(1), and replacing the held chord touches
 * only the keys in the old and new chords, never all 128 notes.
 */
export type PianoKeyLights = {
  /** Lesson role of each key, a KeyRole value. */
  roles: number[];
  /** How strongly each key's role is lit, from 0 (off) to 1. */
  levels: number[];
  /** How strongly each key is held down, from 0 (up) to 1. */
  pressed: number[];
  /** The held keys, in no order. */
  held: number[];
  /** Where each key is in `held`, or -1 when it is up. */
  heldSlot: number[];
};

export type PianoState = SharedValue<PianoKeyLights>;

const NOTE_COUNT = MIDI_MAX + 1;

export function createKeyLights(): PianoKeyLights {
  return {
    roles: new Array<number>(NOTE_COUNT).fill(KeyRole.None),
    levels: new Array<number>(NOTE_COUNT).fill(0),
    pressed: new Array<number>(NOTE_COUNT).fill(0),
    held: [],
    heldSlot: new Array<number>(NOTE_COUNT).fill(-1),
  };
}

/** Creates the key state for one or more CorePiano keyboards. */
export function usePianoState(): PianoState {
  const [initial] = useState(createKeyLights);
  return useSharedValue(initial);
}

function isMidi(midi: number): boolean {
  'worklet';
  return Number.isInteger(midi) && midi >= 0 && midi < NOTE_COUNT;
}

/**
 * The helpers below are worklets, which are not hoisted: each is declared
 * before anything that calls it.
 *
 * O(1). Returns whether anything changed.
 */
function hold(lights: PianoKeyLights, midi: number, level: number): boolean {
  'worklet';
  if (lights.pressed[midi] === level) {
    return false;
  }
  if (lights.heldSlot[midi] < 0) {
    lights.heldSlot[midi] = lights.held.length;
    lights.held.push(midi);
  }
  lights.pressed[midi] = level;
  return true;
}

/** O(1): the last held key takes the released key's slot. */
function letGo(lights: PianoKeyLights, midi: number): boolean {
  'worklet';
  const slot = lights.heldSlot[midi];
  if (slot < 0) {
    return false;
  }
  const last = lights.held.pop()!;
  if (last !== midi) {
    lights.held[slot] = last;
    lights.heldSlot[last] = slot;
  }
  lights.heldSlot[midi] = -1;
  lights.pressed[midi] = 0;
  return true;
}

/**
 * Makes `held` exactly `notes`, in O(new + previously held keys). Keys in
 * both are kept (with their level) by briefly negating their level as a mark,
 * so no scratch memory is needed.
 */
function holdExactly(lights: PianoKeyLights, notes: readonly number[]) {
  'worklet';
  let changed = false;
  for (let i = 0; i < notes.length; i++) {
    const midi = notes[i];
    if (!isMidi(midi)) {
      continue;
    }
    const level = lights.pressed[midi];
    if (level > 0) {
      lights.pressed[midi] = -level;
    } else if (level === 0) {
      hold(lights, midi, -1);
      changed = true;
    }
  }
  // Backwards, so a key swapped into a released key's slot is already done.
  for (let i = lights.held.length - 1; i >= 0; i--) {
    const midi = lights.held[i];
    if (lights.pressed[midi] < 0) {
      lights.pressed[midi] = -lights.pressed[midi];
    } else {
      letGo(lights, midi);
      changed = true;
    }
  }
  return changed;
}

/** A new outer object over the same arrays: notifies the drawing in O(1). */
function changedLights(lights: PianoKeyLights): PianoKeyLights {
  'worklet';
  return { ...lights };
}

/**
 * Presses one key, `level` from 0 to 1 (a level of 0 releases it). O(1), no
 * allocation, and lesson roles are untouched. A worklet: call it from an
 * input callback on the UI thread, or from JS (one hop to the UI thread).
 * Many calls within one frame are drawn once.
 */
export function pressKey(
  state: PianoState,
  midi: number,
  level: number = 1,
): void {
  'worklet';
  if (!isMidi(midi)) {
    return;
  }
  const strength = Math.min(1, level);
  state.modify(lights => {
    'worklet';
    const changed =
      strength > 0 ? hold(lights, midi, strength) : letGo(lights, midi);
    return changed ? changedLights(lights) : lights;
  }, false);
}

/** Releases one key. O(1); releasing a key that is up does nothing. */
export function releaseKey(state: PianoState, midi: number): void {
  'worklet';
  if (!isMidi(midi)) {
    return;
  }
  state.modify(lights => {
    'worklet';
    return letGo(lights, midi) ? changedLights(lights) : lights;
  }, false);
}

/** Releases every held key, in O(held keys). Lesson roles stay. */
export function releaseAllKeys(state: PianoState): void {
  'worklet';
  state.modify(lights => {
    'worklet';
    return holdExactly(lights, []) ? changedLights(lights) : lights;
  }, false);
}

/**
 * Whether a key is held, in O(1). Call it on the UI thread (in a worklet):
 * on the JS thread, reading a shared value waits for the UI thread and copies
 * the whole state.
 */
export function isKeyPressed(state: PianoState, midi: number): boolean {
  'worklet';
  return isMidi(midi) && state.value.pressed[midi] > 0;
}

/**
 * Replaces the held keys with `notes`, the complete set held right now, for
 * input that reports what is down rather than what changed (such as the mic
 * every few milliseconds). Works out the presses and releases itself in
 * O(new + previously held keys). An empty list releases every key. Keys
 * already held keep their level. Duplicate and invalid MIDI numbers are
 * ignored, lesson roles are untouched, and an unchanged chord (in any order)
 * does not redraw. A worklet, like pressKey.
 */
export function setPressedMidiKeys(
  state: PianoState,
  notes: readonly number[],
): void {
  'worklet';
  state.modify(lights => {
    'worklet';
    return holdExactly(lights, notes) ? changedLights(lights) : lights;
  }, false);
}

/**
 * JS convenience API: setPressedKeys(piano, ['C4', 'C#4', 'E4']) or MIDI
 * numbers, with setPressedMidiKeys's rules. Note names are resolved once per
 * call, never during drawing. Invalid notes throw before changing state.
 * For high-frequency input pass MIDI numbers to setPressedMidiKeys, or use
 * pressKey/releaseKey when the input reports changes.
 */
export function setPressedKeys(
  state: PianoState,
  notes: readonly NoteInput[],
): void {
  setPressedMidiKeys(
    state,
    notes.map(note => parseNote(note)),
  );
}

/**
 * Lights a key in a lesson role, `level` from 0 to 1. Notes outside MIDI are
 * ignored. Held keys are separate: see pressKey.
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
  if (!isMidi(midi)) {
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

/** Clears every lesson role. Held keys stay held. */
export function unlightAllKeys(state: PianoState): void {
  'worklet';
  state.modify(lights => {
    'worklet';
    lights.roles.fill(KeyRole.None);
    lights.levels.fill(0);
    return lights;
  });
}
