/**
 * The pool of warm light the egg casts around itself, centred on (0,0): a
 * wide flat ellipse that lights the lotus petals and the water. The scene
 * draws it additively and brightens it with every crack.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { radialGradient } from '../../shared/paperKit';
import { EGG_LIGHT_LOOK, type EggLightLook } from './eggLightLook';

export function drawEggLightPool(canvas: SkCanvas, rx: number, ry: number, look: EggLightLook = EGG_LIGHT_LOOK) {
  canvas.save();
  canvas.scale(1, ry / rx);
  const paint = radialGradient({ x: 0, y: 0 }, rx, [
    { color: look.color, alpha: look.alpha, at: 0 },
    { color: look.color, alpha: look.alpha * 0.35, at: 0.5 },
    { color: look.color, alpha: 0, at: 1 },
  ]);
  paint.setBlendMode(BlendMode.Plus);
  canvas.drawCircle(0, 0, rx, paint);
  canvas.restore();
}
