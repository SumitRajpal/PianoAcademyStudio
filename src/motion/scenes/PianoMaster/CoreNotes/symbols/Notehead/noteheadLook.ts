import { LESSON_NOTATION_INK } from '../../../shared';

/**
 * A filled notehead, the oval of a quarter note. It is an ellipse rather
 * than a font glyph, fitted to the reference: radii `rx` and `ry` in points,
 * turned by `rotation` degrees.
 */
export type NoteheadLook = {
  color: string;
  rx: number;
  ry: number;
  rotation: number;
};

export const LESSON_NOTEHEAD_LOOK: NoteheadLook = {
  color: LESSON_NOTATION_INK,
  rx: 38.4 / 3,
  ry: 25 / 3,
  rotation: -28.75,
};
