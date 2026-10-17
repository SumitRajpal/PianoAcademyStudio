/**
 * The forest floor: a dark rolling paper ground from the horizon down, with
 * leafy bushes and berry-red shrubs on both sides of the clearing and tufts
 * of grass. The pond is a separate atom drawn on top.
 */

import { Skia, type SkCanvas } from 'react-native-skia';

import { drawLeafCluster } from '../../shared/foliage';
import { fill, paperSheet, seeded, verticalGradient, type Bounds } from '../../shared/paperKit';
import { leafPath } from '../../shared/paperShapes';
import { FOREST_GROUND_LOOK, type ForestGroundLook } from './forestGroundLook';

function drawGrassTuft(canvas: SkCanvas, x: number, y: number, size: number, colors: readonly string[], rand: ReturnType<typeof seeded>) {
  for (let i = 0; i < 5; i++) {
    const angle = -90 + (i - 2) * 16 + rand.range(-6, 6);
    canvas.drawPath(leafPath({ x, y }, size * rand.range(0.7, 1.1), size * 0.18, angle, rand.range(-0.6, 0.6), 0.3), fill(rand.pick(colors)));
  }
}

export function drawForestGround(
  canvas: SkCanvas,
  bounds: Bounds,
  horizonY: number,
  look: ForestGroundLook = FOREST_GROUND_LOOK,
) {
  const rand = seeded(5150);
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  paperSheet(canvas, { dx: 0, dy: -3, blur: 6, alpha: 0.5 }, c => {
    // Rolling ground line: higher at the sides, dipping into the clearing.
    const ground = Skia.PathBuilder.Make()
      .moveTo(left, horizonY - 26)
      .cubicTo(160, horizonY - 34, 300, horizonY - 2, 466, horizonY)
      .cubicTo(632, horizonY - 2, 772, horizonY - 34, right, horizonY - 26)
      .lineTo(right, bottom)
      .lineTo(left, bottom)
      .close()
      .build();
    c.drawPath(ground, verticalGradient(horizonY - 30, bottom, look.ground));
  });

  // Bushes behind the pond on both sides.
  paperSheet(canvas, { dx: 0, dy: 4, blur: 5, alpha: 0.55 }, c => {
    const spots = [
      { x: 150, y: horizonY - 10, berry: false },
      { x: 236, y: horizonY + 2, berry: true },
      { x: 318, y: horizonY + 8, berry: false },
      { x: 612, y: horizonY + 8, berry: false },
      { x: 700, y: horizonY + 2, berry: true },
      { x: 790, y: horizonY - 10, berry: false },
      { x: 60, y: horizonY - 6, berry: true },
      { x: 880, y: horizonY - 6, berry: true },
    ];
    for (const s of spots) {
      drawLeafCluster(c, rand, {
        center: s,
        spread: 14,
        count: 16,
        length: [16, 30],
        width: 11,
        angles: [-175, -5],
        colors: s.berry ? look.berryBushes : look.bushes,
        vein: look.vein,
        veinAlpha: 0.22,
      });
    }
    // Grass tufts scattered over the near ground.
    for (let i = 0; i < 28; i++) {
      const x = rand.range(left, right);
      if (Math.abs(x - 466) < 230) continue;
      drawGrassTuft(c, x, rand.range(horizonY + 20, bottom - 30), rand.range(10, 18), look.grass, rand);
    }
  });
}
