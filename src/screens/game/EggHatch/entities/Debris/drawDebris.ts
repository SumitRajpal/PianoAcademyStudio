/**
 * Debris from an impact, rendered in 3D CGI stylized cartoon aesthetic
 * (Pixar / The Incredibles standard):
 * - `drawShellChip`: 3D faceted gemstone shell fragment with ruby translucency,
 *   golden beveled rim, and specular facet glints.
 * - `drawSpark`: high-energy glowing streak with core plasma and radial bloom.
 */

import { BlendMode, BlurStyle, Skia, TileMode, type SkCanvas } from 'react-native-skia';

import { blurred, fill, linearGradient, seeded, stroke } from '../../shared/paperKit';
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

  // 1. Faceted 3D Ruby Shell Fragment Fill
  const chipPaint = linearGradient(
    { x: -size * 0.5, y: -size * 0.5 },
    { x: size * 0.5, y: size * 0.5 },
    ['#ff4d88', look.chip[variant % look.chip.length], '#5e0b2b'],
    [0.0, 0.5, 1.0]
  );
  canvas.drawPath(chip, chipPaint);

  // 2. Beveled Gold / Ivory Interior Shell Edge
  canvas.save();
  canvas.translate(size * 0.15, size * 0.15);
  canvas.drawPath(chip, fill('#ffd073', 0.6));
  canvas.restore();
  canvas.drawPath(chip, chipPaint);

  // 3. Metallic Gold Trim Edge
  const edgePaint = stroke(look.chipEdge, Math.max(0.8, size * 0.12), 0.95);
  canvas.drawPath(chip, edgePaint);

  // 4. Specular Gemstone Glint
  const glint = fill('#ffffff', 0.9);
  glint.setBlendMode(BlendMode.Plus);
  canvas.drawCircle(-size * 0.2, -size * 0.2, Math.max(1, size * 0.15), glint);
}

export function drawSpark(canvas: SkCanvas, length: number, look: DebrisLook = DEBRIS_LOOK) {
  // Luminous bloom halo
  canvas.drawRRect(
    { rect: { x: -length * 1.1, y: -2.5, width: length * 1.4, height: 5.0 }, rx: 2.5, ry: 2.5 },
    blurred(fill(look.spark, 0.85), 2.5)
  );

  // Vibrant core streak
  canvas.drawRRect(
    { rect: { x: -length, y: -1.4, width: length * 1.2, height: 2.8 }, rx: 1.4, ry: 1.4 },
    fill(look.spark)
  );

  // Incandescent white hot center
  canvas.drawRRect(
    { rect: { x: -length * 0.5, y: -0.6, width: length * 0.7, height: 1.2 }, rx: 0.6, ry: 0.6 },
    fill(look.sparkCore)
  );
}
