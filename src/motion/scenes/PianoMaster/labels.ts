/**
 * Which keys show a note name, and where. Pure, so the app (which draws the
 * names as text) and tests (which render them with Skia) place them the same.
 */

import {
  noteLetter,
  octaveOf,
  parseNote,
  pitchClass,
  type KeyRect,
  type NoteInput,
} from '../../../shared/piano';
import type { KeyboardLook } from './keyboardLook';

/**
 * "white": every white key, with the octave on each C.
 * "all": black keys too. "none": no names.
 * A list of notes: only those keys, letter only (as in a lesson hand position).
 */
export type PianoLabels = 'white' | 'all' | 'none' | readonly NoteInput[];

export type KeyLabel = {
  midi: number;
  text: string;
  centerX: number;
  baseline: number;
  size: number;
  color: string;
};

/** Smallest name worth showing, in points. */
const MIN_SIZE = 6;
const BLACK_SCALE = 0.8;

export function keyLabels(
  rects: readonly KeyRect[],
  mode: PianoLabels,
  look: KeyboardLook,
  pitch: number,
): KeyLabel[] {
  const size = look.label.size * pitch;
  if (mode === 'none' || size < MIN_SIZE) {
    return [];
  }
  const chosen =
    typeof mode === 'string'
      ? null
      : new Set(mode.map(note => parseNote(note)));
  const labels: KeyLabel[] = [];
  for (const key of rects) {
    const listed = chosen?.has(key.midi) ?? false;
    const wanted = chosen
      ? listed
      : !key.isBlack || (mode === 'all' && size * BLACK_SCALE >= MIN_SIZE);
    if (!wanted) {
      continue;
    }
    const letter = noteLetter(key.midi);
    const text = key.isBlack
      ? `${letter}♯`
      : !chosen && pitchClass(key.midi) === 0
      ? `${letter}${octaveOf(key.midi)}`
      : letter;
    const bottom = key.y + key.height;
    labels.push({
      midi: key.midi,
      text,
      centerX: key.x + key.width / 2,
      baseline: key.isBlack
        ? bottom - 0.3 * pitch
        : bottom - look.label.baseline * pitch,
      size: key.isBlack ? size * BLACK_SCALE : size,
      color: key.isBlack ? look.label.blackColor : look.label.color,
    });
  }
  return labels;
}
