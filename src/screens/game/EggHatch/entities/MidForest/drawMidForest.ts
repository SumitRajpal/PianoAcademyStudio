/**
 * The middle forest: a few curving trees on each side of the clearing, each
 * with branches reaching up into a canopy of teal and berry-red paper leaves,
 * and vines hanging down. The owls perch on the branches listed in
 * MID_FOREST_TREES (see eggHatchDesign SCENE.owls).
 */

import type { SkCanvas } from 'react-native-skia';

import { drawLeafCluster } from '../../shared/foliage';
import { fill, paperSheet, seeded, stroke, type Bounds, type Point } from '../../shared/paperKit';
import { branchPath, quadPoint, trunkPath } from '../../shared/paperShapes';
import { MID_FOREST_LOOK, type MidForestLook } from './midForestLook';

type Branch = { from: number; to: Point; bend: number; width: number };
type Tree = { x: number; top: Point; width: number; lean: number; branches: Branch[] };

/** The trees, in design points. `from` is how far up the trunk (0..1). */
export const MID_FOREST_TREES: Tree[] = [
  {
    x: 128, top: { x: 160, y: -60 }, width: 30, lean: -26,
    branches: [
      { from: 0.42, to: { x: 232, y: 150 }, bend: -18, width: 9 },
      { from: 0.66, to: { x: 64, y: 60 }, bend: 10, width: 7 },
    ],
  },
  {
    x: 292, top: { x: 270, y: -60 }, width: 22, lean: 18,
    branches: [{ from: 0.58, to: { x: 350, y: 70 }, bend: -12, width: 6 }],
  },
  {
    x: 662, top: { x: 690, y: -60 }, width: 24, lean: -16,
    branches: [{ from: 0.5, to: { x: 600, y: 96 }, bend: 12, width: 7 }],
  },
  {
    x: 808, top: { x: 776, y: -60 }, width: 32, lean: 24,
    branches: [
      { from: 0.4, to: { x: 712, y: 164 }, bend: 16, width: 9 },
      { from: 0.62, to: { x: 880, y: 70 }, bend: -10, width: 7 },
    ],
  },
];

export function drawMidForest(
  canvas: SkCanvas,
  bounds: Bounds,
  groundY: number,
  look: MidForestLook = MID_FOREST_LOOK,
) {
  const rand = seeded(902);
  paperSheet(canvas, { dx: 2, dy: 5, blur: 6, alpha: 0.55 }, c => {
    for (const tree of MID_FOREST_TREES) {
      const base = { x: tree.x, y: groundY };
      const control = { x: (base.x + tree.top.x) / 2 + tree.lean, y: (base.y + tree.top.y) / 2 };
      for (const br of tree.branches) {
        const from = quadPoint(base, control, tree.top, br.from);
        const mid = { x: (from.x + br.to.x) / 2, y: (from.y + br.to.y) / 2 + br.bend };
        c.drawPath(branchPath(from, mid, br.to, br.width, br.width * 0.35), fill(look.trunk));
      }
      c.drawPath(trunkPath(base, tree.top, tree.width, tree.width * 0.5, tree.lean), fill(look.trunk));
      // Bark grooves: a few pale strokes up the trunk.
      for (let i = 0; i < 3; i++) {
        const t0 = rand.range(0.1, 0.5);
        const p0 = quadPoint(base, control, tree.top, t0);
        const p1 = quadPoint(base, control, tree.top, t0 + rand.range(0.15, 0.3));
        const dx = rand.range(-0.25, 0.25) * tree.width;
        c.drawLine(p0.x + dx, p0.y, p1.x + dx, p1.y, stroke(look.bark, 1.4, 0.8));
      }
    }
    // Canopy: dense leaf clusters along the top, thinning towards the centre.
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 26) {
      const fromCentre = Math.abs(x - 466) / 466;
      if (fromCentre < 0.22) continue;
      const depth = 20 + fromCentre * 110;
      for (let k = 0; k < 2; k++) {
        drawLeafCluster(c, rand, {
          center: { x: x + rand.range(-12, 12), y: rand.range(-10, depth) },
          spread: 18,
          count: 9,
          length: [18, 34],
          width: 11,
          angles: [0, 360],
          colors: look.leaves,
          vein: look.vein,
          veinAlpha: 0.22,
        });
      }
    }
    // Hanging vines with little leaves.
    for (const x of [214, 338, 618, 742, 858]) {
      const length = rand.range(60, 120);
      const vine = stroke(look.vine, 1.3);
      c.drawLine(x, 0, x + rand.range(-6, 6), length, vine);
      for (let y = 14; y < length; y += 12) {
        drawLeafCluster(c, rand, {
          center: { x: x + (y / length) * 3, y },
          spread: 1,
          count: 2,
          length: [6, 10],
          width: 4,
          angles: [y % 24 ? 20 : 160, y % 24 ? 60 : 200],
          colors: [look.vine, look.leaves[2]],
        });
      }
    }
  });
}
