/**
 * Detected keys onto a PianoState on the UI thread, read straight from the
 * engine's key table: no JS thread in between, no queue and no React render.
 *
 * Two things run the same reader, whichever comes first:
 * - every frame, on the UI thread, so a key shows within one frame however
 *   busy the JS thread is;
 * - just after the engine wakes JS with new notes, when JS is free, so the
 *   key can show before that frame.
 * A look costs one number compared while nothing changed, and O(keys that
 * changed) otherwise, so running it every frame is free.
 */

import { useCallback, useEffect } from 'react';
import {
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import { pressKey, releaseKey, type PianoState } from '../shared/pianoState';
import { CORE_PIANO_NOTES_DETECTION_LOOK } from './corePianoNotesDetectionLook';
import { noteEventBus } from './noteEventBus';
import { getLiveKeys } from './pianoEngine';
import type { LiveKeys } from './types';

/** What a reader remembers between looks. Used on the UI thread only. */
export type LiveKeysReader = {
  /** The key table version already applied; -1 before the first look. */
  seen: number;
  /** Time of the latest frame, in ms. */
  now: number;
  /** Keys lit only because they were struck and released between two looks: [midi, lit until (ms), ...]. */
  short: number[];
};

const { softestLevel, shortestLitMs } = CORE_PIANO_NOTES_DETECTION_LOOK.keys;

export function createLiveKeysReader(): LiveKeysReader {
  return { seen: -1, now: 0, short: [] };
}

/** How strongly a detected key lights: soft strikes still show clearly. */
export function detectedKeyLevel(velocity: number): number {
  'worklet';
  return softestLevel + (1 - softestLevel) * Math.min(1, Math.max(0, velocity));
}

/**
 * Applies to `state` what changed in `keys` since this reader last looked.
 * Pass `frameMs` from a frame callback. A look without it (between frames)
 * lights keys too, but only a frame lets a short key go, so every strike is
 * drawn at least once. A worklet.
 */
export function readLiveKeys(
  state: PianoState,
  keys: LiveKeys,
  reader: SharedValue<LiveKeysReader>,
  frameMs?: number,
): void {
  'worklet';
  reader.modify(r => {
    'worklet';
    if (frameMs !== undefined) {
      r.now = frameMs;
      if (r.short.length > 0) {
        const kept: number[] = [];
        for (let i = 0; i < r.short.length; i += 2) {
          const midi = r.short[i];
          if (frameMs < r.short[i + 1]) {
            kept.push(midi, r.short[i + 1]);
          } else if (!keys.isDown(midi)) {
            releaseKey(state, midi);
          }
        }
        r.short = kept;
      }
    }
    if (keys.version === r.seen) {
      return r;
    }
    const changes = keys.changes(r.seen);
    if (changes === null) {
      return r; // a key was being written: the next look gets it
    }
    r.seen = changes[0];
    for (let i = 1; i < changes.length; i += 4) {
      const midi = changes[i];
      const down = changes[i + 1] === 1;
      if (down || changes[i + 3] === 1) {
        pressKey(state, midi, detectedKeyLevel(changes[i + 2]));
        if (!down) {
          r.short.push(midi, r.now + shortestLitMs);
        }
      } else {
        releaseKey(state, midi);
      }
    }
    return r;
  }, false);
}

/** The native key table, or null with the mock engine. Fixed for the life of the app. */
const NATIVE_KEYS = getLiveKeys();

function useNativeLiveKeys(pianoState?: PianoState): LiveKeys | null {
  const keys = NATIVE_KEYS!;
  const reader = useSharedValue(createLiveKeysReader());

  const onFrame = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      if (pianoState) {
        readLiveKeys(pianoState, keys, reader, frame.timestamp);
      }
    },
    [keys, pianoState, reader],
  );
  useFrameCallback(onFrame, pianoState !== undefined);

  // The engine woke JS with new notes: look now rather than at the next
  // frame. One look per JS task, however many notes the batch holds.
  useEffect(() => {
    if (!pianoState) {
      return;
    }
    const lookNow = () => {
      'worklet';
      readLiveKeys(pianoState, keys, reader);
    };
    let queued = false;
    return noteEventBus.subscribeNote(() => {
      if (queued) {
        return;
      }
      queued = true;
      scheduleOnUI(lookNow);
      queueMicrotask(() => {
        queued = false;
      });
    });
  }, [keys, pianoState, reader]);

  return keys;
}

function useNoLiveKeys(): LiveKeys | null {
  return null;
}

/**
 * Lights the keys of `pianoState` that the engine detects, on the UI thread.
 * Returns the key table, for O(1) reads from JS (`keys.isDown(60)`), or null
 * with the mock engine (Jest): a JS object cannot be shared with the UI
 * thread, so callers then press keys from the event bus instead. Which one
 * is decided once, so every render runs the same hooks.
 */
export const useLiveKeys: (pianoState?: PianoState) => LiveKeys | null =
  NATIVE_KEYS ? useNativeLiveKeys : useNoLiveKeys;
