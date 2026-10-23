import { LESSON_NOTATION_INK } from '../../../shared';

/** The line at the start of the staff. `thickness` is in points. */
export type SystemicBarlineLook = { color: string; thickness: number };

export const LESSON_SYSTEMIC_BARLINE_LOOK: SystemicBarlineLook = {
  color: LESSON_NOTATION_INK,
  thickness: 2,
};
