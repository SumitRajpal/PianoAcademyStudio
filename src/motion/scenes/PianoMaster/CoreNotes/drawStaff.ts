/**
 * Draws the staff with the imperative Skia API, so the same code renders in
 * the app (recorded into a picture) and in tests (rendered to an image): the
 * paper strip, lines, bar lines, clef, time signature and rests, then the
 * playhead. The notes (QuarterNotes) go between the two.
 * Music symbols come from SMuFL fonts (Bravura and Leland); each symbol is
 * placed at its musical anchor and fitted with the look's scale and offset.
 */

import {
  BlurStyle,
  Skia,
  type SkCanvas,
  type SkPaint,
  type SkTypeface,
} from 'react-native-skia';

import { fillPaint, fillRect } from './paint';
import { beatX, type Score, type StaffLayout } from './score';
import type { GlyphFit, MusicFont, StaffLook } from './staffLook';

export type NotationTypefaces = Record<MusicFont, SkTypeface>;

export type Playhead = { x: number; top: number; bottom: number };

/** SMuFL code points. */
const GLYPH = {
  gClef: 0xe050,
  timeSigDigit0: 0xe080,
  restQuarter: 0xe4e5,
};

/** Draws one SMuFL glyph (4 staff spaces to the em) at its anchor, fitted. */
function drawGlyph(
  canvas: SkCanvas,
  typefaces: NotationTypefaces,
  codePoint: number,
  x: number,
  y: number,
  fit: GlyphFit,
  space: number,
  paint: SkPaint,
) {
  canvas.save();
  canvas.translate(x + fit.dx, y + fit.dy);
  canvas.scale(fit.scaleX, fit.scaleY);
  canvas.drawText(
    String.fromCodePoint(codePoint),
    0,
    0,
    paint,
    Skia.Font(typefaces[fit.font], 4 * space),
  );
  canvas.restore();
}

/** The staff with the score's rests; its notes are drawn on top. */
export function drawStaff(
  canvas: SkCanvas,
  layout: StaffLayout,
  score: Score,
  look: StaffLook,
  typefaces: NotationTypefaces,
) {
  const { space } = look;
  const half = look.lineThickness / 2;
  const top = layout.top - half;
  const height = 4 * space + look.lineThickness;
  const width = layout.right - layout.left;
  const ink = fillPaint(look.ink);

  // Paper strip and its soft shadow.
  const shadow = fillPaint(look.shadow.color);
  shadow.setMaskFilter(
    Skia.MaskFilter.MakeBlur(BlurStyle.Normal, look.shadow.sigma, true),
  );
  fillRect(canvas, shadow, layout.left, top, width, height);
  fillRect(canvas, fillPaint(look.paper), layout.left, top, width, height);

  for (let line = 0; line < 5; line++) {
    fillRect(
      canvas,
      ink,
      layout.left,
      layout.top + line * space - half,
      width,
      look.lineThickness,
    );
  }
  fillRect(canvas, ink, layout.left, top, look.border, height);
  for (const x of layout.barlines) {
    fillRect(canvas, ink, x - look.barline / 2, top, look.barline, height);
  }

  // Clef on the G line, then the time signature centred on lines 2 and 4.
  drawGlyph(
    canvas,
    typefaces,
    GLYPH.gClef,
    layout.clef.x,
    layout.top + 3 * space,
    look.clef,
    space,
    ink,
  );
  drawGlyph(
    canvas,
    typefaces,
    GLYPH.timeSigDigit0 + layout.timeSignature.beats,
    layout.timeSignature.x,
    layout.top + space,
    look.timeSignature,
    space,
    ink,
  );
  drawGlyph(
    canvas,
    typefaces,
    GLYPH.timeSigDigit0 + 4,
    layout.timeSignature.x,
    layout.top + 3 * space,
    look.timeSignature,
    space,
    ink,
  );

  // Rests, on the centre line.
  const restPaint = fillPaint(look.rest.color);
  for (const item of score.items) {
    if (item.kind === 'rest') {
      drawGlyph(
        canvas,
        typefaces,
        GLYPH.restQuarter,
        beatX(layout, item.measure, item.beat) - layout.restOffset,
        layout.top + 2 * space,
        look.rest,
        space,
        restPaint,
      );
    }
  }
}

/** The playhead, a rounded line drawn over the notes. */
export function drawPlayhead(
  canvas: SkCanvas,
  playhead: Playhead,
  look: StaffLook,
) {
  const end = look.playhead.width / 2;
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(
        playhead.x,
        playhead.top,
        look.playhead.width,
        playhead.bottom - playhead.top,
      ),
      end,
      end,
    ),
    fillPaint(look.playhead.color),
  );
}
