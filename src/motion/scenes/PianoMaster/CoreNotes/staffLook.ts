/**
 * The look of the staff, measured from the reference lesson screen
 * (iPhone 15 Plus). All sizes are in points; one staff space is 20 points.
 */

/** The SMuFL music fonts in assets/fonts. */
export type MusicFont = 'bravura' | 'leland';

/**
 * How a glyph is fitted: its font, its scale relative to the standard size
 * (4 staff spaces to the em), and its offset from its musical anchor.
 */
export type GlyphFit = {
  font: MusicFont;
  scaleX: number;
  scaleY: number;
  dx: number;
  dy: number;
};

export type StaffLook = {
  /** Distance between two staff lines. */
  space: number;
  lineThickness: number;
  /** Lines, bar lines, clef, time signature, note heads and stems. */
  ink: string;
  paper: string;
  /** Soft shadow around the paper strip. */
  shadow: { sigma: number; color: string };
  /** Thick line at the start of the staff. */
  border: number;
  barline: number;
  stem: { thickness: number; length: number };
  ledger: { thickness: number; extension: number };
  /**
   * Note heads are ellipses: radii `rx` and `ry`, turned by `rotation`
   * degrees and centred on the note's staff position. The head's rightmost
   * point is the stem's right edge, and the stem ends at that point's height.
   */
  head: { rx: number; ry: number; rotation: number };
  /** On the G line. */
  clef: GlyphFit;
  /** Centred on lines 2 and 4. */
  timeSignature: GlyphFit;
  /** On the centre line. */
  rest: GlyphFit & { color: string };
  /**
   * The bar showing how long to hold a note. It starts `start` left of the
   * head's centre and ends `end` after the stem. Its rounded end stays under
   * the head: further left it shows above the head's top-left edge, further
   * right it leaves a gap under the head's bottom-right edge.
   */
  duration: {
    start: number;
    height: number;
    end: number;
    top: string;
    bottom: string;
    stroke: number;
    strokeColor: string;
  };
  /**
   * The note to play now: head and stem as one see-through `color` shape,
   * its opacity rising from `fromAlpha` at the head's left edge to
   * `toAlpha` at the stem. Its bar fades in from the head: the bar's opacity
   * rises from `fadeFrom` at the head's left edge to full over `fadeLength`,
   * so the staff line under it stays dark.
   */
  attention: {
    color: string;
    fromAlpha: number;
    toAlpha: number;
    fadeFrom: number;
    fadeLength: number;
  };
  playhead: { width: number; color: string };
};

export const LESSON_STAFF: StaffLook = {
  space: 20,
  lineThickness: 1,
  ink: '#3A3B3D',
  paper: '#FFFFFF',
  shadow: { sigma: 15, color: 'rgba(0, 0, 0, 0.19)' },
  border: 2,
  barline: 3,
  stem: { thickness: 3.5, length: 3.475 },
  ledger: { thickness: 1, extension: 7.9 / 3 },
  head: { rx: 38.4 / 3, ry: 25 / 3, rotation: -28.75 },
  clef: { font: 'leland', scaleX: 0.9903, scaleY: 0.9685, dx: 0, dy: -0.808 },
  timeSignature: {
    font: 'bravura',
    scaleX: 0.937,
    scaleY: 1.0083,
    dx: 0,
    dy: 0.168,
  },
  rest: {
    font: 'bravura',
    scaleX: 0.925,
    scaleY: 0.9862,
    dx: -0.2,
    dy: 0.75,
    color: '#000000',
  },
  duration: {
    start: 25 / 3,
    height: 19,
    end: 117 / 3,
    top: 'rgba(0, 0, 0, 0.215)',
    bottom: 'rgba(0, 0, 0, 0.33)',
    stroke: 1,
    strokeColor: 'rgba(0, 0, 0, 0.19)',
  },
  attention: {
    color: '#FF0000',
    fromAlpha: 0.34,
    toAlpha: 0.68,
    fadeFrom: 0.42,
    fadeLength: 131 / 3,
  },
  playhead: { width: 8, color: 'rgba(54, 54, 54, 0.254)' },
};
