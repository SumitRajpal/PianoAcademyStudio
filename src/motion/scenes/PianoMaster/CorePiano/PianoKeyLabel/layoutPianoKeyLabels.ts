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
} from '../../../../../shared/piano';
import type { PianoKeyLabelLook } from './pianoKeyLabelLook';

/**
 * "white": every white key, with the octave on each C.
 * "all": black keys too. "none": no names.
 * A list of notes: only those keys, letter only (as in a lesson hand position).
 */
export type PianoKeyLabels = 'white' | 'all' | 'none' | readonly NoteInput[];

export type PianoKeyLabelLayout = {
  midi: number;
  text: string;
  centerX: number;
  baseline: number;
  size: number;
  color: string;
};

export function layoutPianoKeyLabels(
  rects: readonly KeyRect[],
  mode: PianoKeyLabels,
  look: PianoKeyLabelLook,
  pitch: number,
): PianoKeyLabelLayout[] {
  const size = look.size * pitch;
  if (mode === 'none' || size < look.minSize) {
    return [];
  }
  const blackSize = size * look.black.scale;
  const chosen =
    typeof mode === 'string'
      ? null
      : new Set(mode.map(note => parseNote(note)));
  const labels: PianoKeyLabelLayout[] = [];
  for (const key of rects) {
    const listed = chosen?.has(key.midi) ?? false;
    const wanted = chosen
      ? listed
      : !key.isBlack || (mode === 'all' && blackSize >= look.minSize);
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
        ? bottom - look.black.baseline * pitch
        : bottom - look.baseline * pitch,
      size: key.isBlack ? blackSize : size,
      color: key.isBlack ? look.black.color : look.color,
    });
  }
  return labels;
}
