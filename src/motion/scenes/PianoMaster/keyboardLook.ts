/**
 * The look of the keyboard, measured pixel by pixel from the reference lesson
 * screen (iPhone 15 Plus: 28 white keys across 932 points, keyboard 121.67
 * points tall, so the white key pitch is 33.29 points).
 *
 * Units, so the look holds at any size and range:
 * - widths, radii, blurs and offsets are shares of the white key pitch;
 * - positions along a black key are shares of its length;
 * - the white key top shadow height is a share of the keyboard height.
 */

/** A gradient stop: position from 0 to 1, and a colour. */
export type GradientStop = readonly [position: number, color: string];

export type KeyboardLook = {
  /** Shows through the gaps and the frame around the keys. */
  keybed: string;
  white: {
    fill: string;
    /** Radius of the two bottom corners. */
    cornerRadius: number;
    /** The soft dark edge inside each white key: a blurred stroke. */
    edgeShade: { stroke: number; sigma: number; alpha: number };
  };
  /** Shadow under the keyboard frame, across the top of the white keys. */
  topShadow: { height: number; stops: readonly GradientStop[] };
  black: {
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
    /** Shadow cast on the white keys, blurred more downwards than sideways. */
    shadow: { dy: number; sigmaX: number; sigmaY: number; color: string };
  };
  /** Dots under marked keys; `bottom` is from the key bottom to the dot centre. */
  marker: { color: string; radius: number; bottom: number };
  /** Note names: font size and baseline (above the key bottom). */
  label: { color: string; size: number; baseline: number; blackColor: string };
};

const PITCH = 932 / 28;
const pt = (points: number) => points / PITCH;

export const LESSON_LOOK: KeyboardLook = {
  keybed: '#000000',
  white: {
    fill: '#FFFFFF',
    cornerRadius: pt(7),
    edgeShade: { stroke: pt(2 / 3), sigma: pt(0.9), alpha: 0.35 },
  },
  topShadow: {
    height: 15.23 / 121.667,
    stops: [
      [0, 'rgba(0, 0, 0, 0.5)'],
      [0.07, 'rgba(0, 0, 0, 0.451)'],
      [0.158, 'rgba(0, 0, 0, 0.38)'],
      [0.245, 'rgba(0, 0, 0, 0.337)'],
      [0.376, 'rgba(0, 0, 0, 0.278)'],
      [0.551, 'rgba(0, 0, 0, 0.2)'],
      [0.726, 'rgba(0, 0, 0, 0.122)'],
      [0.902, 'rgba(0, 0, 0, 0.043)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ],
  },
  black: {
    cornerRadius: pt(3.5),
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
    shadow: {
      dy: pt(4.47),
      sigmaX: pt(8.5 / 3),
      sigmaY: pt(4.47),
      color: 'rgba(0, 0, 0, 0.5)',
    },
  },
  marker: { color: '#7F7F7F', radius: pt(3), bottom: pt(31.7 / 3) },
  label: {
    color: '#B1B1B1',
    size: pt(17.5),
    baseline: pt(57.7 / 3),
    blackColor: '#C7C7CC',
  },
};
