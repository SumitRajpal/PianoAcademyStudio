import { Skia, type SkCanvas, type SkPaint } from 'react-native-skia';

import { fillPaint } from '../../../shared';
import type { NoteheadLook } from './noteheadLook';

/**
 * Where the turned oval's rightmost point is, from its centre: `right`
 * sideways and `attach` up or down. A stem meets the notehead there.
 */
export function noteheadGeometry({ rx, ry, rotation }: NoteheadLook) {
  const turn = (rotation * Math.PI) / 180;
  const t = Math.atan2(-ry * Math.sin(turn), rx * Math.cos(turn));
  return {
    right:
      rx * Math.cos(t) * Math.cos(turn) - ry * Math.sin(t) * Math.sin(turn),
    attach:
      rx * Math.cos(t) * Math.sin(turn) + ry * Math.sin(t) * Math.cos(turn),
  };
}

/** The notehead's oval centred on (`x`, `y`), filled with `paint`. */
export function fillNoteheadShape(
  canvas: SkCanvas,
  x: number,
  y: number,
  { rx, ry, rotation }: NoteheadLook,
  paint: SkPaint,
) {
  canvas.save();
  canvas.translate(x, y);
  canvas.rotate(rotation, 0, 0);
  canvas.drawOval(Skia.XYWHRect(-rx, -ry, 2 * rx, 2 * ry), paint);
  canvas.restore();
}

/** A notehead centred on (`x`, `y`), in its own colour. */
export function drawNotehead(
  canvas: SkCanvas,
  x: number,
  y: number,
  look: NoteheadLook,
) {
  fillNoteheadShape(canvas, x, y, look, fillPaint(look.color));
}
