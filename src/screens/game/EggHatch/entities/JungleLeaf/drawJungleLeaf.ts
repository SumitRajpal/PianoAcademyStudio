/**
 * A spray of big foreground leaves growing from (0,0), each with a midrib and
 * side veins. They sit closest to the viewer, so they are dark and move the
 * most with the camera; the scene also sways each spray around its base.
 */

import type { SkCanvas } from 'react-native-skia';

import { fill, paperSheet, stroke } from '../../shared/paperKit';
import { leafPath, leafVeinPath, polar } from '../../shared/paperShapes';
import { JUNGLE_LEAF_LOOK, type JungleLeafLook } from './jungleLeafLook';

export type JungleLeaf = { angle: number; length: number; width: number; bend: number; color: number };

export function drawJungleLeafSpray(canvas: SkCanvas, leaves: JungleLeaf[], look: JungleLeafLook = JUNGLE_LEAF_LOOK) {
  const base = { x: 0, y: 0 };
  paperSheet(canvas, { dx: 0, dy: -4, blur: 7, alpha: 0.6 }, c => {
    for (const leaf of leaves) {
      c.drawPath(leafPath(base, leaf.length, leaf.width, leaf.angle, leaf.bend, 0.45), fill(look.leaves[leaf.color]));
      const vein = stroke(look.vein, 1.1, look.veinAlpha);
      c.drawPath(leafVeinPath(base, leaf.length, leaf.angle, leaf.bend), vein);
      // Side veins angling out from the midrib.
      for (let t = 0.2; t < 0.85; t += 0.11) {
        const p = polar(base, leaf.length * t, leaf.angle + leaf.bend * t * 12);
        const half = leaf.width * 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.15));
        for (const side of [-1, 1]) {
          const q = polar(p, half, leaf.angle + side * 55);
          c.drawLine(p.x, p.y, q.x, q.y, stroke(look.vein, 0.7, look.veinAlpha * 0.7));
        }
      }
    }
  });
}
