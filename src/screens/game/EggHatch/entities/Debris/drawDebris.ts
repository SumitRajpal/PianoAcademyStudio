/**
 * Debris from an impact, each centred on (0,0):
 * - `drawShellChip`: a small jagged piece of berry shell with a gold rim and a
 *   pale inner face (`variant` 0..2 give different shapes).
 * - `drawSpark`: a short hot streak pointing right; the scene turns it to
 *   its direction of flight.
 */

import { Skia, type SkCanvas } from 'react-native-skia';

import { blurred, fill, seeded, stroke } from '../../shared/paperKit';
import { DEBRIS_LOOK, type DebrisLook } from './debrisLook';

export const SHELL_CHIP_VARIANTS = 3;

export function drawShellChip(canvas: SkCanvas, size: number, variant: number, look: DebrisLook = DEBRIS_LOOK) {
  const rand = seeded(77 + variant * 13);
  const corners = 4 + variant;
  const pts = Array.from({ length: corners }, (_, k) => {
    const a = (k / corners) * Math.PI * 2 + rand.range(-0.3, 0.3);
    const r = size * rand.range(0.55, 1);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8 };
  });
  const chip = Skia.Path.Polygon(pts, true);
  canvas.drawPath(chip, fill(look.chip[variant % look.chip.length]));
  // The pale inside of the shell shows on one edge.
  canvas.save();
  canvas.translate(size * 0.18, size * 0.18);
  canvas.drawPath(chip, fill(look.chipInside, 0.45));
  canvas.restore();
  canvas.drawPath(chip, fill(look.chip[variant % look.chip.length]));
  canvas.drawPath(chip, stroke(look.chipEdge, Math.max(0.5, size * 0.12), 0.9));
}

export function drawSpark(canvas: SkCanvas, length: number, look: DebrisLook = DEBRIS_LOOK) {
  canvas.drawRRect({ rect: { x: -length, y: -1.6, width: length * 1.2, height: 3.2 }, rx: 1.6, ry: 1.6 }, blurred(fill(look.spark, 0.9), 1.6));
  canvas.drawRRect({ rect: { x: -length * 0.6, y: -0.6, width: length * 0.8, height: 1.2 }, rx: 0.6, ry: 0.6 }, fill(look.sparkCore));
}
