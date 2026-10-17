/**
 * The final pass over the whole scene: a fine fractal-noise paper grain and
 * a vignette darkening the corners, pulling the eye to the egg.
 */

import { BlendMode, Skia, type SkCanvas } from 'react-native-skia';

import { radialGradient, type Bounds, type Point } from '../../shared/paperKit';
import { PAPER_FINISH_LOOK, type PaperFinishLook } from './paperFinishLook';

export function drawPaperFinish(
  canvas: SkCanvas,
  bounds: Bounds,
  focus: Point,
  look: PaperFinishLook = PAPER_FINISH_LOOK,
) {
  const grain = Skia.Paint();
  grain.setShader(Skia.Shader.MakeFractalNoise(0.9, 0.9, 2, 7, 0, 0));
  grain.setAlphaf(look.grainAlpha);
  grain.setBlendMode(BlendMode.Overlay);
  canvas.drawRect(bounds, grain);
  const radius = Math.hypot(bounds.width, bounds.height) * 0.55;
  canvas.drawRect(
    bounds,
    radialGradient(focus, radius, [
      { color: look.vignette, alpha: 0, at: 0.45 },
      { color: look.vignette, alpha: look.vignetteAlpha, at: 1 },
    ]),
  );
}
