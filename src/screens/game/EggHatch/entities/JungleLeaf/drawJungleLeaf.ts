/**
 * A spray of big foreground leaves growing from (0,0):
 * Rendered in 3D CGI stylized cartoon aesthetic (Pixar / The Incredibles standard):
 * - Volumetric broad leaves with directional light falloff and SSS rim glow.
 * - Dimensional midrib and relief-shaded side veins.
 * - Deep foreground depth framing the clearing.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { fill, stroke, twoPointConicalGradient } from '../../shared/paperKit';
import { leafPath, leafVeinPath, polar } from '../../shared/paperShapes';
import { JUNGLE_LEAF_LOOK, type JungleLeafLook } from './jungleLeafLook';

export type JungleLeaf = { angle: number; length: number; width: number; bend: number; color: number };

export function drawJungleLeafSpray(canvas: SkCanvas, leaves: JungleLeaf[], look: JungleLeafLook = JUNGLE_LEAF_LOOK) {
  const base = { x: 0, y: 0 };

  // Base contact AO shadow
  canvas.drawOval(
    { x: -20, y: -6, width: 40, height: 14 },
    fill('rgba(1, 3, 6, 0.5)')
  );

  for (const leaf of leaves) {
    const leafP = leafPath(base, leaf.length, leaf.width, leaf.angle, leaf.bend, 0.45);
    const leafColor = look.leaves[leaf.color];

    // Leaf base fill
    canvas.drawPath(leafP, fill(leafColor));

    // SSS rim highlight along leaf edge
    const rimP = stroke('#5ce6c2', 1.0, 0.35);
    rimP.setBlendMode(BlendMode.Screen);
    canvas.drawPath(leafP, rimP);

    // Dimensional midrib
    const midrib = leafVeinPath(base, leaf.length, leaf.angle, leaf.bend);
    canvas.drawPath(midrib, stroke('rgba(2, 6, 10, 0.6)', 1.8));
    canvas.drawPath(midrib, stroke(look.vein, 1.0, look.veinAlpha));

    // Side veins angling out from the midrib with subtle highlight
    for (let t = 0.2; t < 0.85; t += 0.11) {
      const p = polar(base, leaf.length * t, leaf.angle + leaf.bend * t * 12);
      const half = leaf.width * 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      for (const side of [-1, 1]) {
        const q = polar(p, half, leaf.angle + side * 55);
        canvas.drawLine(p.x, p.y, q.x, q.y, stroke(look.vein, 0.7, look.veinAlpha * 0.8));
      }
    }
  }
}
