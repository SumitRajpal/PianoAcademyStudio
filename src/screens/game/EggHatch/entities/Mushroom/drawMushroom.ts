/**
 * Glowing bioluminescent mushrooms.
 * Rendered in 3D CGI stylized cartoon aesthetic (Pixar / The Incredibles standard):
 * - Volumetric cylindrical stem with rim lighting.
 * - SSS translucent glowing cap with internal light diffusion.
 * - Ethereal additive bloom spots and ground light pools.
 */

import {
  BlendMode,
  BlurStyle,
  Skia,
  TileMode,
  type SkCanvas,
} from 'react-native-skia';

import {
  blurred,
  drawGlow,
  fill,
  stroke,
  twoPointConicalGradient,
} from '../../shared/paperKit';
import { MUSHROOM_LOOK, type MushroomLook } from './mushroomLook';

/** One mushroom: height, cap width, x offset and lean (degrees). */
const CLUSTER = [
  { x: -16, h: 30, cap: 26, lean: -10 },
  { x: 6, h: 44, cap: 34, lean: 4 },
  { x: 24, h: 22, cap: 20, lean: 14 },
  { x: -2, h: 16, cap: 14, lean: -4 },
];

function drawMushroom(
  canvas: SkCanvas,
  x: number,
  h: number,
  capW: number,
  lean: number,
  look: MushroomLook,
) {
  canvas.save();
  canvas.translate(x, 0);
  canvas.rotate(lean, 0, 0);
  const sw = capW * 0.22;

  // 1. Stem: Volumetric 3D Cylinder Gradient with Ambient Base
  const stem = Skia.PathBuilder.Make()
    .moveTo(-sw * 0.7, 0)
    .quadTo(-sw * 0.4, -h * 0.5, -sw * 0.5, -h)
    .lineTo(sw * 0.5, -h)
    .quadTo(sw * 0.4, -h * 0.5, sw * 0.7, 0)
    .close()
    .build();

  const stemPaint = Skia.Paint();
  stemPaint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: -sw, y: 0 },
      { x: sw, y: 0 },
      [
        Skia.Color(look.stem),
        Skia.Color('#ffffff'),
        Skia.Color(look.stemShade),
      ],
      [0.0, 0.35, 1.0],
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(stem, stemPaint);

  // 2. Bioluminescent Cap: Volumetric Curved Dome with Internal Translucency
  const cap = Skia.PathBuilder.Make()
    .moveTo(-capW / 2, -h + 2)
    .cubicTo(
      -capW / 2,
      -h - capW * 0.65,
      capW / 2,
      -h - capW * 0.65,
      capW / 2,
      -h + 2,
    )
    .quadTo(0, -h - capW * 0.08, -capW / 2, -h + 2)
    .close()
    .build();

  // Cap base 3D radial gradient
  const capPaint = twoPointConicalGradient(
    { x: -capW * 0.15, y: -h - capW * 0.35 },
    0,
    { x: 0, y: -h - capW * 0.2 },
    capW * 0.75,
    look.cap,
    [0.0, 0.45, 1.0],
  );
  canvas.drawPath(cap, capPaint);

  // Bioluminescent Cap Inner Glow (SSS Translucency)
  const capGlow = Skia.Paint();
  capGlow.setColor(Skia.Color(look.cap[0]));
  capGlow.setAlphaf(0.5);
  capGlow.setMaskFilter(
    Skia.MaskFilter.MakeBlur(BlurStyle.Normal, capW * 0.18, true),
  );
  capGlow.setBlendMode(BlendMode.Plus);
  canvas.drawPath(cap, capGlow);

  // Glowing Cap Rim Highlight
  const capRim = stroke(look.cap[0], 1.2, 0.85);
  capRim.setBlendMode(BlendMode.Plus);
  canvas.drawPath(cap, capRim);

  // 3. Glowing Emissive Spots with Specular Bloom
  for (const [sx, sy, sr] of [
    [-capW * 0.18, -h - capW * 0.22, capW * 0.065],
    [capW * 0.14, -h - capW * 0.28, capW * 0.055],
    [capW * 0.28, -h - capW * 0.11, capW * 0.045],
  ]) {
    // Soft outer spot glow
    const spotGlow = fill(look.spot, 0.6);
    spotGlow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2, true));
    spotGlow.setBlendMode(BlendMode.Plus);
    canvas.drawCircle(sx, sy, sr * 1.5, spotGlow);

    // Sharp spot core
    canvas.drawCircle(sx, sy, sr, fill('#ffffff', 0.95));
  }

  canvas.restore();
}

export function drawMushroomCluster(
  canvas: SkCanvas,
  scale: number,
  look: MushroomLook = MUSHROOM_LOOK,
) {
  // Ground contact shadow under cluster
  canvas.drawOval(
    { x: -25 * scale, y: -2 * scale, width: 65 * scale, height: 12 * scale },
    blurred(fill('rgba(2, 6, 12, 0.45)'), 4 * scale),
  );

  for (const m of CLUSTER) {
    drawMushroom(canvas, m.x * scale, m.h * scale, m.cap * scale, m.lean, look);
  }
}

/** The soft light pool the mushrooms cast on the ground around them. */
export function drawMushroomGlow(
  canvas: SkCanvas,
  radius: number,
  look: MushroomLook = MUSHROOM_LOOK,
) {
  drawGlow(
    canvas,
    { x: 0, y: -8 },
    radius * 1.2,
    look.glow,
    look.glowAlpha * 0.65,
    BlendMode.Plus,
  );
  drawGlow(
    canvas,
    { x: 0, y: -8 },
    radius * 0.6,
    look.glow,
    look.glowAlpha,
    BlendMode.Plus,
  );
}
