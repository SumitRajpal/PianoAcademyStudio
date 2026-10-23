/**
 * The moon: a luminous celestial crescent with atmospheric corona bloom
 * and glowing stars in its curve.
 * Rendered in 3D CGI stylized cartoon aesthetic (Pixar / The Incredibles standard).
 */

import {
  BlendMode,
  BlurStyle,
  Skia,
  TileMode,
  type SkCanvas,
} from 'react-native-skia';

import { drawGlow, fill, stroke, type Point } from '../../shared/paperKit';
import { crescentPath, sparklePath } from '../../shared/paperShapes';
import { MOON_LOOK, type MoonLook } from './moonLook';

export function drawMoonHalo(
  canvas: SkCanvas,
  center: Point,
  radius: number,
  look: MoonLook = MOON_LOOK,
) {
  // 1. Wide Atmospheric Corona Bloom (Additive)
  drawGlow(
    canvas,
    center,
    radius * 5.0,
    look.halo,
    look.haloAlpha * 0.7,
    BlendMode.Plus,
  );
  // 2. Focused Core Bloom
  drawGlow(
    canvas,
    center,
    radius * 2.2,
    look.halo,
    look.haloAlpha * 0.95,
    BlendMode.Plus,
  );
}

export function drawMoon(
  canvas: SkCanvas,
  center: Point,
  radius: number,
  look: MoonLook = MOON_LOOK,
) {
  const path = crescentPath(center, radius, {
    x: radius * 0.42,
    y: -radius * 0.22,
  });

  // 1. Soft Luminous Outer Edge Glow
  const outerGlow = Skia.Paint();
  outerGlow.setColor(Skia.Color(look.halo));
  outerGlow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 4, true));
  outerGlow.setBlendMode(BlendMode.Plus);
  outerGlow.setAlphaf(0.85);
  canvas.drawPath(path, outerGlow);

  // 2. Volumetric Crescent Surface Gradient (Luminous white rim to pale silver-blue shade)
  const moonPaint = Skia.Paint();
  moonPaint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: center.x - radius, y: center.y - radius * 0.5 },
      { x: center.x + radius * 0.5, y: center.y + radius * 0.5 },
      [Skia.Color(look.face), Skia.Color(look.shade)],
      [0.0, 1.0],
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(path, moonPaint);

  // 3. Crisp Rim Light on the Outer Convex Arc
  const rimPaint = stroke('#ffffff', 1.4, 0.9);
  rimPaint.setBlendMode(BlendMode.Plus);
  canvas.drawPath(path, rimPaint);

  // 4. Companion Sparkling Star with Additive Gleam
  const starPos = { x: center.x + radius * 0.62, y: center.y + radius * 0.18 };
  const starRadius = radius * 0.26;
  const starGlow = Skia.Paint();
  starGlow.setColor(Skia.Color(look.star));
  starGlow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 3, true));
  starGlow.setBlendMode(BlendMode.Plus);
  canvas.drawCircle(starPos.x, starPos.y, starRadius * 1.5, starGlow);
  canvas.drawPath(sparklePath(starPos, starRadius), fill('#ffffff'));
}
