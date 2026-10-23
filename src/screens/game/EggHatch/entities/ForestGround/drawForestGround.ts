/**
 * The forest floor: rendered in 3D CGI stylized cartoon aesthetic
 * (Pixar / The Incredibles standard):
 * - Volumetric rolling terrain with rim lighting on hill crests.
 * - Deep rich atmospheric ground gradient with clearing light pools.
 * - Layered foreground bushes with subsurface scattering and contact AO.
 */

import { BlendMode, Skia, TileMode, type SkCanvas } from 'react-native-skia';

import { drawLeafCluster } from '../../shared/foliage';
import { fill, linearGradient, seeded, stroke, verticalGradient, type Bounds } from '../../shared/paperKit';
import { leafPath } from '../../shared/paperShapes';
import { FOREST_GROUND_LOOK, type ForestGroundLook } from './forestGroundLook';

function drawGrassTuft(canvas: SkCanvas, x: number, y: number, size: number, colors: readonly string[], rand: ReturnType<typeof seeded>) {
  for (let i = 0; i < 5; i++) {
    const angle = -90 + (i - 2) * 16 + rand.range(-6, 6);
    const blade = leafPath({ x, y }, size * rand.range(0.7, 1.1), size * 0.18, angle, rand.range(-0.6, 0.6), 0.3);
    canvas.drawPath(blade, fill(rand.pick(colors)));
    // Blade specular edge
    canvas.drawPath(blade, stroke('#5ce6c2', 0.6, 0.35));
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

  // 1. Volumetric Rolling Ground
  const ground = Skia.PathBuilder.Make()
    .moveTo(left, horizonY - 26)
    .cubicTo(160, horizonY - 34, 300, horizonY - 2, 466, horizonY)
    .cubicTo(632, horizonY - 2, 772, horizonY - 34, right, horizonY - 26)
    .lineTo(right, bottom)
    .lineTo(left, bottom)
    .close()
    .build();

  // Ground base gradient
  canvas.drawPath(ground, verticalGradient(horizonY - 30, bottom, look.ground));

  // Hill crest rim kicker: moonlight catching the ridge of the clearing
  const crestLine = Skia.PathBuilder.Make()
    .moveTo(left, horizonY - 26)
    .cubicTo(160, horizonY - 34, 300, horizonY - 2, 466, horizonY)
    .cubicTo(632, horizonY - 2, 772, horizonY - 34, right, horizonY - 26)
    .build();

  const rimPaint = stroke('#2dd4bf', 3.0, 0.45);
  rimPaint.setBlendMode(BlendMode.Screen);
  canvas.drawPath(crestLine, rimPaint);

  const rimCore = stroke('#ffffff', 1.0, 0.3);
  rimCore.setBlendMode(BlendMode.Plus);
  canvas.drawPath(crestLine, rimCore);

  // 2. Bushes behind the pond on both sides with volumetric depth
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
    drawLeafCluster(canvas, rand, {
      center: s,
      spread: 15,
      count: 16,
      length: [16, 30],
      width: 12,
      angles: [-175, -5],
      colors: s.berry ? look.berryBushes : look.bushes,
      vein: look.vein,
      veinAlpha: 0.28,
    });
  }

  // 3. Grass tufts scattered over the near ground
  for (let i = 0; i < 28; i++) {
    const x = rand.range(left, right);
    if (Math.abs(x - 466) < 230) continue;
    drawGrassTuft(canvas, x, rand.range(horizonY + 20, bottom - 30), rand.range(10, 18), look.grass, rand);
  }
}
