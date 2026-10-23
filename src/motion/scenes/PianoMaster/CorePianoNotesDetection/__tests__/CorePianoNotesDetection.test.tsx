import React, { useEffect } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import {
  act,
  create as createRenderer,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

// Every renderer is unmounted after its test: the HUD polls timing stats on an interval.
const mounted: ReactTestRenderer[] = [];
function create(element: React.ReactElement): ReactTestRenderer {
  const renderer = createRenderer(element);
  mounted.push(renderer);
  return renderer;
}
import {
  createKeyLights,
  isKeyPressed,
  type PianoKeyLights,
  type PianoState,
} from '../../shared/pianoState';
import {
  calibrationKeys,
  calibrationPrompt,
  describeKey,
  describeProfile,
  KEYBOARD_CHOICES,
  keyboardChoiceFor,
} from '../calibrationGuide';
import { CorePianoNotesDetection } from '../CorePianoNotesDetection';
import { CORE_PIANO_NOTES_DETECTION_LOOK } from '../corePianoNotesDetectionLook';
import {
  createLiveKeysReader,
  detectedKeyLevel,
  readLiveKeys,
  type LiveKeysReader,
} from '../liveKeys';
import { mockAudioEngine } from '../mockAudioEngine';
import { noteEventBus } from '../noteEventBus';
import {
  CALIBRATION_STATE,
  type CalibrationProgressEvent,
  type LiveKeys,
  type PianoProfile,
} from '../types';
import { useCorePianoNotesDetection } from '../useCorePianoNotesDetection';

function textOf(node: ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    )
    .join(' | ');
}

function pressText(root: ReactTestInstance, label: string) {
  const button = root
    .findAllByType(TouchableOpacity)
    .find(b => textOf(b).includes(label));
  if (!button) throw new Error(`No button "${label}"`);
  act(() => {
    button.props.onPress();
  });
}

function calEvent(
  e: Partial<CalibrationProgressEvent>,
): CalibrationProgressEvent {
  return {
    state: 1,
    currentMidi: 24,
    keyIndex: 0,
    totalKeys: 7,
    strikeNumber: 1,
    measuredMidi: -1,
    detectedMidi: -1,
    measuredFreqHz: 0,
    centsOffset: 0,
    strikeRmsDb: -30,
    measuredB: 0,
    ...e,
  };
}

function fakePianoState(): PianoState {
  const state = {
    value: createKeyLights(),
    modify(modifier: (lights: PianoKeyLights) => PianoKeyLights) {
      state.value = modifier(state.value);
    },
  };
  return state as unknown as PianoState;
}

/** A shared value as the UI thread sees it: modify runs at once. */
function fakeShared<T>(value: T) {
  const shared = {
    value,
    modify(modifier: (v: T) => T) {
      shared.value = modifier(shared.value);
    },
  };
  return shared as unknown as import('react-native-reanimated').SharedValue<T> & {
    value: T;
  };
}

/**
 * The native key table's rules in JS (see shared/LiveKeys.h): a version per
 * change, and changes(since) as the host object returns them.
 */
function fakeLiveKeys() {
  const slots = new Array(128)
    .fill(null)
    .map(() => ({ down: false, velocity: 0, changedAt: 0, struckAt: 0 }));
  let version = 0;
  let busy = false;
  const calls = { changes: 0 };
  const keys: LiveKeys = {
    get version() {
      return version;
    },
    changes(since: number) {
      calls.changes++;
      if (busy) return null;
      const out = [version];
      slots.forEach((k, midi) => {
        if (since < 0 ? !k.down : k.changedAt <= since) return;
        out.push(
          midi,
          k.down ? 1 : 0,
          k.velocity,
          since >= 0 && k.struckAt > since ? 1 : 0,
        );
      });
      return out;
    },
    key: () => null,
    isDown: (midi: number) => slots[midi].down,
  };
  return {
    keys,
    calls,
    setBusy(b: boolean) {
      busy = b;
    },
    on(midi: number, velocity: number) {
      version++;
      Object.assign(slots[midi], {
        down: true,
        velocity,
        changedAt: version,
        struckAt: version,
      });
    },
    off(midi: number) {
      version++;
      Object.assign(slots[midi], { down: false, changedAt: version });
    },
  };
}

function HookHarness({
  options,
  onResult,
}: {
  options: Parameters<typeof useCorePianoNotesDetection>[0];
  onResult: (res: ReturnType<typeof useCorePianoNotesDetection>) => void;
}) {
  const res = useCorePianoNotesDetection(options);
  useEffect(() => {
    onResult(res);
  });
  onResult(res);
  return null;
}

async function renderHarness(
  options: Parameters<typeof useCorePianoNotesDetection>[0],
) {
  let hookResult!: ReturnType<typeof useCorePianoNotesDetection>;
  let renderer!: any;
  await act(async () => {
    renderer = create(
      <HookHarness
        options={options}
        onResult={res => {
          hookResult = res;
        }}
      />,
    );
  });
  return {
    getResult: () => hookResult,
    renderer,
  };
}

describe('CorePianoNotesDetection', () => {
  beforeEach(() => {
    noteEventBus.clear();
    mockAudioEngine.stopDetector();
  });

  afterEach(() => {
    act(() => {
      while (mounted.length > 0) mounted.pop()?.unmount();
    });
    noteEventBus.clear();
    mockAudioEngine.stopDetector();
  });

  it('subscribes to note events and updates active notes and latest note', async () => {
    const onNoteDetected = jest.fn();
    const { getResult } = await renderHarness({ onNoteDetected });

    expect(getResult().activeNotes.size).toBe(0);
    expect(getResult().latestNote).toBeNull();

    // Publish NoteOn for C4 (MIDI 60)
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOn',
        midi: 60,
        cents: 2.5,
        velocity: 0.85,
        tMs: 100,
      });
    });

    expect(getResult().activeNotes.size).toBe(1);
    expect(getResult().activeNotes.get(60)).toEqual({
      type: 'noteOn',
      midi: 60,
      cents: 2.5,
      velocity: 0.85,
      tMs: 100,
    });
    expect(getResult().latestNote).toEqual({
      midi: 60,
      name: 'C4',
      cents: 2.5,
    });
    expect(onNoteDetected).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'noteOn', midi: 60 }),
    );

    // Publish NoteOff for C4
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOff',
        midi: 60,
        cents: 0,
        velocity: 0,
        tMs: 300,
      });
    });

    expect(getResult().activeNotes.size).toBe(0);
  });

  it('updates PianoState directly on UI thread when noteOn and noteOff occur', async () => {
    const pianoState = fakePianoState();

    expect(isKeyPressed(pianoState, 64)).toBe(false);

    await renderHarness({ pianoState });

    // NoteOn for E4 (MIDI 64)
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOn',
        midi: 64,
        cents: -1.2,
        velocity: 0.9,
        tMs: 150,
      });
    });

    expect(isKeyPressed(pianoState, 64)).toBe(true);
    expect(pianoState.value.pressed[64]).toBe(0.9);

    // NoteOff for E4
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOff',
        midi: 64,
        cents: 0,
        velocity: 0,
        tMs: 400,
      });
    });

    expect(isKeyPressed(pianoState, 64)).toBe(false);
    expect(pianoState.value.pressed[64]).toBe(0);
  });

  it('resolves expected note names into MIDI numbers', async () => {
    const { getResult } = await renderHarness({
      expected: ['C4', 'E4', 'G4', 71],
    });

    expect(getResult().expectedMidi).toEqual([60, 64, 67, 71]);
  });

  it('renders diagnostic HUD overlay when showDiagnostics is true', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<CorePianoNotesDetection showDiagnostics={true} />);
    });

    expect(renderer.toJSON()).not.toBeNull();

    // When NoteOn occurs, HUD reflects detected note name
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOn',
        midi: 69,
        cents: 3.0,
        velocity: 0.8,
        tMs: 100,
      });
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('A4');
  });

  it('works seamlessly with mockAudioEngine simulation', async () => {
    jest.useFakeTimers();

    const onNoteDetected = jest.fn();
    await renderHarness({ onNoteDetected });

    mockAudioEngine.startDetector();
    mockAudioEngine.onPianoEvent(ev => noteEventBus.publishNote(ev));

    act(() => {
      mockAudioEngine.simulateNote(60, 200, 3.0, 0.75);
    });

    expect(onNoteDetected).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'noteOn', midi: 60 }),
    );

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(onNoteDetected).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'noteOff', midi: 60 }),
    );

    jest.useRealTimers();
  });

  it('offers Calibrate only when the app can open the calibration screen', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<CorePianoNotesDetection showDiagnostics />);
    });
    expect(renderer.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    const onCalibrate = jest.fn();
    await act(async () => {
      renderer.update(
        <CorePianoNotesDetection showDiagnostics onCalibrate={onCalibrate} />,
      );
    });
    pressText(renderer.root, 'Calibrate');
    expect(onCalibrate).toHaveBeenCalledTimes(1);
  });

  it('saves a finished calibration only when asked', async () => {
    const { getResult } = await renderHarness({});
    expect(getResult().saveCalibration()).toBe(false); // nothing calibrated yet
    act(() => {
      getResult().startCalibration({
        fullMode: false,
        lowestMidi: 36,
        highestMidi: 96,
      });
    });
    act(() => {
      mockAudioEngine.simulateCalibrationStep({
        state: CALIBRATION_STATE.allDone,
        totalKeys: 6,
        keyIndex: 5,
      });
    });
    expect(getResult().profile?.isCalibrated).toBe(true);
    let saved = false;
    act(() => {
      saved = getResult().saveCalibration();
    });
    expect(saved).toBe(true);
    mockAudioEngine.clearCalibrationProfile();
  });

  it('shows microphone problems the user can fix', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<CorePianoNotesDetection showDiagnostics />);
    });
    await act(async () => {
      noteEventBus.publishStatus({ state: 'permissionDenied', message: '' });
    });
    expect(JSON.stringify(renderer.toJSON())).toContain(
      'Microphone access is off',
    );
    await act(async () => {
      noteEventBus.publishStatus({ state: 'running', message: '' });
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain(
      'Microphone access is off',
    );
  });

  it('polls timing stats only when asked', async () => {
    jest.useFakeTimers();
    const { getResult } = await renderHarness({ statsIntervalMs: 500 });
    expect(getResult().stats.avgUs).toBe(0);
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(getResult().stats.avgUs).toBeGreaterThan(0);
    jest.useRealTimers();
  });

  describe('noteEventBus', () => {
    it('gives a key listener only the notes of its key', () => {
      const c4 = jest.fn();
      const all = jest.fn();
      const unsubscribe = noteEventBus.subscribeKey(60, c4);
      noteEventBus.subscribeNote(all);
      noteEventBus.publishNote({
        type: 'noteOn',
        midi: 62,
        cents: 0,
        velocity: 0.5,
        tMs: 1,
      });
      noteEventBus.publishNote({
        type: 'noteOn',
        midi: 60,
        cents: 0,
        velocity: 0.5,
        tMs: 2,
      });
      expect(c4).toHaveBeenCalledTimes(1);
      expect(c4).toHaveBeenCalledWith(expect.objectContaining({ midi: 60 }));
      expect(all).toHaveBeenCalledTimes(2);
      unsubscribe();
      noteEventBus.publishNote({
        type: 'noteOff',
        midi: 60,
        cents: 0,
        velocity: 0,
        tMs: 3,
      });
      expect(c4).toHaveBeenCalledTimes(1);
      expect(() => noteEventBus.subscribeKey(128, c4)).toThrow(RangeError);
    });
  });

  describe('reading the key table on the UI thread', () => {
    const { softestLevel, shortestLitMs } =
      CORE_PIANO_NOTES_DETECTION_LOOK.keys;

    it('lights what is down at the first look, then only what changed', () => {
      const table = fakeLiveKeys();
      const piano = fakePianoState();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      table.on(60, 1);
      table.on(64, 0);
      readLiveKeys(piano, table.keys, reader, 0);
      expect(piano.value.pressed[60]).toBe(1);
      expect(piano.value.pressed[64]).toBe(softestLevel); // a soft strike still shows clearly
      table.off(60);
      readLiveKeys(piano, table.keys, reader, 16);
      expect(isKeyPressed(piano, 60)).toBe(false);
      expect(isKeyPressed(piano, 64)).toBe(true);
    });

    it('does nothing while the version stands still', () => {
      const table = fakeLiveKeys();
      const piano = fakePianoState();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      table.on(60, 0.5);
      readLiveKeys(piano, table.keys, reader, 0);
      const looked = table.calls.changes;
      readLiveKeys(piano, table.keys, reader, 16);
      readLiveKeys(piano, table.keys, reader, 33);
      expect(table.calls.changes).toBe(looked);
    });

    it('shows a key struck and released between two looks, then lets it go', () => {
      const table = fakeLiveKeys();
      const piano = fakePianoState();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      readLiveKeys(piano, table.keys, reader, 0);
      table.on(67, 0.8);
      table.off(67);
      readLiveKeys(piano, table.keys, reader); // an early look, between frames
      expect(piano.value.pressed[67]).toBeCloseTo(detectedKeyLevel(0.8));
      readLiveKeys(piano, table.keys, reader, shortestLitMs - 1);
      expect(isKeyPressed(piano, 67)).toBe(true);
      readLiveKeys(piano, table.keys, reader, shortestLitMs + 1);
      expect(isKeyPressed(piano, 67)).toBe(false);
    });

    it('tries again next frame when a key was being written', () => {
      const table = fakeLiveKeys();
      const piano = fakePianoState();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      table.on(72, 1);
      table.setBusy(true);
      readLiveKeys(piano, table.keys, reader, 0);
      expect(isKeyPressed(piano, 72)).toBe(false);
      table.setBusy(false);
      readLiveKeys(piano, table.keys, reader, 16);
      expect(isKeyPressed(piano, 72)).toBe(true);
    });
  });

  describe('calibration guide', () => {
    function calibrated(lowestMidi: number, highestMidi: number): PianoProfile {
      return {
        isCalibrated: true,
        lowestMidi,
        highestMidi,
        a4ReferenceHz: 441.5,
        ambientNoiseDb: -60,
        calibratedGateDb: -54,
        minVelocityDb: -40,
        maxVelocityDb: -10,
        meanInharmonicityB: 0.0003,
        measuredKeys: [24, 36, 48, 60, 69, 72, 84],
      };
    }

    it('asks for the same keys as the engine', () => {
      expect(
        calibrationKeys({ fullMode: false, lowestMidi: 21, highestMidi: 108 }),
      ).toEqual([24, 36, 48, 60, 69, 72, 84]);
      expect(
        calibrationKeys({ fullMode: false, lowestMidi: 36, highestMidi: 96 }),
      ).toEqual([36, 48, 60, 69, 72, 84]);
      expect(
        calibrationKeys({ fullMode: true, lowestMidi: 21, highestMidi: 108 }),
      ).toHaveLength(17);
    });

    it('starts from the keyboard calibrated last time', () => {
      expect(keyboardChoiceFor(null).id).toBe('88');
      expect(keyboardChoiceFor(calibrated(36, 96)).id).toBe('61');
      expect(KEYBOARD_CHOICES.map(k => k.id)).toEqual(['88', '76', '61', '49']);
    });

    it('asks for quiet first, then the key to play', () => {
      expect(calibrationPrompt(null).title).toBe('Stay quiet for a moment');
      const first = calibrationPrompt(
        calEvent({ state: CALIBRATION_STATE.waitStrike1, currentMidi: 24 }),
      );
      expect(first.title).toBe('Play C1 softly');
      expect(first.target).toBe(24);
      expect(first.step).toBe('Key 1 of 7');
      expect(first.feedback).toBeNull();
    });

    it('confirms a good strike on the key and asks for the next', () => {
      const second = calibrationPrompt(
        calEvent({
          state: CALIBRATION_STATE.waitStrike2,
          currentMidi: 24,
          strikeNumber: 2,
          measuredMidi: 24,
        }),
      );
      expect(second.title).toBe('Now play C1 again, firmly');
      expect(second.flash).toEqual({ midi: 24, role: 'correct' });
      expect(second.progress).toBeCloseTo(0.5 / 7);
      // "Key done" names the NEXT key.
      const next = calibrationPrompt(
        calEvent({
          state: CALIBRATION_STATE.keyDone,
          currentMidi: 36,
          keyIndex: 1,
          measuredMidi: 24,
        }),
      );
      expect(next.title).toBe('Play C2 softly');
      expect(next.target).toBe(36);
      expect(next.feedback).toEqual({ tone: 'good', text: 'C1 measured.' });
      expect(next.flash).toEqual({ midi: 24, role: 'correct' });
      expect(next.step).toBe('Key 2 of 7');
    });

    it('names the wrong key and shows it red', () => {
      const wrong = calibrationPrompt(
        calEvent({
          state: CALIBRATION_STATE.wrongKey,
          currentMidi: 60,
          detectedMidi: 62,
        }),
      );
      expect(wrong.feedback).toEqual({
        tone: 'problem',
        text: 'That was D4. Play C4.',
      });
      expect(wrong.flash).toEqual({ midi: 62, role: 'wrong' });
      expect(wrong.target).toBe(60);
      expect(
        calibrationPrompt(calEvent({ state: CALIBRATION_STATE.notPiano }))
          .feedback?.tone,
      ).toBe('problem');
      expect(
        calibrationPrompt(calEvent({ state: CALIBRATION_STATE.tooShort }))
          .feedback?.text,
      ).toBe('Hold the key down a little longer.');
    });

    it('describes keys and the finished piano in plain words', () => {
      expect(describeKey(60)).toBe('Middle C');
      expect(describeKey(36)).toBe('Two octaves below middle C');
      expect(describeKey(84)).toBe('Two octaves above middle C');
      expect(describeKey(69)).toBe('The A above middle C');
      expect(describeProfile(calibrated(21, 108))).toBe(
        '7 keys measured · tuned 6 cents sharp (A = 441.5 Hz) · Grand or large upright piano',
      );
    });
  });
});
