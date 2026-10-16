/**
 * The look of a white key, measured from the reference lesson screen.
 * Sizes are shares of the white key pitch (see shared/pianoLookUnits).
 */

import { pt } from '../../shared';

export type WhitePianoKeyLook = {
  fill: string;
  /** Radius of the two bottom corners. */
  cornerRadius: number;
  /** The soft dark edge inside the key: a blurred stroke. */
  edgeShade: { stroke: number; sigma: number; alpha: number };
};

export const LESSON_WHITE_PIANO_KEY_LOOK: WhitePianoKeyLook = {
  fill: '#FFFFFF',
  cornerRadius: pt(7),
  edgeShade: { stroke: pt(2 / 3), sigma: pt(0.9), alpha: 0.35 },
};
