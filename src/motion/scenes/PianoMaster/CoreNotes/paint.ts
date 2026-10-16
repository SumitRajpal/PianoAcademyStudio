/** Small Skia helpers shared by the staff and the notes. */

import { Skia, type SkCanvas, type SkPaint } from 'react-native-skia';

/** An antialiased paint that fills with one colour. */
export function fillPaint(color: string): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  return paint;
}

export function fillRect(
  canvas: SkCanvas,
  paint: SkPaint,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  canvas.drawRect(Skia.XYWHRect(x, y, width, height), paint);
}
