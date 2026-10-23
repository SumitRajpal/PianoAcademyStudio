import { Text } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

import {
  CALIBRATION_STATE,
  CorePiano,
  KeyRole,
  KEYBOARD_CHOICES,
  noteEventBus,
  type PianoKeyLights,
} from '../../../motion/scenes/PianoMaster';
import { mockAudioEngine } from '../../../motion/scenes/PianoMaster/CorePianoNotesDetection';
import { CalibrationScreen, calibrationView } from '..';

function texts(root: ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    )
    .join(' | ');
}

function press(root: ReactTestInstance, label: string) {
  const button = root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      String(node.props.accessibilityLabel ?? '').startsWith(label),
  )[0];
  if (!button) throw new Error(`No button "${label}" in: ${texts(root)}`);
  act(() => {
    button.props.onPress();
  });
}

function keyLights(renderer: ReactTestRenderer): PianoKeyLights {
  return renderer.root.findByType(CorePiano).props.state.value;
}

describe('CalibrationScreen', () => {
  let renderer: ReactTestRenderer;
  let onSaved: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    noteEventBus.clear();
    mockAudioEngine.stopDetector();
    mockAudioEngine.clearCalibrationProfile();
    onSaved = jest.fn();
    act(() => {
      renderer = create(<CalibrationScreen onSaved={onSaved} />);
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
    jest.useRealTimers();
  });

  it('asks how many keys, and shows that keyboard', () => {
    expect(texts(renderer.root)).toContain(
      'How many keys does your piano have?',
    );
    for (const k of KEYBOARD_CHOICES) {
      expect(texts(renderer.root)).toContain(`${k.id} keys`);
    }
    expect(renderer.root.findByType(CorePiano).props.from).toBe('A0');
    press(renderer.root, '61 keys');
    expect(renderer.root.findByType(CorePiano).props.from).toBe('C2');
    expect(renderer.root.findByType(CorePiano).props.to).toBe('C7');
    expect(texts(renderer.root)).toContain('Quick check or thorough?');
    expect(texts(renderer.root)).toContain('6 keys · about a minute');
  });

  it('calibrates the chosen keyboard, lighting the key to play and checking each strike', () => {
    const start = jest.spyOn(mockAudioEngine, 'startCalibration');
    press(renderer.root, '61 keys');
    press(renderer.root, 'Quick');
    expect(start).toHaveBeenCalledWith({
      fullMode: false,
      lowestMidi: 36,
      highestMidi: 96,
    });
    expect(texts(renderer.root)).toContain('Stay quiet for a moment');

    act(() =>
      mockAudioEngine.simulateCalibrationStep({
        state: CALIBRATION_STATE.waitStrike1,
        currentMidi: 36,
        totalKeys: 6,
      }),
    );
    expect(texts(renderer.root)).toContain('Play C2 softly');
    expect(keyLights(renderer).roles[36]).toBe(KeyRole.Target);

    // A wrong key flashes red, and the key to play stays lit.
    act(() =>
      mockAudioEngine.simulateCalibrationStep({
        state: CALIBRATION_STATE.wrongKey,
        currentMidi: 36,
        detectedMidi: 38,
        totalKeys: 6,
      }),
    );
    expect(texts(renderer.root)).toContain('That was D2. Play C2.');
    expect(keyLights(renderer).roles[38]).toBe(KeyRole.Wrong);
    expect(keyLights(renderer).roles[36]).toBe(KeyRole.Target);
    act(() => jest.advanceTimersByTime(1000));
    expect(keyLights(renderer).roles[38]).toBe(KeyRole.None);

    // A good strike flashes the key green, then it is the key to play again.
    act(() =>
      mockAudioEngine.simulateCalibrationStep({
        state: CALIBRATION_STATE.waitStrike2,
        currentMidi: 36,
        strikeNumber: 2,
        measuredMidi: 36,
        totalKeys: 6,
      }),
    );
    expect(texts(renderer.root)).toContain('Now play C2 again, firmly');
    expect(keyLights(renderer).roles[36]).toBe(KeyRole.Correct);
    act(() => jest.advanceTimersByTime(1000));
    expect(keyLights(renderer).roles[36]).toBe(KeyRole.Target);

    act(() =>
      mockAudioEngine.simulateCalibrationStep({
        state: CALIBRATION_STATE.keyDone,
        currentMidi: 48,
        keyIndex: 1,
        measuredMidi: 36,
        totalKeys: 6,
      }),
    );
    expect(texts(renderer.root)).toContain('Play C3 softly');
    expect(texts(renderer.root)).toContain('KEY 2 OF 6');
    expect(keyLights(renderer).roles[48]).toBe(KeyRole.Target);
  });

  it('saves when the user says so, then moves on', () => {
    press(renderer.root, '88 keys');
    press(renderer.root, 'Quick');
    act(() =>
      mockAudioEngine.simulateCalibrationStep({
        state: CALIBRATION_STATE.allDone,
        measuredMidi: 84,
        keyIndex: 6,
      }),
    );
    expect(texts(renderer.root)).toContain('Your piano is calibrated');
    expect(onSaved).not.toHaveBeenCalled();
    const save = jest.spyOn(mockAudioEngine, 'saveCalibrationProfile');
    press(renderer.root, 'Save');
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('starts over from the first question', () => {
    const stop = jest.spyOn(mockAudioEngine, 'stopCalibration');
    press(renderer.root, '49 keys');
    press(renderer.root, 'Thorough');
    press(renderer.root, 'Start over');
    expect(stop).toHaveBeenCalled();
    expect(texts(renderer.root)).toContain(
      'How many keys does your piano have?',
    );
  });

  it('says when the microphone is off', () => {
    act(() =>
      mockAudioEngine.simulateStatus({
        state: 'permissionDenied',
        message: '',
      }),
    );
    expect(texts(renderer.root)).toContain('Microphone off');
    expect(texts(renderer.root)).toContain(
      'Microphone access is off. Turn it on in Settings.',
    );
  });
});

describe('calibrationView', () => {
  const keyboard = KEYBOARD_CHOICES[0];
  const running = { state: 'running', message: '' } as const;

  it('reports a failed save beside the Save button', () => {
    const view = calibrationView({
      step: 'listening',
      keyboard,
      event: {
        state: CALIBRATION_STATE.allDone,
        currentMidi: 84,
        keyIndex: 6,
        totalKeys: 7,
        strikeNumber: 1,
        measuredMidi: 84,
        detectedMidi: -1,
        measuredFreqHz: 1047,
        centsOffset: 2,
        strikeRmsDb: -20,
        measuredB: 0.0004,
      },
      profile: null,
      status: running,
      saveFailed: true,
    });
    expect(view.finished).toBe(true);
    expect(view.choices.map(c => c.label)).toEqual(['Save']);
    expect(view.feedback).toEqual({
      tone: 'problem',
      text: "Couldn't save. Try again.",
    });
  });

  it('highlights the keyboard calibrated last time', () => {
    const view = calibrationView({
      step: 'keyboard',
      keyboard: KEYBOARD_CHOICES[2],
      event: null,
      profile: null,
      status: running,
      saveFailed: false,
    });
    expect(view.choices.filter(c => c.chosen).map(c => c.id)).toEqual(['61']);
    expect(view.listening).toEqual({ on: true, text: 'Listening' });
  });
});
