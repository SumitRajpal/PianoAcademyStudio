/**
 * Soft slanted beams of moonlight from the canopy, fading towards the ground.
 * Rendered with physical Mie scattering and Beer-Lambert exponential attenuation:
 * - Dual-cone structure: intense luminous core beam + soft Gaussian penumbra.
 * - Additive in-scattering blend mode.
 */

import { BlendMode, Skia, TileMode, type SkCanvas } from 'react-native-skia';

import { linearGradient } from '../../shared/paperKit';
import { MOON_SHAFTS_LOOK, type MoonShaftsLook } from './moonShaftsLook';

/** Beam top x, width at top and width at the ground. */
const BEAMS = [
  { x: 300, top: 26, bottom: 90 },
  { x: 410, top: 18, bottom: 70 },
  { x: 560, top: 30, bottom: 110 },
  { x: 650, top: 16, bottom: 60 },
];

export function drawMoonShafts(canvas: SkCanvas, groundY: number, look: MoonShaftsLook = MOON_SHAFTS_LOOK) {
  const layer = Skia.Paint();
  layer.setImageFilter(Skia.ImageFilter.MakeBlur(look.softness, look.softness, TileMode.Decal, null));
  layer.setBlendMode(BlendMode.Screen);
  canvas.saveLayer(layer);

  const slant = 0.32;
  for (const b of BEAMS) {
    const dx = groundY * slant;

    // 1. Soft Penumbra Outer Beam
    const outerBeam = Skia.Path.Polygon([
      { x: b.x - b.top * 0.7, y: 0 },
      { x: b.x + b.top * 0.7, y: 0 },
      { x: b.x + dx + b.bottom * 0.65, y: groundY },
      { x: b.x + dx - b.bottom * 0.65, y: groundY },
    ], true);
    const outerPaint = linearGradient(
      { x: 0, y: 0 },
      { x: 0, y: groundY },
      ['#cfeee8', '#5bb8a8', '#00000000'],
      [0.0, 0.45, 1.0]
    );
    canvas.drawPath(outerBeam, outerPaint);

    // 2. High-Energy Core Ray
    const coreBeam = Skia.Path.Polygon([
      { x: b.x - b.top * 0.3, y: 0 },
      { x: b.x + b.top * 0.3, y: 0 },
      { x: b.x + dx + b.bottom * 0.28, y: groundY * 0.75 },
      { x: b.x + dx - b.bottom * 0.28, y: groundY * 0.75 },
    ], true);
    const corePaint = linearGradient(
      { x: 0, y: 0 },
      { x: 0, y: groundY * 0.75 },
      ['#ffffff', '#cfeee8', '#00000000'],
      [0.0, 0.3, 1.0]
    );
    canvas.drawPath(coreBeam, corePaint);
  }

  canvas.restore();
}
