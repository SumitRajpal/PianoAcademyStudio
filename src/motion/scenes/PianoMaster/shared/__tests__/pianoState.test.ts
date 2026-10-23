import { makeMutable } from 'react-native-reanimated';

import {
  createKeyLights,
  isKeyPressed,
  KeyRole,
  lightKey,
  pressKey,
  releaseAllKeys,
  releaseKey,
  setPressedKeys,
  setPressedMidiKeys,
  unlightAllKeys,
  unlightKey,
  type PianoKeyLights,
  type PianoState,
} from '../pianoState';

/** A stand-in for the shared value: modify runs synchronously, as on the UI thread. */
function fakeState(): PianoState {
  const state = {
    value: createKeyLights(),
    modify(modifier: (lights: PianoKeyLights) => PianoKeyLights) {
      state.value = modifier(state.value);
    },
  };
  return state as unknown as PianoState;
}

describe('piano key state', () => {
  it('starts with every MIDI note unlit', () => {
    const lights = createKeyLights();
    expect(lights.roles).toHaveLength(128);
    expect(lights.levels).toHaveLength(128);
    expect(lights.levels.every(level => level === 0)).toBe(true);
    expect(lights.roles.every(role => role === KeyRole.None)).toBe(true);
  });

  it('lights a key in a role, fully by default', () => {
    const state = fakeState();
    lightKey(state, 60, KeyRole.Target);
    expect(state.value.roles[60]).toBe(KeyRole.Target);
    expect(state.value.levels[60]).toBe(1);
  });

  it('keeps the level between 0 and 1', () => {
    const state = fakeState();
    lightKey(state, 60, KeyRole.Pressed, 0.4);
    expect(state.value.levels[60]).toBe(0.4);
    lightKey(state, 61, KeyRole.Pressed, 3);
    expect(state.value.levels[61]).toBe(1);
    lightKey(state, 62, KeyRole.Pressed, -1);
    expect(state.value.levels[62]).toBe(0);
  });

  it.each([-1, 128, 60.5, NaN])('ignores the note %p', midi => {
    const state = fakeState();
    lightKey(state, midi, KeyRole.Wrong);
    expect(state.value).toEqual(createKeyLights());
  });

  it('unlights one key, or all of them', () => {
    const state = fakeState();
    lightKey(state, 60, KeyRole.Correct);
    lightKey(state, 64, KeyRole.Wrong);
    unlightKey(state, 60);
    expect(state.value.levels[60]).toBe(0);
    expect(state.value.roles[60]).toBe(KeyRole.None);
    expect(state.value.levels[64]).toBe(1);
    unlightAllKeys(state);
    expect(state.value).toEqual(createKeyLights());
  });

  it('presses a mixed black/white chord in one notification', () => {
    const state = makeMutable(createKeyLights());
    const changed = jest.fn();
    state.addListener(1, changed);
    setPressedKeys(state, ['C4', 'C#4', 'E4', 67]);
    expect(changed).toHaveBeenCalledTimes(1);
    for (const midi of [60, 61, 64, 67]) {
      expect(state.value.pressed[midi]).toBe(1);
      expect(isKeyPressed(state, midi)).toBe(true);
    }
    expect(state.value.pressed.filter(level => level > 0)).toHaveLength(4);
    expect([...state.value.held].sort((a, b) => a - b)).toEqual([
      60, 61, 64, 67,
    ]);
  });

  it('replaces the held chord, then releases it with an empty list', () => {
    const state = fakeState();
    setPressedKeys(state, ['C4', 'C#4', 'E4']);
    setPressedKeys(state, ['C#4', 'G4']);
    expect(isKeyPressed(state, 60)).toBe(false);
    expect(isKeyPressed(state, 64)).toBe(false);
    expect(isKeyPressed(state, 61)).toBe(true);
    expect(isKeyPressed(state, 67)).toBe(true);
    setPressedKeys(state, []);
    expect(state.value).toEqual(createKeyLights());
  });

  it('does not notify or allocate for an unchanged chord', () => {
    const state = makeMutable(createKeyLights());
    setPressedKeys(state, ['C4', 'Db4', 'E4']);
    const previous = state.value;
    const changed = jest.fn();
    state.addListener(1, changed);
    setPressedKeys(state, ['E4', 'C#4', 'C4', 'C4']);
    pressKey(state, 60);
    releaseKey(state, 62);
    expect(changed).not.toHaveBeenCalled();
    expect(state.value).toBe(previous);
  });

  it('presses and releases single keys in any order', () => {
    const state = fakeState();
    pressKey(state, 24);
    pressKey(state, 60, 0.5);
    pressKey(state, 108);
    releaseKey(state, 24);
    expect(isKeyPressed(state, 24)).toBe(false);
    expect(state.value.pressed[60]).toBe(0.5);
    expect([...state.value.held].sort((a, b) => a - b)).toEqual([60, 108]);
    pressKey(state, 60, 0);
    releaseKey(state, 24);
    expect(state.value.held).toEqual([108]);
    releaseAllKeys(state);
    expect(state.value).toEqual(createKeyLights());
  });

  it('keeps the sparse set consistent through random rapid input', () => {
    const state = fakeState();
    const truth = new Set<number>();
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let step = 0; step < 5000; step++) {
      const kind = random(3);
      if (kind === 0) {
        const midi = 21 + random(88);
        pressKey(state, midi);
        truth.add(midi);
      } else if (kind === 1) {
        const midi = 21 + random(88);
        releaseKey(state, midi);
        truth.delete(midi);
      } else {
        const chord = Array.from({ length: random(8) }, () => 21 + random(88));
        setPressedMidiKeys(state, chord);
        truth.clear();
        chord.forEach(midi => truth.add(midi));
      }
      const { held, heldSlot, pressed } = state.value;
      let consistent = held.length === truth.size;
      held.forEach((midi, slot) => {
        consistent &&= heldSlot[midi] === slot;
      });
      for (let midi = 0; midi < 128; midi++) {
        consistent &&= pressed[midi] > 0 === truth.has(midi);
        consistent &&= heldSlot[midi] >= 0 === truth.has(midi);
      }
      if (!consistent) {
        throw new Error(`Held keys out of sync at step ${step}`);
      }
    }
  });

  it('keeps lesson roles under held keys and shows them again on release', () => {
    const state = fakeState();
    lightKey(state, 60, KeyRole.Target, 0.7);
    lightKey(state, 62, KeyRole.Correct);
    setPressedKeys(state, ['C4', 'D4', 'F#4']);
    expect(state.value.roles[60]).toBe(KeyRole.Target);
    expect(state.value.levels[60]).toBe(0.7);
    setPressedKeys(state, []);
    expect(state.value.roles[60]).toBe(KeyRole.Target);
    expect(state.value.levels[60]).toBe(0.7);
    expect(state.value.roles[62]).toBe(KeyRole.Correct);
  });

  it('clears lesson roles without releasing held keys', () => {
    const state = fakeState();
    lightKey(state, 60, KeyRole.Target);
    pressKey(state, 60);
    unlightAllKeys(state);
    expect(state.value.roles[60]).toBe(KeyRole.None);
    expect(isKeyPressed(state, 60)).toBe(true);
  });

  it('validates all note names before publishing a chord', () => {
    const state = fakeState();
    setPressedKeys(state, ['G4']);
    const previous = state.value;
    expect(() => setPressedKeys(state, ['C4', 'not a note'])).toThrow(
      RangeError,
    );
    expect(state.value).toBe(previous);
  });

  it('accepts MIDI extremes and ignores invalid MIDI input on the worklet path', () => {
    const state = fakeState();
    setPressedMidiKeys(state, [0, 127, -1, 128, 60.5, NaN, Infinity]);
    pressKey(state, -1);
    pressKey(state, 128);
    releaseKey(state, NaN);
    expect(isKeyPressed(state, 0)).toBe(true);
    expect(isKeyPressed(state, 127)).toBe(true);
    expect(isKeyPressed(state, 128)).toBe(false);
    expect(state.value.held).toHaveLength(2);
  });
});
