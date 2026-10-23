/**
 * The lotus the egg rests in, in two parts so the egg can sit inside it:
 * `drawLotusBack` (pad, sepals, back and middle petals) goes behind the egg,
 * `drawLotusFront` (the three front petals) goes in front of it.
 * Rendered in 3D CGI stylized cartoon aesthetic (Pixar / The Incredibles standard):
 * - Volumetric petal curvature with deep roots and translucent tips.
 * - Subsurface scattering (SSS) glowing pink-magenta light transmittance.
 * - Ambient occlusion shadowing between overlapping petal rows.
 */

import {
  BlendMode,
  BlurStyle,
  Skia,
  TileMode,
  type SkCanvas,
} from 'react-native-skia';

import { fill, stroke, type Point } from '../../shared/paperKit';
import { leafPath, leafVeinPath, polar } from '../../shared/paperShapes';
import { LOTUS_LOOK, type LotusLook } from './lotusLook';

function drawPetalRow(
  canvas: SkCanvas,
  base: Point,
  angles: number[],
  length: number,
  width: number,
  colors: string[],
  look: LotusLook,
  isFront = false,
) {
  for (const angle of angles) {
    const tip = polar(base, length, angle);
    const petal = leafPath(base, length, width, angle, 0, 0.5);

    // 1. Ambient Contact Shadow behind this petal
    const aoPaint = Skia.Paint();
    aoPaint.setColor(Skia.Color(look.ao));
    aoPaint.setAlphaf(look.aoAlpha * (isFront ? 0.35 : 0.55));
    aoPaint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 3, true));
    aoPaint.setBlendMode(BlendMode.Multiply);
    canvas.drawPath(petal, aoPaint);

    // 2. Volumetric Petal Body Gradient (Deep root to luminous tip)
    const petalPaint = Skia.Paint();
    petalPaint.setShader(
      Skia.Shader.MakeLinearGradient(
        base,
        tip,
        colors.map(c => Skia.Color(c)),
        colors.length === 3 ? [0.0, 0.5, 1.0] : null,
        TileMode.Clamp,
      ),
    );
    canvas.drawPath(petal, petalPaint);

    // 3. Subsurface Scattering (SSS): Translucent glowing petal tip
    const sssPaint = Skia.Paint();
    sssPaint.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: (base.x + tip.x) / 2, y: (base.y + tip.y) / 2 },
        tip,
        [Skia.Color('transparent'), Skia.Color(look.sss)],
        [0.0, 1.0],
        TileMode.Clamp,
      ),
    );
    sssPaint.setAlphaf(look.sssAlpha);
    sssPaint.setBlendMode(BlendMode.Screen);
    canvas.drawPath(petal, sssPaint);

    // 4. Delicate Translucent Vein
    const veinPaint = stroke(look.vein, 0.9, 0.45);
    veinPaint.setBlendMode(BlendMode.Plus);
    canvas.drawPath(leafVeinPath(base, length * 0.82, angle), veinPaint);

    // 5. Crisp Illuminated Edge Kicker
    const edgePaint = stroke(look.edge, 0.8, 0.45);
    edgePaint.setBlendMode(BlendMode.Plus);
    canvas.drawPath(petal, edgePaint);
  }
}

export function drawLotusBack(
  canvas: SkCanvas,
  at: Point,
  size: number,
  look: LotusLook = LOTUS_LOOK,
) {
  const base = { x: at.x, y: at.y };

  // 1. Pad & Sepals with Volumetric Contact Shadow
  const padRect = {
    x: at.x - 92 * size,
    y: at.y - 6 * size,
    width: 184 * size,
    height: 30 * size,
  };
  const padPaint = fill(look.pad);
  const padRim = stroke(look.padRim, 1.8, 0.85);

  canvas.drawOval(
    {
      x: padRect.x,
      y: padRect.y + 3,
      width: padRect.width,
      height: padRect.height,
    },
    fill(look.ao, 0.45),
  );
  canvas.drawOval(padRect, padPaint);
  canvas.drawOval(padRect, padRim);

  // Teal sepals with 3D gradient
  for (const angle of [-172, -8, 172, 8]) {
    const sepalPath = leafPath(
      { x: base.x, y: base.y + 4 },
      78 * size,
      24 * size,
      angle,
      0,
      0.5,
    );
    canvas.drawPath(
      sepalPath,
      fill(look.sepal[angle > 0 && angle < 90 ? 1 : 0]),
    );
  }

  // 2. Back Petals
  drawPetalRow(
    canvas,
    base,
    [-168, -146, -124, -56, -34, -12],
    70 * size,
    32 * size,
    look.back,
    look,
  );

  // 3. Middle Petals
  drawPetalRow(
    canvas,
    base,
    [-156, -134, -112, -68, -46, -24],
    64 * size,
    32 * size,
    look.mid,
    look,
  );
}

export function drawLotusFront(
  canvas: SkCanvas,
  at: Point,
  size: number,
  look: LotusLook = LOTUS_LOOK,
) {
  const base = { x: at.x, y: at.y + 4 * size };

  // 1. Mid-Front Petals
  drawPetalRow(
    canvas,
    base,
    [-150, -124, -56, -30],
    44 * size,
    28 * size,
    look.mid,
    look,
    true,
  );

  // 2. Foremost Petals (Right against viewer)
  drawPetalRow(
    canvas,
    base,
    [-112, -90, -68],
    38 * size,
    28 * size,
    look.front,
    look,
    true,
  );
}
