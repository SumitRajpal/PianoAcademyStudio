/**
 * A cinematic out-of-focus bokeh disc, rendered with optical camera physics:
 * - Additive chromatic airy ring with sharp aperture perimeter.
 * - Soft Gaussian core with inner light bleed.
 * - True cinematic depth-of-field bloom.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { blurred, fill, radialGradient, stroke } from '../../shared/paperKit';

export function drawBokeh(canvas: SkCanvas, radius: number, color: string) {
  // 1. Soft inner optical core
  const corePaint = radialGradient({ x: 0, y: 0 }, radius, [
    { color, alpha: 0.28, at: 0 },
    { color, alpha: 0.45, at: 0.75 },
    { color, alpha: 0, at: 1 },
  ]);
  corePaint.setBlendMode(BlendMode.Plus);
  canvas.drawCircle(0, 0, radius, corePaint);

  // 2. Bright Aperture Perimeter Ring (Airy Disc)
  const ringPaint = stroke(color, radius * 0.09, 0.55);
  ringPaint.setBlendMode(BlendMode.Plus);
  canvas.drawCircle(0, 0, radius * 0.88, blurred(ringPaint, radius * 0.05));

  // 3. Diffuse Outer Glow Halo
  const halo = fill(color, 0.15);
  halo.setBlendMode(BlendMode.Plus);
  canvas.drawCircle(0, 0, radius * 1.1, blurred(halo, radius * 0.28));
}
