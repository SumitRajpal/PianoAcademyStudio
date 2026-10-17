/**
 * The look of a black key, measured from the reference lesson screen.
 * Widths, radii and offsets are shares of the white key pitch (see
 * shared/pianoLookUnits); positions along the key are shares of its length.
 */

import {
  pt,
  type GradientStop,
  type PianoKeyLightStop,
  type PressedPianoKeyFaceLook,
} from '../../shared';

export type BlackPianoKeyLook = {
  cornerRadius: number;
  /** Body colour from the top of the key to its bottom. */
  body: readonly GradientStop[];
  /** The lighter top face, inset from the sides; `bottom` is where it ends. */
  panel: {
    left: number;
    right: number;
    bottom: number;
    radius: number;
    stops: readonly GradientStop[];
  };
  /** Light catching the left edge of the top face, over the panel length. */
  highlight: { left: number; width: number; stops: readonly GradientStop[] };
  /** Darkening along the right edge of the top face. */
  rightBevel: { width: number; color: string };
  /** Faint light just below the top face, over the panel length's end. */
  reflection: {
    left: number;
    right: number;
    height: number;
    stops: readonly GradientStop[];
  };
  /** The rounded lip at the front of the key. */
  lip: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    radius: number;
    stops: readonly GradientStop[];
  };
  pressed: PressedPianoKeyFaceLook & {
    body: readonly PianoKeyLightStop[];
    /** A longer face leaves less raised front visible than the resting key. */
    panelBottom: number;
  };
};

export const LESSON_BLACK_PIANO_KEY_LOOK: BlackPianoKeyLook = {
  cornerRadius: pt(3.5),
  pressed: {
    body: [
      [0, -0.8],
      [1, -0.55],
    ],
    panelBottom: 0.96,
    face: [
      [0, -0.18],
      [0.3, -0.03],
      [0.82, 0.12],
      [1, -0.04],
    ],
    inset: [
      [0, -0.65, 0.6],
      [1, -0.35, 0],
    ],
    insetDepth: pt(4),
    front: [
      [0, 0.18],
      [0.2, -0.18],
      [1, -0.32],
    ],
    frontDepth: pt(1.8),
    edgeWidth: pt(0.65),
    edgeLightness: -0.32,
  },
  body: [
    [0, '#0B0B0B'],
    [0.18, '#131313'],
    [0.42, '#1B1B1B'],
    [0.66, '#212121'],
    [0.83, '#252525'],
    [1, '#282828'],
  ],
  panel: {
    left: pt(9.25 / 3),
    right: pt(9.25 / 3),
    bottom: 179.5 / 209.5,
    radius: pt(1),
    stops: [
      [0, '#0A0A0A'],
      [0.11, '#131313'],
      [0.21, '#2C2C2C'],
      [0.31, '#414141'],
      [0.41, '#505050'],
      [0.51, '#5D5D5D'],
      [0.61, '#6D6D6D'],
      [0.71, '#7A7A7A'],
      [0.81, '#878787'],
      [0.88, '#8D8D8D'],
      [0.93, '#848484'],
      [0.97, '#757575'],
      [1, '#6C6C6C'],
    ],
  },
  highlight: {
    left: pt(3.45),
    width: pt(1.2),
    stops: [
      [0, 'rgba(255, 255, 255, 0)'],
      [0.38, 'rgba(255, 255, 255, 0)'],
      [0.49, 'rgba(255, 255, 255, 0.06)'],
      [0.77, 'rgba(255, 255, 255, 0.28)'],
      [0.88, 'rgba(255, 255, 255, 0.45)'],
      [1, 'rgba(255, 255, 255, 0.58)'],
    ],
  },
  rightBevel: { width: pt(1.5), color: 'rgba(0, 0, 0, 0.45)' },
  reflection: {
    left: pt(4.6),
    right: pt(5.65),
    height: pt(2),
    stops: [
      [0, 'rgba(255, 255, 255, 0.12)'],
      [1, 'rgba(255, 255, 255, 0)'],
    ],
  },
  lip: {
    left: pt(3.45),
    right: pt(3.15),
    top: 193.5 / 209.5,
    bottom: 205 / 209.5,
    radius: pt(4 / 3),
    stops: [
      [0, '#4D4D4D'],
      [0.25, '#515151'],
      [0.6, '#424242'],
      [1, '#333333'],
    ],
  },
};
