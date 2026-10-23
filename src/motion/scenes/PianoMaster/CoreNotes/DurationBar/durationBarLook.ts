/**
 * The bar showing how long to hold a note. Sizes are in points. It starts
 * `start` left of the notehead's centre and ends `end` after the stem. Its
 * rounded end stays under the notehead: further left it shows above the
 * notehead's top-left edge, further right it leaves a gap under the
 * notehead's bottom-right edge.
 */
export type DurationBarLook = {
  start: number;
  height: number;
  end: number;
  /** Fill colours at the top and the bottom of the bar. */
  top: string;
  bottom: string;
  stroke: number;
  strokeColor: string;
  /**
   * The bar of the note to play now fades in from the notehead: its opacity
   * rises from `fadeFrom` at the notehead's left edge to full over
   * `fadeLength`, so the staff line under it stays dark.
   */
  attention: { fadeFrom: number; fadeLength: number };
};

export const LESSON_DURATION_BAR_LOOK: DurationBarLook = {
  start: 25 / 3,
  height: 19,
  end: 117 / 3,
  top: 'rgba(0, 0, 0, 0.215)',
  bottom: 'rgba(0, 0, 0, 0.33)',
  stroke: 1,
  strokeColor: 'rgba(0, 0, 0, 0.19)',
  attention: { fadeFrom: 0.42, fadeLength: 131 / 3 },
};
