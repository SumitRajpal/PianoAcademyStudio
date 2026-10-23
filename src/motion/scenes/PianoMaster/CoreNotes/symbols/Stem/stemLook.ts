import { LESSON_NOTATION_INK } from '../../../shared';

/** A stem. `thickness` is in points. */
export type StemLook = {
  color: string;
  thickness: number;
  /** From the note's centre to the stem's top, in staff spaces. */
  length: number;
};

export const LESSON_STEM_LOOK: StemLook = {
  color: LESSON_NOTATION_INK,
  thickness: 3.5,
  length: 3.475,
};
