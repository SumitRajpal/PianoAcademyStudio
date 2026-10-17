/**
 * Soft slanted beams of moonlight from the top of the scene, fading towards
 * the ground, blurred into haze. Drawn in design points over the forest.
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
    const beam = Skia.Path.Polygon([
      { x: b.x - b.top / 2, y: 0 },
      { x: b.x + b.top / 2, y: 0 },
      { x: b.x + dx + b.bottom / 2, y: groundY },
      { x: b.x + dx - b.bottom / 2, y: groundY },
    ], true);
    canvas.drawPath(beam, linearGradient({ x: 0, y: 0 }, { x: 0, y: groundY }, ['#cfeee8', '#cfeee800']));
  }
  canvas.restore();
}
