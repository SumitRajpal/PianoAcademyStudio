/**
 * The final cinematic pass over the whole scene:
 * A rich optical vignette darkening the corners, pulling focus to the enchanted egg.
 * Clean, smooth CGI presentation without noisy paper grain.
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
  if (look.grainAlpha > 0.005) {
    const grain = Skia.Paint();
    grain.setShader(Skia.Shader.MakeFractalNoise(0.9, 0.9, 2, 7, 0, 0));
    grain.setAlphaf(look.grainAlpha);
    grain.setBlendMode(BlendMode.Overlay);
    canvas.drawRect(bounds, grain);
  }

  // Smooth cinematic vignette
  const radius = Math.hypot(bounds.width, bounds.height) * 0.58;
  canvas.drawRect(
    bounds,
    radialGradient(focus, radius, [
      { color: look.vignette, alpha: 0, at: 0.42 },
      { color: look.vignette, alpha: look.vignetteAlpha * 0.5, at: 0.75 },
      { color: look.vignette, alpha: look.vignetteAlpha, at: 1.0 },
    ]),
  );
}
