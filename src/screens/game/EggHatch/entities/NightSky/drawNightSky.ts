/**
 * The night sky: a deep blue gradient down to a teal horizon, with a soft haze
 * rising behind the egg and a faint violet wash high up.
 */

import type { SkCanvas } from 'react-native-skia';

import { drawGlow, verticalGradient, type Bounds, type Point } from '../../shared/paperKit';
import { NIGHT_SKY_LOOK, type NightSkyLook } from './nightSkyLook';

export function drawNightSky(
  canvas: SkCanvas,
  bounds: Bounds,
  horizonY: number,
  hazeAt: Point,
  look: NightSkyLook = NIGHT_SKY_LOOK,
) {
  const { x, y, width, height } = bounds;
  canvas.drawRect(
    { x, y, width, height },
    verticalGradient(y, horizonY, look.gradient, look.gradientAt),
  );
  drawGlow(canvas, { x: hazeAt.x - 200, y: y + 40 }, 320, look.wash, look.washAlpha);
  drawGlow(canvas, { x: hazeAt.x + 260, y: y + 70 }, 260, look.wash, look.washAlpha * 0.8);
  drawGlow(canvas, hazeAt, 300, look.haze, look.hazeAlpha);
}
