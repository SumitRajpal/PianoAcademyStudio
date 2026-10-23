/**
 * The far forest: rendered in 3D CGI stylized cartoon aesthetic
 * (Pixar / The Incredibles standard):
 * - Volumetric cylindrical trunks fading into deep night atmosphere.
 * - Soft layered canopies with natural depth falloff.
 * - Horizon line with atmospheric distance fog.
 */

import type { SkCanvas } from 'react-native-skia';

import { drawLeafCluster } from '../../shared/foliage';
import { fill, linearGradient, seeded, type Bounds } from '../../shared/paperKit';
import { trunkPath } from '../../shared/paperShapes';
import { FAR_FOREST_LOOK, type FarForestLook } from './farForestLook';

type SheetLook = FarForestLook['back'] & { vein?: string };

function drawSheet(
  canvas: SkCanvas,
  bounds: Bounds,
  horizonY: number,
  look: SheetLook,
  seed: number,
  trunks: number[],
  canopyY: number,
  scale: number,
) {
  const rand = seeded(seed);
  const top = bounds.y;

  // 1. Volumetric Cylindrical Trunks
  for (const x of trunks) {
    const w = rand.range(9, 16) * scale;
    const trunkP = trunkPath(
      { x, y: horizonY + 8 },
      { x: x + rand.range(-14, 14), y: top },
      w,
      w * 0.55,
      rand.range(-10, 10)
    );

    // Cylindrical gradient across trunk width
    const trunkGrad = linearGradient(
      { x: x - w, y: 0 },
      { x: x + w, y: 0 },
      ['#071015', look.trunk, '#2a444a'],
      [0.0, 0.45, 1.0]
    );
    canvas.drawPath(trunkP, trunkGrad);
  }

  // 2. Canopies hanging from top with depth
  const step = 34 * scale;
  for (let x = bounds.x; x < bounds.x + bounds.width; x += step) {
    const fromCentre = Math.abs(x - (bounds.x + bounds.width / 2)) / (bounds.width / 2);
    const y = top + canopyY * (0.35 + fromCentre * 0.9) + rand.range(-14, 14);
    drawLeafCluster(canvas, rand, {
      center: { x: x + rand.range(-10, 10), y },
      spread: 26 * scale,
      count: 14,
      length: [16 * scale, 30 * scale],
      width: 10 * scale,
      angles: [0, 360],
      colors: look.leaves,
      vein: look.vein,
      veinAlpha: 0.22,
    });
  }

  // 3. Low bushy line on horizon
  for (let x = bounds.x; x < bounds.x + bounds.width; x += 22 * scale) {
    drawLeafCluster(canvas, rand, {
      center: { x, y: horizonY + rand.range(-4, 6) },
      spread: 10 * scale,
      count: 6,
      length: [12 * scale, 22 * scale],
      width: 8 * scale,
      angles: [-165, -15],
      colors: [look.bush, ...look.leaves.slice(0, 2)],
    });
  }
}

export function drawFarForest(
  canvas: SkCanvas,
  bounds: Bounds,
  horizonY: number,
  look: FarForestLook = FAR_FOREST_LOOK,
) {
  // Back sheet (deeper atmosphere)
  drawSheet(canvas, bounds, horizonY - 14, look.back, 31, [60, 128, 205, 288, 352, 590, 652, 728, 806, 880], 70, 0.85);

  // Front sheet
  drawSheet(canvas, bounds, horizonY, look.front, 57, [20, 96, 172, 250, 318, 620, 690, 764, 846, 918], 92, 1);
}
