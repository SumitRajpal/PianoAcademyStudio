/**
 * One drifting leaf, rendered in 3D CGI stylized cartoon aesthetic
 * (Pixar / The Incredibles standard):
 * - Volumetric leaf curvature with directional lighting from base to tip.
 * - Subsurface scattering rim light along the leaf margin.
 * - Dimensional midrib with subtle specular highlight.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { fill, linearGradient, stroke } from '../../shared/paperKit';
import { leafPath, leafVeinPath } from '../../shared/paperShapes';
import { FALLING_LEAF_LOOK, type FallingLeafLook } from './fallingLeafLook';

export function drawFallingLeaf(canvas: SkCanvas, size: number, variant: number, look: FallingLeafLook = FALLING_LEAF_LOOK) {
  const base = { x: 0, y: size / 2 };
  const leafP = leafPath(base, size, size * 0.42, -90, 0.3);
  const color = look.leaves[variant % look.leaves.length];

  // 1. Volumetric Surface Gradient
  const leafPaint = linearGradient(
    { x: 0, y: size / 2 },
    { x: 0, y: -size / 2 },
    [color, '#5ce6c2', color],
    [0.0, 0.5, 1.0]
  );
  canvas.drawPath(leafP, leafPaint);

  // 2. SSS Translucent Rim Kicker (Moonlight glancing off leaf edge)
  const rimP = stroke('#ffffff', 0.8, 0.45);
  rimP.setBlendMode(BlendMode.Screen);
  canvas.drawPath(leafP, rimP);

  // 3. Dimensional Midrib
  const midrib = leafVeinPath(base, size, -90, 0.3);
  canvas.drawPath(midrib, stroke('rgba(2, 6, 10, 0.5)', 1.2));
  canvas.drawPath(midrib, stroke(look.vein, 0.7, 0.75));
}
