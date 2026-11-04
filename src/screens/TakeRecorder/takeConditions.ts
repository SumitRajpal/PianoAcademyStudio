/**
 * The conditions of master 5.2 that each take records, its folder name, and
 * its meta.json, in the shape the harness reads (docs/harness.md).
 */

import type { TakeDevice, TakeStats } from '@pianoacademy/core-engine';

/**
 * Master 5.2's takes. "Backing alone" (13) and the practice half of take 9
 * need the app to play the backing song, which comes later.
 */
export const TAKES = [
  { id: 'noise', name: 'Noise', detail: '60 s of silence, then 60 s each of speech, TV or music, claps, whistling, coughing and knocks' },
  { id: 'ladder', name: 'Loudness ladder', detail: '6 keys across the keyboard, ppp to ff, 3 strikes each, 2 s apart' },
  { id: 'repetitions', name: 'Repetitions', detail: 'a bass, a middle and a treble key at 2, 4, 6 and 8 notes a second' },
  { id: 'soft-under-loud', name: 'Soft under loud', detail: 'hold a loud C3; soft notes 1, 2, 4, 7, 12 and 19 semitones above' },
  { id: 'scales', name: 'Scales', detail: 'two octaves legato, staccato and pedalled, at 60, 90 and 120 BPM' },
  { id: 'chords', name: 'Chords', detail: 'triads in three registers, octaves, minor-second clusters, 6-note chords' },
  { id: 'trills', name: 'Trills', detail: 'C4–D4 and C4–C♯4 at 8 and 12 notes a second, 3 s each' },
  { id: 'glissando', name: 'Glissando', detail: 'white keys, up and down' },
  { id: 'jingle-bells', name: 'Jingle Bells chorus', detail: 'learning mode, no backing' },
  { id: 'velocity-sweep', name: 'Velocity sweep', detail: 'digital only: one key, 20 strikes from softest to loudest' },
  { id: 'free-playing', name: 'Free playing', detail: '2 minutes of improvisation' },
  { id: 'harmonic-intervals', name: 'Harmonic intervals', detail: 'octave, twelfth and double octave above C2 and C3, together and 30 ms apart' },
] as const;

export type TakeId = (typeof TAKES)[number]['id'];

export const CONDITION_OPTIONS = {
  instrument: ['PSR-E343', 'acoustic'] as const,
  distanceM: [0.3, 1, 2] as const,
  placement: ['music stand', 'piano top', 'table'] as const,
  room: ['small', 'echoey'] as const,
  background: ['quiet', 'speech', 'TV or music'] as const,
  pedal: ['up', 'down'] as const,
};

export type TakeConditions = {
  take: TakeId;
  instrument: (typeof CONDITION_OPTIONS.instrument)[number];
  /** An acoustic piano's name, such as "school upright". */
  instrumentName: string;
  distanceM: (typeof CONDITION_OPTIONS.distanceM)[number];
  placement: (typeof CONDITION_OPTIONS.placement)[number];
  room: (typeof CONDITION_OPTIONS.room)[number];
  roomName: string;
  background: (typeof CONDITION_OPTIONS.background)[number];
  pedal: (typeof CONDITION_OPTIONS.pedal)[number];
  note: string;
};

export const DEFAULT_CONDITIONS: TakeConditions = {
  take: 'noise',
  instrument: 'PSR-E343',
  instrumentName: '',
  distanceM: 1,
  placement: 'music stand',
  room: 'small',
  roomName: '',
  background: 'quiet',
  pedal: 'up',
  note: '',
};

export function takeName(id: string): string {
  return TAKES.find(t => t.id === id)?.name ?? id;
}

const two = (n: number) => String(n).padStart(2, '0');

/** A take's folder name: its local date and time, then the take, such as "2026-11-05_101530_ladder". */
export function takeFolderId(at: Date, take: TakeId): string {
  const date = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `${date}_${time}_${take}`;
}

/** The instrument as the harness groups it: the PSR-E343, or each acoustic piano by its name. */
export function instrumentLabel(c: TakeConditions): string {
  if (c.instrument === 'PSR-E343') return 'PSR-E343';
  const name = c.instrumentName.trim();
  return name ? `acoustic: ${name}` : 'acoustic';
}

export type TakeMeta = ReturnType<typeof buildTakeMeta>;

/**
 * meta.json for a take. Without counts it is the provisional file saved when
 * the take starts, so a take cut short by a crash still says what it was.
 */
export function buildTakeMeta(input: {
  conditions: TakeConditions;
  startedAt: Date;
  device: TakeDevice | null;
  stats: TakeStats | null;
}) {
  const { conditions: c, startedAt, device, stats } = input;
  return {
    version: 1,
    take: c.take,
    takeName: takeName(c.take),
    date: startedAt.toISOString(),
    instrument: instrumentLabel(c),
    phone: device?.model ?? '',
    distance_m: c.distanceM,
    placement: c.placement,
    room: c.room,
    roomName: c.roomName.trim(),
    background: c.background,
    pedal: c.pedal,
    note: c.note.trim(),
    durationSec: stats?.durationSec ?? null,
    device,
    capture: stats ? captureOf(stats) : null,
  };
}

/** The capture's counts, as meta.json keeps them. */
export function captureOf(stats: TakeStats) {
  return {
    sampleRate: 48000,
    format: 'float32',
    samples: stats.samples,
    peakDbfs: stats.peakDbfs,
    clippedSamples: stats.clippedSamples,
    droppedSamples: stats.droppedSamples,
    gaps: stats.gapPositions.map((position, i) => ({ position, length: stats.gapLengths[i] ?? 0 })),
    stopReason: stats.stopReason,
  };
}

/**
 * The finished meta.json: the provisional one saved when the take started,
 * with the length and the counts added. That works after a JS reload too,
 * when the screen no longer remembers the take. Null if the provisional file
 * can't be read.
 */
export function completeTakeMeta(provisionalJson: string, stats: TakeStats): Record<string, unknown> | null {
  let meta: unknown;
  try {
    meta = JSON.parse(provisionalJson);
  } catch {
    return null;
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null;
  return { ...(meta as Record<string, unknown>), durationSec: stats.durationSec, capture: captureOf(stats) };
}

const pick = <T>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/** The conditions a take recorded, to start the next one from; anything unreadable falls back to the defaults. */
export function conditionsFromMeta(metaJson: string): TakeConditions {
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return DEFAULT_CONDITIONS;
  }
  if (typeof meta !== 'object' || meta === null) return DEFAULT_CONDITIONS;
  const d = DEFAULT_CONDITIONS;
  const instrumentText = typeof meta.instrument === 'string' ? meta.instrument : '';
  const acoustic = instrumentText.startsWith('acoustic');
  return {
    take: pick(TAKES.map(t => t.id), meta.take, d.take),
    instrument: acoustic ? 'acoustic' : 'PSR-E343',
    instrumentName: acoustic ? instrumentText.replace(/^acoustic:?\s*/, '') : '',
    distanceM: pick(CONDITION_OPTIONS.distanceM, meta.distance_m, d.distanceM),
    placement: pick(CONDITION_OPTIONS.placement, meta.placement, d.placement),
    room: pick(CONDITION_OPTIONS.room, meta.room, d.room),
    roomName: typeof meta.roomName === 'string' ? meta.roomName : '',
    background: pick(CONDITION_OPTIONS.background, meta.background, d.background),
    pedal: pick(CONDITION_OPTIONS.pedal, meta.pedal, d.pedal),
    note: '',
  };
}

/** "1:05" from seconds. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

/** "12.3 MB" from bytes. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** "−12.3 dBFS", or "silent". */
export function formatPeak(dbfs: number): string {
  return dbfs <= -150 ? 'silent' : `${dbfs < 0 ? '−' : ''}${Math.abs(dbfs).toFixed(1)} dBFS`;
}

/** Why a take stopped on its own, for the screen. */
export const STOP_REASONS: Record<string, string> = {
  interrupted: 'A call, Siri or another app took the microphone, so the take stopped. It keeps what it had.',
  route: 'The microphone changed (headphones or Bluetooth), so the take stopped. It keeps what it had.',
  background: 'The app left the screen, so the take stopped. It keeps what it had.',
  'write-error': 'The phone could not write the take (storage full?). It keeps what was written.',
  'too-long': 'The take reached the WAV limit of about 6 hours.',
};
