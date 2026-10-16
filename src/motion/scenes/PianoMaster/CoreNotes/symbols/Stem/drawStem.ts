import { Skia, type SkCanvas } from 'react-native-skia';

import { fillPaint } from '../../../shared';
import type { StemLook } from './stemLook';

/** A stem's rectangle: its right edge at `right`, from `top` down to `bottom`. */
export function stemRect(
  right: number,
  top: number,
  bottom: number,
  look: StemLook,
) {
  return Skia.XYWHRect(right - look.thickness, top, look.thickness, bottom - top);
}

/** A stem in its own colour. */
export function drawStem(
  canvas: SkCanvas,
  right: number,
  top: number,
  bottom: number,
  look: StemLook,
) {
  canvas.drawRect(stemRect(right, top, bottom, look), fillPaint(look.color));
}
