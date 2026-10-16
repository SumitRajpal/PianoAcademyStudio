import { LESSON_NOTATION_INK } from '../../../shared';

/** A single barline. `thickness` is in points. */
export type BarlineLook = { color: string; thickness: number };

export const LESSON_BARLINE_LOOK: BarlineLook = {
  color: LESSON_NOTATION_INK,
  thickness: 3,
};
