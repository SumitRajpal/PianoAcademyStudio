/**
 * One twinkle group of stars: small dots plus a few four-pointed sparkles,
 * scattered over the upper sky. Different `group` numbers give different
 * scatters, so two groups can fade in and out of step and the sky twinkles.
 */

import type { SkCanvas } from 'react-native-skia';

import { blurred, fill, seeded, type Bounds } from '../../shared/paperKit';
import { sparklePath } from '../../shared/paperShapes';
import { STARS_LOOK, type StarsLook } from './starsLook';

export function drawStars(
  canvas: SkCanvas,
  bounds: Bounds,
  skyBottom: number,
  group: number,
  look: StarsLook = STARS_LOOK,
) {
  const rand = seeded(1201 + group * 97);
  const top = bounds.y + 6;
  const dotPaint = fill(look.dot, 0.9);
  for (let i = 0; i < look.dots; i++) {
    const x = rand.range(bounds.x, bounds.x + bounds.width);
    // More stars near the top, thinning towards the trees.
    const y = top + Math.pow(rand.next(), 1.6) * (skyBottom - top);
    const r = rand.range(0.5, 1.5);
    dotPaint.setAlphaf(rand.range(0.45, 0.95));
    canvas.drawCircle(x, y, r, dotPaint);
  }
  const glow = blurred(fill(look.glow, 0.5), 3);
  const sparkle = fill(look.sparkle);
  for (let i = 0; i < look.sparkles; i++) {
    const x = rand.range(bounds.x + 40, bounds.x + bounds.width - 40);
    const y = top + Math.pow(rand.next(), 1.3) * (skyBottom - top) * 0.8;
    const r = rand.range(3.5, 6.5);
    canvas.drawCircle(x, y, r * 0.7, glow);
    canvas.drawPath(sparklePath({ x, y }, r), sparkle);
  }
}
