/**
 * A band of soft mist along the forest floor. It is drawn `width` wide and
 * repeats seamlessly, so the scene can slide it sideways forever.
 */

import type { SkCanvas } from 'react-native-skia';

import { blurred, fill, seeded } from '../../shared/paperKit';
import { MIST_LOOK, type MistLook } from './mistLook';

export function drawMist(
  canvas: SkCanvas,
  width: number,
  y: number,
  seed: number,
  look: MistLook = MIST_LOOK,
) {
  const rand = seeded(seed);
  const paint = blurred(fill(look.color, look.alpha), look.softness);
  const puffs = 9;
  for (let i = 0; i < puffs; i++) {
    const x = (i / puffs) * width;
    const rx = rand.range(70, 130);
    const ry = rand.range(12, 24);
    const cy = y + rand.range(-14, 14);
    // Drawn twice, one width apart, so the band wraps without a seam.
    for (const shift of [0, width, -width]) {
      canvas.drawOval({ x: x + shift - rx, y: cy - ry, width: rx * 2, height: ry * 2 }, paint);
    }
  }
}
