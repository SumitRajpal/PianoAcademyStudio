/**
 * The chick, centred on its body (0,0) with body radius `r`.
 * Rendered in 3D CGI stylized cartoon aesthetic (Pixar / The Incredibles standard):
 * - Volumetric 3D fluffy spherical body with off-center key light.
 * - Subsurface scattering (warm amber-orange glow through feather tufts and wings).
 * - Full 2D Pixar Eyes: large, glossy, expressive with dual cornea specular glints.
 * - 3D glossy rounded beak with highlight ridge.
 * - Ambient occlusion and contact shadows under wings and chin.
 * - Luminous Fresnel rim kicker light carving the chick from the egg cup.
 */

import {
  BlendMode,
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  TileMode,
  type SkCanvas,
} from 'react-native-skia';

import {
  blurred,
  fill,
  stroke,
  twoPointConicalGradient,
} from '../../shared/paperKit';
import { leafPath } from '../../shared/paperShapes';
import { CHICK_LOOK, type ChickLook } from './chickLook';

/** Where each wing hinges, as fractions of the body radius. */
export const CHICK_SHOULDER = { x: 0.78, y: 0.06 };

export function drawChickWing(
  canvas: SkCanvas,
  r: number,
  side: -1 | 1,
  look: ChickLook = CHICK_LOOK,
) {
  const wingPath = leafPath(
    { x: 0, y: 0 },
    r * 0.72,
    r * 0.44,
    side < 0 ? -150 : -30,
    side * 0.4,
  );

  // 1. Volumetric Wing Gradient
  const wingPaint = Skia.Paint();
  wingPaint.setAntiAlias(true);
  wingPaint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: -r * 0.2 },
      { x: side * r * 0.5, y: r * 0.35 },
      [
        Skia.Color(look.wingHighlight),
        Skia.Color(look.wing),
        Skia.Color(look.wingShadow),
      ],
      [0.0, 0.45, 1.0],
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(wingPath, wingPaint);

  // 2. SSS Translucent Feather Glow along Wing Edge
  const sssPaint = Skia.Paint();
  sssPaint.setStyle(PaintStyle.Stroke);
  sssPaint.setStrokeWidth(Math.max(1.2, r * 0.06));
  sssPaint.setColor(Skia.Color(look.sss));
  sssPaint.setMaskFilter(
    Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r * 0.08, true),
  );
  sssPaint.setBlendMode(BlendMode.Plus);
  canvas.drawPath(wingPath, sssPaint);
}

export function drawChickBody(
  canvas: SkCanvas,
  r: number,
  look: ChickLook = CHICK_LOOK,
) {
  // 1. Soft Ambient Contact Shadow Under Chick
  canvas.drawOval(
    { x: -r * 0.9, y: r * 0.6, width: r * 1.8, height: r * 0.45 },
    blurred(fill(look.ao, look.aoAlpha), r * 0.22),
  );

  // 2. Head Tufts with 3D Volumetric Volume & SSS
  for (const a of [-112, -90, -70]) {
    const tuft = leafPath({ x: 0, y: -r * 0.92 }, r * 0.44, r * 0.17, a, 0.4);
    const tuftGrad = Skia.Paint();
    tuftGrad.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: 0, y: -r * 1.3 },
        { x: 0, y: -r * 0.9 },
        [Skia.Color(look.tuftHighlight), Skia.Color(look.tuft)],
        [0.0, 1.0],
        TileMode.Clamp,
      ),
    );
    canvas.drawPath(tuft, tuftGrad);

    // Tuft SSS edge glow
    const tuftSss = stroke(look.sss, 1.2);
    tuftSss.setBlendMode(BlendMode.Screen);
    canvas.drawPath(tuft, tuftSss);
  }

  // 3. Volumetric 3D Fluffy Spherical Body Gradient
  const bodyOval = { x: -r, y: -r, width: r * 2, height: r * 1.94 };
  const bodyPath = Skia.Path.Oval(bodyOval);

  const bodyPaint = twoPointConicalGradient(
    { x: -r * 0.32, y: -r * 0.38 },
    0,
    { x: 0, y: r * 0.2 },
    r * 1.95,
    look.body,
    [0.0, 0.35, 0.75, 1.0],
  );
  canvas.drawPath(bodyPath, bodyPaint);

  // 4. Subsurface Scattering: Warm Amber/Orange Light Bleed
  const sssPaint = Skia.Paint();
  sssPaint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: r * 0.3, y: r * 0.4 },
      r * 1.4,
      [Skia.Color(look.sss), Skia.Color('transparent')],
      [0.0, 1.0],
      TileMode.Clamp,
    ),
  );
  sssPaint.setAlphaf(look.sssAlpha);
  sssPaint.setBlendMode(BlendMode.Screen);
  canvas.drawPath(bodyPath, sssPaint);

  // 5. 3D Fluffy Rounded Belly
  const bellyPaint = Skia.Paint();
  bellyPaint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: 0, y: r * 0.3 },
      r * 0.65,
      [Skia.Color(look.belly), Skia.Color(look.bellyShadow)],
      [0.2, 1.0],
      TileMode.Clamp,
    ),
  );
  bellyPaint.setAlphaf(0.85);
  canvas.drawOval(
    { x: -r * 0.52, y: r * 0.16, width: r * 1.04, height: r * 0.7 },
    bellyPaint,
  );

  // 6. Form Shadow & Ambient Occlusion inside body
  canvas.save();
  canvas.clipPath(bodyPath, ClipOp.Intersect, true);

  const shadowPaint = Skia.Paint();
  shadowPaint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: -r * 0.2, y: -r * 0.2 },
      { x: r * 0.8, y: r * 0.9 },
      [Skia.Color('transparent'), Skia.Color(look.ao)],
      [0.3, 1.0],
      TileMode.Clamp,
    ),
  );
  shadowPaint.setAlphaf(look.aoAlpha);
  shadowPaint.setBlendMode(BlendMode.Multiply);
  canvas.drawRect(
    { x: -r * 2, y: -r * 2, width: r * 4, height: r * 4 },
    shadowPaint,
  );

  // Specular sheen on head
  const specPaint = Skia.Paint();
  specPaint.setColor(Skia.Color('#ffffff'));
  specPaint.setMaskFilter(
    Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r * 0.16, true),
  );
  specPaint.setBlendMode(BlendMode.Plus);
  specPaint.setAlphaf(0.65);
  canvas.drawOval(
    { x: -r * 0.55, y: -r * 0.72, width: r * 0.55, height: r * 0.38 },
    specPaint,
  );

  canvas.restore();

  // 7. Luminous Fresnel Rim Kicker Light
  const rimPaint = Skia.Paint();
  rimPaint.setStyle(PaintStyle.Stroke);
  rimPaint.setStrokeWidth(Math.max(1.2, r * 0.07));
  rimPaint.setColor(Skia.Color(look.rim));
  rimPaint.setBlendMode(BlendMode.Plus);
  canvas.drawPath(bodyPath, rimPaint);

  // 8. The 2D Pixar Eye Formula for the Chick
  for (const side of [-1, 1]) {
    const eyeCx = side * r * 0.36;
    const eyeCy = -r * 0.18;
    const eyeRx = r * 0.11;
    const eyeRy = r * 0.15;
    const eyeRect = {
      x: eyeCx - eyeRx,
      y: eyeCy - eyeRy,
      width: eyeRx * 2,
      height: eyeRy * 2,
    };

    const eyePath = Skia.Path.Oval(eyeRect);

    canvas.save();
    canvas.clipPath(eyePath, ClipOp.Intersect, true);

    // Sclera with soft warm ivory gradient
    const scleraPaint = Skia.Paint();
    scleraPaint.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: eyeCx, y: eyeCy },
        eyeRy,
        [Skia.Color(look.eyeSclera), Skia.Color('#e0e4ee')],
        [0.5, 1.0],
        TileMode.Clamp,
      ),
    );
    canvas.drawPath(eyePath, scleraPaint);

    // Eyelid ambient shadow
    const lidShadow = Skia.Paint();
    lidShadow.setColor(Skia.Color(look.eyeShadow));
    lidShadow.setBlendMode(BlendMode.Multiply);
    canvas.drawRect(
      {
        x: eyeCx - eyeRx,
        y: eyeCy - eyeRy,
        width: eyeRx * 2,
        height: eyeRy * 0.5,
      },
      lidShadow,
    );

    // Deep Iris with Warm Amber Radiance
    const irisR = eyeRy * 0.88;
    const irisPaint = Skia.Paint();
    irisPaint.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: eyeCx, y: eyeCy + eyeRy * 0.1 },
        irisR,
        [
          Skia.Color(look.eyeIrisLight),
          Skia.Color(look.eyeIris),
          Skia.Color(look.eyePupil),
        ],
        [0.0, 0.65, 1.0],
        TileMode.Clamp,
      ),
    );
    canvas.drawCircle(eyeCx, eyeCy, irisR, irisPaint);

    // Pupil
    canvas.drawCircle(eyeCx, eyeCy, irisR * 0.52, fill(look.eyePupil));

    // Dual Cornea Specular Highlights: Primary (10 o'clock) & Bounce (4 o'clock)
    const specPrimary = Skia.Paint();
    specPrimary.setColor(Skia.Color(look.eyeSpecular));
    specPrimary.setBlendMode(BlendMode.Plus);
    canvas.drawCircle(
      eyeCx - irisR * 0.35,
      eyeCy - irisR * 0.35,
      irisR * 0.32,
      specPrimary,
    );

    const specBounce = Skia.Paint();
    specBounce.setColor(Skia.Color('rgba(255, 255, 255, 0.5)'));
    specBounce.setBlendMode(BlendMode.Plus);
    canvas.drawCircle(
      eyeCx + irisR * 0.32,
      eyeCy + irisR * 0.32,
      irisR * 0.16,
      specBounce,
    );

    canvas.restore();

    // Rosy Feathered Cheek Blush
    const blushPaint = Skia.Paint();
    blushPaint.setColor(Skia.Color(look.cheek));
    blushPaint.setAlphaf(0.72);
    blushPaint.setMaskFilter(
      Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r * 0.08, true),
    );
    canvas.drawOval(
      {
        x: side * r * 0.58 - r * 0.14,
        y: -r * 0.02,
        width: r * 0.28,
        height: r * 0.16,
      },
      blushPaint,
    );
  }

  // 9. 3D Glossy Rounded Beak
  const beakW = r * 0.3;
  const beakH = r * 0.22;
  const beakPath = leafPath(
    { x: -beakW * 0.48, y: -r * 0.06 },
    beakW,
    beakH,
    0,
    0,
    0.5,
  );

  // Beak shadow under lip
  canvas.drawPath(beakPath, blurred(fill(look.ao, 0.45), 2));

  // Beak volumetric gradient
  const beakGrad = Skia.Paint();
  beakGrad.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: -r * 0.12 },
      { x: 0, y: r * 0.06 },
      [
        Skia.Color(look.beakHighlight),
        Skia.Color(look.beak),
        Skia.Color(look.beakShadow),
      ],
      [0.0, 0.5, 1.0],
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(beakPath, beakGrad);

  // Beak specular ridge
  const beakGlint = Skia.Paint();
  beakGlint.setColor(Skia.Color('#ffffff'));
  beakGlint.setAlphaf(0.7);
  beakGlint.setBlendMode(BlendMode.Plus);
  canvas.drawOval(
    { x: -beakW * 0.32, y: -r * 0.08, width: beakW * 0.5, height: beakH * 0.3 },
    beakGlint,
  );
}
