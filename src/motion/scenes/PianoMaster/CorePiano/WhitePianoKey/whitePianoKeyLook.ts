/**
 * The look of a white key, measured from the reference lesson screen.
 * Sizes are shares of the white key pitch (see shared/pianoLookUnits).
 */

import { pt, type PressedPianoKeyFaceLook } from '../../shared';

export type WhitePianoKeyLook = {
  fill: string;
  /** Radius of the two bottom corners. */
  cornerRadius: number;
  /** The soft dark edge inside the key: a blurred stroke. */
  edgeShade: { stroke: number; sigma: number; alpha: number };
  pressed: PressedPianoKeyFaceLook;
};

export const LESSON_WHITE_PIANO_KEY_LOOK: WhitePianoKeyLook = {
  fill: '#FFFFFF',
  cornerRadius: pt(7),
  edgeShade: { stroke: pt(2 / 3), sigma: pt(0.9), alpha: 0.35 },
  pressed: {
    face: [
      [0, -0.09],
      [0.25, 0.12],
      [0.85, 0],
      [1, -0.08],
    ],
    inset: [
      [0, -0.55, 0.45],
      [1, -0.3, 0],
    ],
    insetDepth: pt(5),
    front: [
      [0, 0.2],
      [0.2, -0.13],
      [1, -0.22],
    ],
    frontDepth: pt(1.5),
    edgeWidth: pt(0.8),
    edgeLightness: -0.22,
  },
};
