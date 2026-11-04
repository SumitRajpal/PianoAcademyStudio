import React, { useEffect } from 'react';
import {
  act,
  create as createRenderer,
  type ReactTestRenderer,
} from 'react-test-renderer';

// Every renderer is unmounted after its test: the hook can poll timing stats on an interval.
const mounted: ReactTestRenderer[] = [];
function create(element: React.ReactElement): ReactTestRenderer {
  const renderer = createRenderer(element);
  mounted.push(renderer);
  return renderer;
}
import { CORE_PIANO_NOTES_DETECTION_LOOK } from '../corePianoNotesDetectionLook';
import {
  createLiveKeysReader,
  detectedKeyLevel,
  readLiveKeys,
  type LiveKeysReader,
} from '../liveKeys';
import { mockAudioEngine } from '../mockAudioEngine';
import { noteEventBus } from '../noteEventBus';
import { CALIBRATION_STATE, type KeySink, type LiveKeys } from '../types';
import { useCorePianoNotesDetection } from '../useCorePianoNotesDetection';

/**
 * A key sink that keeps what it is told, as the screen's key state would:
 * every call in order, and the level each key is held at now.
 */
function recordingSink() {
  const held = new Map<number, number>();
  const calls: (
    | readonly ['press', number, number]
    | readonly ['release', number]
  )[] = [];
  const sink: KeySink = {
    press(midi, level) {
      calls.push(['press', midi, level]);
      held.set(midi, level);
    },
    release(midi) {
      calls.push(['release', midi]);
      held.delete(midi);
    },
  };
  return {
    sink,
    calls,
    /** The level a key is held at, or 0 when it is up. */
    level: (midi: number) => held.get(midi) ?? 0,
    isDown: (midi: number) => held.has(midi),
  };
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
 * The native key table's rules in JS (see cpp/legacy/LiveKeys.h): a version per
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
    // MIDI numbers only: naming the note is the screen's job.
    expect(getResult().latestNote).toEqual({ midi: 60, cents: 2.5 });
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

  it('presses and releases keys through the sink when no key table is shared (the mock engine)', async () => {
    const keys = recordingSink();

    await renderHarness({ keySink: keys.sink });

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

    expect(keys.isDown(64)).toBe(true);
    expect(keys.level(64)).toBe(0.9);

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

    expect(keys.isDown(64)).toBe(false);
    expect(keys.calls).toEqual([
      ['press', 64, 0.9],
      ['release', 64],
    ]);
  });

  it('takes the expected notes as MIDI numbers, and rejects anything else', async () => {
    const { getResult } = await renderHarness({
      expected: [60, 64, 67, 71],
    });

    expect(getResult().expectedMidi).toEqual([60, 64, 67, 71]);

    // Rendering with a number that is not a MIDI note throws, as parseNote did.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHarness({ expected: [60, 128] })).rejects.toThrow(
      RangeError,
    );
    spy.mockRestore();
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
      const keys = recordingSink();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      table.on(60, 1);
      table.on(64, 0);
      readLiveKeys(keys.sink, table.keys, reader, 0);
      expect(keys.level(60)).toBe(1);
      expect(keys.level(64)).toBe(softestLevel); // a soft strike still shows clearly
      table.off(60);
      readLiveKeys(keys.sink, table.keys, reader, 16);
      expect(keys.isDown(60)).toBe(false);
      expect(keys.isDown(64)).toBe(true);
      // The first look gives every key that is down; later looks only what changed.
      expect(keys.calls).toEqual([
        ['press', 60, 1],
        ['press', 64, softestLevel],
        ['release', 60],
      ]);
    });

    it('does nothing while the version stands still', () => {
      const table = fakeLiveKeys();
      const keys = recordingSink();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      table.on(60, 0.5);
      readLiveKeys(keys.sink, table.keys, reader, 0);
      const looked = table.calls.changes;
      readLiveKeys(keys.sink, table.keys, reader, 16);
      readLiveKeys(keys.sink, table.keys, reader, 33);
      expect(table.calls.changes).toBe(looked);
      expect(keys.calls).toHaveLength(1);
    });

    it('shows a key struck and released between two looks, then lets it go', () => {
      const table = fakeLiveKeys();
      const keys = recordingSink();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      readLiveKeys(keys.sink, table.keys, reader, 0);
      table.on(67, 0.8);
      table.off(67);
      readLiveKeys(keys.sink, table.keys, reader); // an early look, between frames
      expect(keys.level(67)).toBeCloseTo(detectedKeyLevel(0.8));
      readLiveKeys(keys.sink, table.keys, reader, shortestLitMs - 1);
      expect(keys.isDown(67)).toBe(true);
      readLiveKeys(keys.sink, table.keys, reader, shortestLitMs + 1);
      expect(keys.isDown(67)).toBe(false);
    });

    it('tries again next frame when a key was being written', () => {
      const table = fakeLiveKeys();
      const keys = recordingSink();
      const reader = fakeShared<LiveKeysReader>(createLiveKeysReader());
      table.on(72, 1);
      table.setBusy(true);
      readLiveKeys(keys.sink, table.keys, reader, 0);
      expect(keys.isDown(72)).toBe(false);
      table.setBusy(false);
      readLiveKeys(keys.sink, table.keys, reader, 16);
      expect(keys.isDown(72)).toBe(true);
    });
  });
});
