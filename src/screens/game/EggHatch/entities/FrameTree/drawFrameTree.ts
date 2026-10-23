/**
 * One of the two big trees framing the scene: rendered in 3D CGI stylized
 * cartoon aesthetic (Pixar / The Incredibles standard):
 * - Volumetric cylindrical trunk with directional key/bounce lighting and rim light.
 * - Arching branches with contact ambient occlusion at branch junctions.
 * - Sculpted bark grooves with illuminated ridges.
 * - Lush canopy of leaves with subsurface scattering light transmittance.
 */

import { BlendMode, Skia, TileMode, type SkCanvas } from 'react-native-skia';

import { drawLeafCluster } from '../../shared/foliage';
import {
  fill,
  linearGradient,
  seeded,
  stroke,
  twoPointConicalGradient,
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

  // 1. Branch arching in over the clearing with cylindrical lighting
  const from = quadPoint(base, control, top, 0.62);
  const branchP = branchPath(from, { x: X(150), y: 70 }, { x: X(250), y: 40 }, 20, 6);

  // Branch contact AO at base
  canvas.save();
  canvas.translate(0, 3);
  canvas.drawPath(branchP, fill('rgba(2, 6, 12, 0.4)'));
  canvas.restore();

  // Branch cylinder fill
  const branchPaint = linearGradient(
    { x: X(150), y: 40 },
    { x: X(150), y: 90 },
    [look.trunkLight, look.trunk, '#0b1619'],
    [0.0, 0.5, 1.0]
  );
  canvas.drawPath(branchP, branchPaint);

  // 2. Trunk with Volumetric Cylindrical Form Lighting
  const trunkP = trunkPath(base, top, 78, 42, (control.x - (base.x + top.x) / 2) * 1.6);

  // Ground root contact shadow
  canvas.save();
  canvas.translate(side * -8, 6);
  canvas.drawPath(trunkP, fill('rgba(1, 4, 8, 0.5)'));
  canvas.restore();

  // Cylindrical 3D gradient across trunk width:
  // Outer edge dark -> core wood -> inner edge rim highlight from moonlight in clearing
  const trunkGrad = side < 0
    ? linearGradient(
        { x: X(0), y: 0 },
        { x: X(120), y: 0 },
        ['#081215', look.trunk, look.trunkLight, '#4a6b68'],
        [0.0, 0.35, 0.75, 1.0]
      )
    : linearGradient(
        { x: X(0), y: 0 },
        { x: X(120), y: 0 },
        ['#4a6b68', look.trunkLight, look.trunk, '#081215'],
        [0.0, 0.25, 0.65, 1.0]
      );
  canvas.drawPath(trunkP, trunkGrad);

  // 3. Bark Grooves with 3D Depth (Shadow crevice + highlight ridge)
  for (let i = 0; i < 7; i++) {
    const off = rand.range(-24, 24);
    const t0 = rand.range(0.05, 0.6);
    const p0 = quadPoint(base, control, top, t0);
    const p1 = quadPoint(base, control, top, t0 + rand.range(0.12, 0.3));

    // Shadow crevice
    canvas.drawLine(p0.x + off + (side < 0 ? 1 : -1), p0.y, p1.x + off * 0.8 + (side < 0 ? 1 : -1), p1.y, stroke('rgba(2, 6, 10, 0.8)', 2.2));
    // Wood highlight ridge
    canvas.drawLine(p0.x + off, p0.y, p1.x + off * 0.8, p1.y, stroke(look.trunkLight, 1.2, 0.45));
  }

  // 4. Canopy of 3D Stylized Foliage with SSS Translucency
  for (let i = 0; i < 28; i++) {
    const along = rand.next();
    const x = X(-30 + along * 330);
    const y = -20 + Math.pow(1 - along, 1.6) * 210 + rand.range(-25, 25);
    drawLeafCluster(canvas, rand, {
      center: { x, y },
      spread: 24,
      count: 7,
      length: [26, 54],
      width: 17,
      angles: [0, 360],
      colors: look.leaves,
      vein: look.vein,
      veinAlpha: 0.35,
    });
  }
}
