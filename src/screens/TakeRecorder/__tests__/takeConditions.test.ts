import {
  buildTakeMeta,
  completeTakeMeta,
  conditionsFromMeta,
  DEFAULT_CONDITIONS,
  formatBytes,
  formatDuration,
  formatPeak,
  instrumentLabel,
  takeFolderId,
  TAKES,
  type TakeConditions,
} from '../takeConditions';
import type { TakeDevice, TakeStats } from '@pianoacademy/core-engine';

const device: TakeDevice = {
  model: 'iPhone14,3',
  systemVersion: '26.1.0',
  inputPort: 'iPhone Microphone',
  inputPortType: 'MicrophoneBuiltIn',
  inputDataSource: 'Bottom',
  hardwareSampleRate: 48000,
  ioBufferMs: 5.33,
  inputLatencyMs: 2.1,
};

const stats: TakeStats = {
  id: '2026-11-05_101530_ladder',
  samples: 480000,
  durationSec: 10,
  peakDbfs: -6.2,
  clippedSamples: 0,
  droppedSamples: 512,
  gapPositions: [96000],
  gapLengths: [512],
  stopReason: '',
};

const acoustic: TakeConditions = {
  ...DEFAULT_CONDITIONS,
  take: 'ladder',
  instrument: 'acoustic',
  instrumentName: ' school upright ',
  distanceM: 2,
  placement: 'piano top',
  room: 'echoey',
  roomName: 'hall',
  background: 'speech',
  pedal: 'down',
  note: ' first try ',
};

describe('take conditions', () => {
  it('lists master 5.2 takes that need no backing from the phone', () => {
    expect(TAKES.map(t => t.id)).toEqual([
      'noise',
      'ladder',
      'repetitions',
      'soft-under-loud',
      'scales',
      'chords',
      'trills',
      'glissando',
      'jingle-bells',
      'velocity-sweep',
      'free-playing',
      'harmonic-intervals',
    ]);
  });

  it('names a take folder by its local date and time, then the take', () => {
    expect(takeFolderId(new Date(2026, 10, 5, 9, 5, 7), 'ladder')).toBe('2026-11-05_090507_ladder');
  });

  it('labels the PSR-E343, and each acoustic piano by its name', () => {
    expect(instrumentLabel(DEFAULT_CONDITIONS)).toBe('PSR-E343');
    expect(instrumentLabel(acoustic)).toBe('acoustic: school upright');
    expect(instrumentLabel({ ...acoustic, instrumentName: '  ' })).toBe('acoustic');
  });

  it("builds meta.json with the harness's condition keys and the capture counts", () => {
    const meta = buildTakeMeta({
      conditions: acoustic,
      startedAt: new Date(Date.UTC(2026, 10, 5, 4, 45, 30)),
      device,
      stats,
    });
    expect(meta).toMatchObject({
      version: 1,
      take: 'ladder',
      takeName: 'Loudness ladder',
      date: '2026-11-05T04:45:30.000Z',
      instrument: 'acoustic: school upright',
      phone: 'iPhone14,3',
      distance_m: 2,
      placement: 'piano top',
      room: 'echoey',
      roomName: 'hall',
      background: 'speech',
      pedal: 'down',
      note: 'first try',
      durationSec: 10,
      device,
      capture: {
        sampleRate: 48000,
        format: 'float32',
        samples: 480000,
        peakDbfs: -6.2,
        clippedSamples: 0,
        droppedSamples: 512,
        gaps: [{ position: 96000, length: 512 }],
        stopReason: '',
      },
    });
  });

  it('saves a provisional meta.json at the start, without counts', () => {
    const meta = buildTakeMeta({ conditions: DEFAULT_CONDITIONS, startedAt: new Date(0), device: null, stats: null });
    expect(meta.durationSec).toBeNull();
    expect(meta.capture).toBeNull();
    expect(meta.phone).toBe('');
  });

  it("starts the next take from the last take's conditions, without its note", () => {
    const meta = buildTakeMeta({ conditions: acoustic, startedAt: new Date(0), device, stats });
    expect(conditionsFromMeta(JSON.stringify(meta))).toEqual({
      ...acoustic,
      instrumentName: 'school upright',
      note: '',
    });
  });

  it('finishes the provisional meta.json with the length and the counts', () => {
    const provisional = buildTakeMeta({ conditions: acoustic, startedAt: new Date(0), device, stats: null });
    const done = completeTakeMeta(JSON.stringify(provisional), stats);
    expect(done).toEqual({ ...provisional, durationSec: 10, capture: buildTakeMeta({ conditions: acoustic, startedAt: new Date(0), device, stats }).capture });
    expect(completeTakeMeta('', stats)).toBeNull();
    expect(completeTakeMeta('[1, 2]', stats)).toBeNull();
  });

  it('falls back to the defaults for anything it cannot read', () => {
    expect(conditionsFromMeta('not json')).toEqual(DEFAULT_CONDITIONS);
    expect(conditionsFromMeta('null')).toEqual(DEFAULT_CONDITIONS);
    expect(conditionsFromMeta(JSON.stringify({ take: 'unknown', distance_m: 5, pedal: 'half' }))).toEqual(
      DEFAULT_CONDITIONS,
    );
  });

  it('formats durations, sizes and peaks for the screen', () => {
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatBytes(12.3 * 1024 ** 2)).toBe('12.3 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB');
    expect(formatPeak(-12.34)).toBe('−12.3 dBFS');
    expect(formatPeak(-200)).toBe('silent');
  });
});
