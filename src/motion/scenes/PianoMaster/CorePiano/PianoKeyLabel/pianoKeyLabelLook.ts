import { pt } from '../../shared';

/**
 * Note names. Sizes and baselines are shares of the white key pitch, and
 * baselines are measured up from the key bottom. `minSize` is in points.
 */
export type PianoKeyLabelLook = {
  color: string;
  size: number;
  baseline: number;
  /** Smallest name worth showing, in points; smaller names are hidden. */
  minSize: number;
  /** Names on black keys; `scale` is their size as a share of `size`. */
  black: { color: string; scale: number; baseline: number };
};

export const LESSON_PIANO_KEY_LABEL_LOOK: PianoKeyLabelLook = {
  color: '#B1B1B1',
  size: pt(17.5),
  baseline: pt(57.7 / 3),
  minSize: 6,
  black: { color: '#C7C7CC', scale: 0.8, baseline: 0.3 },
};
