import { LESSON_NOTATION_INK } from '../../../shared';

/** The 5 staff lines. Sizes are in points. */
export type StaffLook = {
  color: string;
  /** Distance between two lines: one staff space. */
  space: number;
  lineThickness: number;
};

export const LESSON_STAFF_LOOK: StaffLook = {
  color: LESSON_NOTATION_INK,
  space: 20,
  lineThickness: 1,
};
