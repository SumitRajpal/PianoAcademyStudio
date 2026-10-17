/**
 * The hatch light, centred on (0,0):
 * - `drawGodRays`: soft, blurred beams of uneven width and length fanning
 *   all the way round and fading out. Two sets with different seeds, spun
 *   in opposite directions by the scene, read as volumetric light.
 * - `drawLightBloom`: the blinding white-gold core and its wide glow.
 */

import { BlendMode, Skia, TileMode, type SkCanvas } from 'react-native-skia';

import { drawGlow, radialGradient, seeded } from '../../shared/paperKit';
import { polar } from '../../shared/paperShapes';
import { GOD_LIGHT_LOOK, type GodLightLook } from './godLightLook';

export function drawGodRays(
  canvas: SkCanvas,
  length: number,
  rays: number,
  seed: number,
  look: GodLightLook = GOD_LIGHT_LOOK,
) {
  const rand = seeded(seed);
  const o = { x: 0, y: 0 };
  // One soft layer: the beams are blurred together, like light in haze.
  const layer = Skia.Paint();
  layer.setImageFilter(Skia.ImageFilter.MakeBlur(look.softness, look.softness, TileMode.Decal, null));
  canvas.saveLayer(layer);
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * 360 + rand.range(-6, 6);
    const half = rand.range(2.5, 7.5);
    const reach = length * rand.range(0.6, 1);
    const paint = radialGradient(o, reach, [
      { color: look.ray, alpha: look.rayAlpha * rand.range(0.6, 1), at: 0 },
      { color: look.ray, alpha: look.rayAlpha * 0.35, at: 0.5 },
      { color: look.ray, alpha: 0, at: 1 },
    ]);
    paint.setBlendMode(BlendMode.Plus);
    canvas.drawPath(Skia.Path.Polygon([o, polar(o, reach, angle - half), polar(o, reach, angle + half)], true), paint);
  }
  canvas.restore();
}

export function drawLightBloom(canvas: SkCanvas, radius: number, look: GodLightLook = GOD_LIGHT_LOOK) {
  drawGlow(canvas, { x: 0, y: 0 }, radius * 2.4, look.bloom, 0.55);
  drawGlow(canvas, { x: 0, y: 0 }, radius, look.core, 0.95);
}
