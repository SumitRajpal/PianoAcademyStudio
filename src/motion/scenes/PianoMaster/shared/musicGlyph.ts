/**
 * Music symbols drawn from SMuFL fonts (Bravura and Leland, in assets/fonts).
 * SMuFL fonts are designed at 4 staff spaces to the em, so a glyph drawn at
 * that size fits the staff; each symbol's look then fits it to the reference
 * design with a scale and an offset.
 */

import {
  Skia,
  type SkCanvas,
  type SkPaint,
  type SkTypeface,
} from 'react-native-skia';

/** The SMuFL music fonts in assets/fonts. */
export type MusicFont = 'bravura' | 'leland';

export type NotationTypefaces = Record<MusicFont, SkTypeface>;

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

/** Draws one SMuFL glyph at its anchor (`x`, `y`), fitted. */
export function drawMusicGlyph(
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
