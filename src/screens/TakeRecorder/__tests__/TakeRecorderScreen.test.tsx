import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  act,
  create as createRenderer,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

import {
  noteEventBus,
  takeRecorder,
  type StoredTake,
  type TakeStats,
  type TakeStatus,
} from '@pianoacademy/core-engine';
import { TAKE_STATUS_POLL_MS, TakeRecorderScreen } from '..';

/** An in-memory stand-in for the native recorder. */
function fakeRecorder() {
  const takes = new Map<string, StoredTake>();
  let open: { id: string; samples: number } | null = null;
  let interruption = '';
  const status = (): TakeStatus => ({
    recording: open != null,
    capturing: open != null && !interruption,
    id: open?.id ?? '',
    samples: open?.samples ?? 0,
    peakDbfs: open ? -12 : -200,
    clippedSamples: 0,
    droppedSamples: 0,
    stopReason: interruption,
  });
  const fake = {
    takes,
    saved: [] as Array<{ id: string; meta: Record<string, unknown> }>,
    advance(samples: number) {
      if (open) open.samples += samples;
    },
    interrupt(reason: string) {
      interruption = reason;
    },
    install() {
      jest.spyOn(takeRecorder, 'isAvailable').mockReturnValue(true);
      jest.spyOn(takeRecorder, 'freeSpaceBytes').mockReturnValue(8 * 1024 ** 3);
      jest.spyOn(takeRecorder, 'device').mockReturnValue({
        model: 'iPhone14,3',
        systemVersion: '26.1.0',
        inputPort: 'iPhone Microphone',
        inputPortType: 'MicrophoneBuiltIn',
        inputDataSource: 'Bottom',
        hardwareSampleRate: 48000,
        ioBufferMs: 5.33,
        inputLatencyMs: 2,
      });
      jest.spyOn(takeRecorder, 'list').mockImplementation(() =>
        [...takes.values()].sort((a, b) => (a.id < b.id ? 1 : -1)),
      );
      jest.spyOn(takeRecorder, 'status').mockImplementation(status);
      jest.spyOn(takeRecorder, 'start').mockImplementation((id: string) => {
        if (open || takes.has(id)) return false;
        open = { id, samples: 0 };
        takes.set(id, { id, bytes: 44, meta: '' });
        return true;
      });
      jest.spyOn(takeRecorder, 'stop').mockImplementation((): TakeStats | null => {
        if (!open) return null;
        const stats: TakeStats = {
          id: open.id,
          samples: open.samples,
          durationSec: open.samples / 48000,
          peakDbfs: -12,
          clippedSamples: 0,
          droppedSamples: 0,
          gapPositions: [],
          gapLengths: [],
          stopReason: interruption,
        };
        takes.set(open.id, { ...takes.get(open.id)!, bytes: 44 + open.samples * 4 });
        open = null;
        interruption = '';
        return stats;
      });
      jest.spyOn(takeRecorder, 'saveMeta').mockImplementation((id: string, meta: object) => {
        fake.saved.push({ id, meta: meta as Record<string, unknown> });
        takes.set(id, { ...takes.get(id)!, meta: JSON.stringify(meta) });
        return true;
      });
      jest.spyOn(takeRecorder, 'remove').mockImplementation((id: string) => takes.delete(id));
    },
  };
  return fake;
}

const metrics = {
  frame: { x: 0, y: 0, width: 932, height: 430 },
  insets: { top: 0, left: 47, right: 47, bottom: 21 },
};

const mounted: ReactTestRenderer[] = [];
function render(onBack = jest.fn()): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = createRenderer(
      <SafeAreaProvider initialMetrics={metrics}>
        <TakeRecorderScreen onBack={onBack} />
      </SafeAreaProvider>,
    );
  });
  mounted.push(renderer);
  return renderer;
}

function textOf(node: ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
}

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  const found = root
    .findAllByType(TouchableOpacity)
    .find(b => b.props.accessibilityLabel === label || textOf(b) === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

function press(root: ReactTestInstance, label: string) {
  act(() => button(root, label).props.onPress());
}

function tick(ms = TAKE_STATUS_POLL_MS) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('TakeRecorderScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    noteEventBus.publishStatus({ state: 'running', message: '' });
  });
  afterEach(() => {
    act(() => mounted.splice(0).forEach(r => r.unmount()));
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('says so when the phone has no recorder', () => {
    jest.spyOn(takeRecorder, 'isAvailable').mockReturnValue(false);
    const root = render().root;
    expect(textOf(root)).toContain('The take recorder needs the iPhone app.');
    expect(root.findAllByType(TouchableOpacity).some(b => b.props.accessibilityLabel === 'Record')).toBe(false);
  });

  it('records a take, shows its counts, and saves its meta.json with them', () => {
    const fake = fakeRecorder();
    fake.install();
    const onBack = jest.fn();
    const root = render(onBack).root;

    press(root, 'Loudness ladder');
    press(root, '2 m');
    press(root, 'Record');
    expect(takeRecorder.start).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d\d-\d\d_\d{6}_ladder$/));
    const id = fake.saved[0].id;
    expect(fake.saved[0].meta).toMatchObject({ take: 'ladder', distance_m: 2, capture: null, phone: 'iPhone14,3' });
    expect(button(root, '‹ Back').props.disabled).toBe(true);

    fake.advance(48000 * 65);
    tick();
    expect(textOf(root)).toContain('Loudness ladder · 1:05');

    press(root, 'Stop');
    const final = fake.saved[fake.saved.length - 1];
    expect(final.id).toBe(id);
    expect(final.meta).toMatchObject({
      take: 'ladder',
      distance_m: 2,
      durationSec: 65,
      capture: { samples: 48000 * 65, droppedSamples: 0, stopReason: '' },
    });
    expect(textOf(root)).toContain(`Saved ${id}: 1:05`);
    expect(button(root, '‹ Back').props.disabled).toBe(false);
    press(root, '‹ Back');
    expect(onBack).toHaveBeenCalled();
  });

  it('closes a take that iOS interrupted and says why', () => {
    const fake = fakeRecorder();
    fake.install();
    const root = render().root;
    press(root, 'Record');
    fake.advance(48000);
    fake.interrupt('route');
    tick();
    expect(takeRecorder.stop).toHaveBeenCalled();
    expect(fake.saved[fake.saved.length - 1].meta).toMatchObject({ capture: { stopReason: 'route', samples: 48000 } });
    expect(textOf(root)).toContain('The microphone changed');
  });

  it("starts from the newest take's conditions", () => {
    const fake = fakeRecorder();
    fake.takes.set('2026-11-05_090000_scales', {
      id: '2026-11-05_090000_scales',
      bytes: 1000,
      meta: JSON.stringify({ take: 'scales', instrument: 'acoustic: hall piano', distance_m: 0.3, pedal: 'down' }),
    });
    fake.install();
    const root = render().root;
    expect(button(root, 'Scales').props.accessibilityState.selected).toBe(true);
    expect(button(root, '0.3 m').props.accessibilityState.selected).toBe(true);
    expect(button(root, 'acoustic').props.accessibilityState.selected).toBe(true);
    expect(button(root, 'down').props.accessibilityState.selected).toBe(true);
  });

  it("won't record without the microphone, and says how to fix it", () => {
    const fake = fakeRecorder();
    fake.install();
    const root = render().root;
    act(() => noteEventBus.publishStatus({ state: 'permissionDenied', message: '' }));
    expect(textOf(root)).toContain('Microphone access is off');
    expect(button(root, 'Record').props.disabled).toBe(true);
  });

  it('deletes a take after asking', () => {
    const fake = fakeRecorder();
    fake.takes.set('2026-11-05_090000_noise', { id: '2026-11-05_090000_noise', bytes: 1000, meta: '' });
    fake.install();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(b => b.style === 'destructive')?.onPress?.();
    });
    const root = render().root;
    press(root, 'Delete 2026-11-05_090000_noise');
    expect(alert).toHaveBeenCalled();
    expect(takeRecorder.remove).toHaveBeenCalledWith('2026-11-05_090000_noise');
    expect(textOf(root)).not.toContain('2026-11-05_090000_noise');
  });
});
