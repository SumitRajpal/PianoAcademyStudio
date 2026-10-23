import { LESSON_NOTATION_INK, type GlyphFit } from '../../../shared';

/** The time signature digits and how they are fitted to the reference. */
export type TimeSignatureLook = GlyphFit & { color: string };

export const LESSON_TIME_SIGNATURE_LOOK: TimeSignatureLook = {
  color: LESSON_NOTATION_INK,
  font: 'bravura',
  scaleX: 0.937,
  scaleY: 1.0083,
  dx: 0,
  dy: 0.168,
};
