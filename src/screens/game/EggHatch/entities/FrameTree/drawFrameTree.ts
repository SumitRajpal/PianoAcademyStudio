/**
 * One of the two big trees framing the scene: a thick shaded trunk with roots
 * at the screen edge, a branch arching inward, and a heavy canopy of large
 * teal and berry leaves along the top corner. `side` -1 draws the left tree,
 * 1 the right one (mirrored, with its own leaf scatter).
 */

import type { SkCanvas } from 'react-native-skia';

import { drawLeafCluster } from '../../shared/foliage';
import {
  fill,
  linearGradient,
  paperSheet,
  seeded,
  stroke,
} from '../../shared/paperKit';
import { branchPath, quadPoint, trunkPath } from '../../shared/paperShapes';
import { FRAME_TREE_LOOK, type FrameTreeLook } from './frameTreeLook';

export function drawFrameTree(
  canvas: SkCanvas,
  side: -1 | 1,
  sceneWidth: number,
  groundY: number,
  look: FrameTreeLook = FRAME_TREE_LOOK,
) {
  const rand = seeded(side < 0 ? 411 : 733);
  // Mirror around the scene centre for the right-hand tree.
  const X = (x: number) => (side < 0 ? x : sceneWidth - x);
  const base = { x: X(34), y: groundY + 70 };
  const top = { x: X(62), y: -80 };
  const control = { x: X(84), y: groundY * 0.4 };

  paperSheet(canvas, { dx: 3 * -side, dy: 6, blur: 8, alpha: 0.6 }, c => {
    // Branch arching in over the clearing.
    const from = quadPoint(base, control, top, 0.62);
    c.drawPath(
      branchPath(from, { x: X(150), y: 70 }, { x: X(250), y: 40 }, 18, 5),
      fill(look.trunk),
    );
    c.drawPath(
      trunkPath(base, top, 76, 40, (control.x - (base.x + top.x) / 2) * 1.6),
      linearGradient(
        { x: X(0), y: 0 },
        { x: X(110), y: 0 },
        [look.trunk, look.trunkLight, look.trunk],
        [0, 0.6, 1],
      ),
    );
    // Bark grooves following the trunk.
    for (let i = 0; i < 6; i++) {
      const off = rand.range(-22, 22);
      const t0 = rand.range(0.05, 0.6);
      const p0 = quadPoint(base, control, top, t0);
      const p1 = quadPoint(base, control, top, t0 + rand.range(0.12, 0.3));
      c.drawLine(p0.x + off, p0.y, p1.x + off * 0.8, p1.y, stroke(look.groove, 2, 0.7));
    }
    // Canopy along the top corner, spilling down the outer edge.
    for (let i = 0; i < 26; i++) {
      const along = rand.next();
      const x = X(-30 + along * 330);
      const y = -20 + Math.pow(1 - along, 1.6) * 210 + rand.range(-25, 25);
      drawLeafCluster(c, rand, {
        center: { x, y },
        spread: 22,
        count: 7,
        length: [26, 52],
        width: 16,
        angles: [0, 360],
        colors: look.leaves,
        vein: look.vein,
        veinAlpha: 0.3,
      });
    }
  });
}
