import {
  createKeyLights,
  KeyRole,
  lightKey,
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
});
