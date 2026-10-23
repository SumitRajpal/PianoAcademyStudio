import { LESSON_NOTATION_INK, type GlyphFit } from '../../../shared';

/** The treble clef glyph and how it is fitted to the reference. */
export type TrebleClefLook = GlyphFit & { color: string };

export const LESSON_TREBLE_CLEF_LOOK: TrebleClefLook = {
  color: LESSON_NOTATION_INK,
  font: 'leland',
  scaleX: 0.9903,
  scaleY: 0.9685,
  dx: 0,
  dy: -0.808,
};
