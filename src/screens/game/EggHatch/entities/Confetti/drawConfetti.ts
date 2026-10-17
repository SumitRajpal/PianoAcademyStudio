/**
 * One piece of paper confetti centred on (0,0): a strip, a disc or a star
 * (`shape` 0..2) in colour `color`, with a faint lighter fold line.
 */

import type { SkCanvas } from 'react-native-skia';

import { fill, stroke } from '../../shared/paperKit';
import { sparklePath } from '../../shared/paperShapes';

export const CONFETTI_SHAPES = 3;

export function drawConfettiPiece(canvas: SkCanvas, color: string, shape: number, size: number) {
  const paint = fill(color);
  if (shape === 0) {
    canvas.drawRect({ x: -size * 0.35, y: -size, width: size * 0.7, height: size * 2 }, paint);
    canvas.drawLine(0, -size, 0, size, stroke('#ffffff', 0.5, 0.35));
  } else if (shape === 1) {
    canvas.drawCircle(0, 0, size * 0.7, paint);
  } else {
    canvas.drawPath(sparklePath({ x: 0, y: 0 }, size * 1.1, 0.3), paint);
  }
}
