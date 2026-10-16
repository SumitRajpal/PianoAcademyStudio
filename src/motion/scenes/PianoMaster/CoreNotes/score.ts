/**
 * What the staff shows: notes and rests placed on a beat grid, plus where
 * the bar lines are. Pitches use the shared piano model.
 */

import { parseNote, pitchClass, type NoteInput } from '../../../../shared/piano';

export type NoteState = 'normal' | 'attention';

export type ScoreItem =
  | {
      kind: 'note';
      pitch: NoteInput;
      measure: number;
      /** Beat in the measure, from 0. */
      beat: number;
      beats: number;
      state?: NoteState;
    }
  | { kind: 'rest'; measure: number; beat: number; beats: number };

/** Horizontal layout of the staff, in points from the left of the screen. */
export type StaffLayout = {
  /** Top of the staff (its top line); the staff is 4 spaces tall. */
  top: number;
  /** Where the paper strip and the staff lines start. */
  left: number;
  right: number;
  /** Centre of each bar line; measure i starts at measureStarts[i]. */
  measureStarts: readonly number[];
  /** Bar lines that are drawn (the first measure may have none). */
  barlines: readonly number[];
  /** Distance from a measure start to the stem of its first beat. */
  firstBeat: number;
  beat: number;
  /** Rests sit this far left of their beat's stem position. */
  restOffset: number;
  clef: { x: number };
  timeSignature: { x: number; beats: number };
};

export type Score = { items: readonly ScoreItem[] };

const LETTER_STEPS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

/** Diatonic step of a note: C4 = 28, D4 = 29, E4 = 30 and so on. */
export function diatonicStep(pitch: NoteInput): number {
  const midi = parseNote(pitch);
  return (Math.floor(midi / 12) - 1) * 7 + LETTER_STEPS[pitchClass(midi)];
}

/** E4 sits on the bottom line of a treble staff. */
const TREBLE_BOTTOM_STEP = 30;

/** Vertical centre of a note on a treble staff whose top line is at `top`. */
export function trebleY(pitch: NoteInput, top: number, space: number): number {
  const bottomLine = top + 4 * space;
  return bottomLine - ((diatonicStep(pitch) - TREBLE_BOTTOM_STEP) * space) / 2;
}

/** The stem position (right edge of the head) of a beat. */
export function beatX(layout: StaffLayout, measure: number, beat: number) {
  return layout.measureStarts[measure] + layout.firstBeat + beat * layout.beat;
}

/** Ledger line positions needed by a note on a treble staff. */
export function ledgerLines(
  pitch: NoteInput,
  top: number,
  space: number,
): number[] {
  const step = diatonicStep(pitch);
  const lines: number[] = [];
  // Below the staff: C4 (28), A3 (26) ... ; above: A5 (40), C6 (42) ...
  for (let s = TREBLE_BOTTOM_STEP - 2; s >= step; s -= 2) {
    lines.push(top + 4 * space + ((TREBLE_BOTTOM_STEP - s) * space) / 2);
  }
  for (let s = TREBLE_BOTTOM_STEP + 10; s <= step; s += 2) {
    lines.push(top - ((s - TREBLE_BOTTOM_STEP - 8) * space) / 2);
  }
  return lines;
}
