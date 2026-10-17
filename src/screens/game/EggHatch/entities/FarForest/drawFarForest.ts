/**
 * The far forest: two sheets of slim trees and leafy canopies fading into the
 * night, framing an open window of sky around the moon. Each sheet casts a
 * soft shadow on the one behind it.
 */

import type { SkCanvas } from 'react-native-skia';

import { drawLeafCluster } from '../../shared/foliage';
import { fill, paperSheet, seeded, type Bounds } from '../../shared/paperKit';
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
  // Trunks.
  for (const x of trunks) {
    const w = rand.range(9, 16) * scale;
    canvas.drawPath(
      trunkPath({ x, y: horizonY + 8 }, { x: x + rand.range(-14, 14), y: top }, w, w * 0.55, rand.range(-10, 10)),
      fill(look.trunk),
    );
  }
  // Canopies hanging from the top, heavier at the sides.
  const step = 34 * scale;
  for (let x = bounds.x; x < bounds.x + bounds.width; x += step) {
    const fromCentre = Math.abs(x - (bounds.x + bounds.width / 2)) / (bounds.width / 2);
    const y = top + canopyY * (0.35 + fromCentre * 0.9) + rand.range(-14, 14);
    drawLeafCluster(canvas, rand, {
      center: { x: x + rand.range(-10, 10), y },
      spread: 26 * scale,
      count: 14,
      length: [16 * scale, 30 * scale],
      width: 9 * scale,
      angles: [0, 360],
      colors: look.leaves,
      vein: look.vein,
      veinAlpha: 0.18,
    });
  }
  // A low bushy line on the horizon.
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
  paperSheet(canvas, { dx: 0, dy: 3, blur: 5, alpha: 0.45 }, c =>
    drawSheet(c, bounds, horizonY - 14, look.back, 31, [60, 128, 205, 288, 352, 590, 652, 728, 806, 880], 70, 0.85),
  );
  paperSheet(canvas, { dx: 1, dy: 4, blur: 6, alpha: 0.5 }, c =>
    drawSheet(c, bounds, horizonY, look.front, 57, [20, 96, 172, 250, 318, 620, 690, 764, 846, 918], 92, 1),
  );
}
