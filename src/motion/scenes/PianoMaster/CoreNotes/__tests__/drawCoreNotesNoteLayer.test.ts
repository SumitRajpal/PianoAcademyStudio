/**
 * Pixel checks of the note layer against the reference design: a duration
 * bar starts under its notehead, and the note to play now never shows its
 * bar through its see-through notehead and stem.
 */

import { AlphaType, ColorType, Skia } from 'react-native-skia';

import {
  drawCoreNotesNoteLayer,
  LESSON_NOTES_LOOK,
  type NoteState,
  type StaffLayout,
} from '..';

const SCALE = 3;
const WIDTH = 120;
const HEIGHT = 100;

/**
 * One A4, in the space below the middle line: its stem's right edge is at
 * x 60 and its centre at y 70, so its notehead's centre is at x 48.1 and
 * its bar runs from y 60.5 to 79.5 (all in points).
 */
const layout: StaffLayout = {
  top: 20,
  left: 0,
  right: WIDTH,
  measureStarts: [0],
  barlines: [],
  firstBeat: 60,
  beat: 67,
  restOffset: 0,
  clef: { x: 0 },
  timeSignature: { x: 0, beats: 4 },
};

/** Draws the note on white paper at 3x; returns its pixels, read in points. */
function renderNote(state: NoteState) {
  const surface = Skia.Surface.MakeRaster(WIDTH * SCALE, HEIGHT * SCALE)!;
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('#FFFFFF'));
  canvas.scale(SCALE, SCALE);
  drawCoreNotesNoteLayer(
    canvas,
    layout,
    {
      items: [
        { kind: 'note', pitch: 'A4', measure: 0, beat: 0, beats: 1, state },
      ],
    },
    LESSON_NOTES_LOOK,
  );
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: WIDTH * SCALE,
    height: HEIGHT * SCALE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  })!;
  return (x: number, y: number) => {
    const i =
      (Math.floor(y * SCALE) * WIDTH * SCALE + Math.floor(x * SCALE)) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
}

describe('drawCoreNotesNoteLayer', () => {
  it('starts a bar under its notehead: no gap below it, nothing above it', () => {
    const pixel = renderNote('normal');
    // Just above the bar's bottom edge, right of the notehead's lowest point.
    const [r, g, b] = pixel(51, 78.75);
    expect((r + g + b) / 3).toBeLessThan(240);
    // Just below the bar's top edge, left of the notehead's highest point.
    expect(pixel(42, 61.5)).toEqual([255, 255, 255]);
  });

  it('shows no bar through the see-through notehead and stem of the note to play now', () => {
    const pixel = renderNote('attention');
    const stemOverBar = pixel(58.25, 62.5);
    const headCentre = pixel(48, 72);
    for (const [r, g, b] of [stemOverBar, headCentre]) {
      // Red over white paper only: no grey from the bar underneath.
      expect(r).toBe(255);
      expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
      expect(g).toBeLessThan(200);
    }
  });
});
