/**
 * The moon: a paper crescent with a soft inner shade, casting a small shadow,
 * with a tiny star tucked into its curve. Its halo is drawn separately by
 * `drawMoonHalo` so it can pulse.
 */

import type { SkCanvas } from 'react-native-skia';

import { drawGlow, fill, linearGradient, paperSheet, type Point } from '../../shared/paperKit';
import { crescentPath, sparklePath } from '../../shared/paperShapes';
import { MOON_LOOK, type MoonLook } from './moonLook';

export function drawMoonHalo(
  canvas: SkCanvas,
  center: Point,
  radius: number,
  look: MoonLook = MOON_LOOK,
) {
  drawGlow(canvas, center, radius * 4.2, look.halo, look.haloAlpha);
  drawGlow(canvas, center, radius * 1.9, look.halo, look.haloAlpha * 0.9);
}

export function drawMoon(
  canvas: SkCanvas,
  center: Point,
  radius: number,
  look: MoonLook = MOON_LOOK,
) {
  const path = crescentPath(center, radius, { x: radius * 0.42, y: -radius * 0.22 });
  paperSheet(canvas, { dx: 2, dy: 3, blur: 3, alpha: 0.55 }, c => {
    c.drawPath(
      path,
      linearGradient(
        { x: center.x - radius, y: center.y },
        { x: center.x + radius * 0.4, y: center.y },
        [look.face, look.shade],
      ),
    );
  });
  canvas.drawPath(
    sparklePath({ x: center.x + radius * 0.62, y: center.y + radius * 0.18 }, radius * 0.26),
    fill(look.star),
  );
}
