/**
 * A big out-of-focus firefly centred on (0,0): a soft disc with a slightly
 * brighter rim, the way a lens blurs a point of light.
 */

import type { SkCanvas } from 'react-native-skia';

import { blurred, fill, radialGradient, stroke } from '../../shared/paperKit';

export function drawBokeh(canvas: SkCanvas, radius: number, color: string) {
  canvas.drawCircle(0, 0, radius, radialGradient({ x: 0, y: 0 }, radius, [
    { color, alpha: 0.32, at: 0 },
    { color, alpha: 0.4, at: 0.8 },
    { color, alpha: 0, at: 1 },
  ]));
  canvas.drawCircle(0, 0, radius * 0.86, blurred(stroke(color, radius * 0.1, 0.35), radius * 0.06));
  canvas.drawCircle(0, 0, radius, blurred(fill(color, 0.12), radius * 0.3));
}
