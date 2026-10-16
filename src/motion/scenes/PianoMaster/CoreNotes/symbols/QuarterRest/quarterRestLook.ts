import type { GlyphFit } from '../../../shared';

/** The quarter rest glyph and how it is fitted to the reference. */
export type QuarterRestLook = GlyphFit & { color: string };

export const LESSON_QUARTER_REST_LOOK: QuarterRestLook = {
  color: '#000000',
  font: 'bravura',
  scaleX: 0.925,
  scaleY: 0.9862,
  dx: -0.2,
  dy: 0.75,
};
