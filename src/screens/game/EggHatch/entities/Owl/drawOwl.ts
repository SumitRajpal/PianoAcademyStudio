/**
 * An owl perched on a branch, rendered in 3D CGI stylized cartoon aesthetic
 * (Pixar / The Incredibles standard):
 * - Volumetric cylindrical/spherical body with directional key light and rim light.
 * - Layered 3D wings with depth and contact ambient occlusion.
 * - Rounded feathered belly with subsurface light transmittance.
 * - Pixar-style expressive eyes: limbal ring, warm amber iris, eyelid shadow,
 *   and dual specular cornea glints.
 * - Glossy 3D beak with specular sheen and branch contact shadow.
 */

import { BlendMode, BlurStyle, PaintStyle, Skia, TileMode, type SkCanvas } from 'react-native-skia';

import { blurred, fill, radialGradient, stroke, twoPointConicalGradient } from '../../shared/paperKit';
import { eggPath, leafPath } from '../../shared/paperShapes';
import { OWL_LOOK, type OwlLook } from './owlLook';

/** Eye centres and radius as fractions of the owl's size. */
export const OWL_EYES = { dx: 0.2, y: -0.12, r: 0.15 };

export function drawOwl(canvas: SkCanvas, size: number, look: OwlLook = OWL_LOOK) {
  const s = size;

  // 1. Branch Contact AO Shadow under feet
  canvas.drawOval(
    { x: -s * 0.35, y: s * 0.44, width: s * 0.7, height: s * 0.12 },
    blurred(fill('rgba(1, 4, 8, 0.6)'), s * 0.05)
  );

  // 2. Ear Tufts: 3D sculpted feathered horns
  for (const side of [-1, 1]) {
    const tuftAngle = side < 0 ? -118 : -62;
    const tuft = leafPath({ x: side * s * 0.24, y: -s * 0.3 }, s * 0.26, s * 0.15, tuftAngle, side * -0.2);
    canvas.drawPath(tuft, fill(look.bodyDark));
    // Rim kicker on outer edge of ear tuft
    const tuftRim = stroke('#8ea89c', 1.2, 0.6);
    tuftRim.setBlendMode(BlendMode.Screen);
    canvas.drawPath(tuft, tuftRim);
  }

  // 3. Volumetric 3D Body Gradient (Two-point conical gradient)
  const body = eggPath({ x: 0, y: 0 }, s * 0.78, s);
  const bodyPaint = twoPointConicalGradient(
    { x: -s * 0.12, y: -s * 0.2 }, s * 0.05,
    { x: 0, y: s * 0.1 }, s * 0.6,
    [look.body, look.bodyDark, '#1f2e30'],
    [0.0, 0.65, 1.0]
  );
  canvas.drawPath(body, bodyPaint);

  // Body rim light kicker (moonlight from top)
  const bodyRim = stroke('#a8cfc2', Math.max(1, s * 0.035), 0.55);
  bodyRim.setBlendMode(BlendMode.Screen);
  canvas.drawPath(body, bodyRim);

  // 4. Volumetric Folded Wings (with contact AO shadow on body flanks)
  for (const side of [-1, 1]) {
    const wingAngle = side < 0 ? 78 : 102;
    const wingPath = leafPath({ x: side * s * 0.3, y: -s * 0.02 }, s * 0.52, s * 0.24, wingAngle, side * 0.3);

    // Flank shadow under wing
    canvas.save();
    canvas.translate(side * s * -0.04, s * 0.04);
    canvas.drawPath(wingPath, blurred(fill('rgba(5, 15, 20, 0.45)'), s * 0.04));
    canvas.restore();

    // 3D wing gradient
    const wingPaint = twoPointConicalGradient(
      { x: side * s * 0.25, y: -s * 0.08 }, s * 0.02,
      { x: side * s * 0.35, y: s * 0.15 }, s * 0.35,
      [look.feather, look.wing, '#203233'],
      [0.0, 0.6, 1.0]
    );
    canvas.drawPath(wingPath, wingPaint);
  }

  // 5. Rounded 3D Belly with Subsurface Light
  const belly = eggPath({ x: 0, y: s * 0.16 }, s * 0.46, s * 0.56);
  const bellyPaint = radialGradient(
    { x: 0, y: s * 0.12 }, s * 0.32,
    [
      { color: '#ffffff', at: 0 },
      { color: look.belly, at: 0.45 },
      { color: '#a2b89c', at: 1 },
    ]
  );
  canvas.drawPath(belly, bellyPaint);

  // Feather scallops with depth (dark groove + subtle highlight)
  const featherDark = stroke(look.feather, Math.max(0.7, s * 0.028), 0.75);
  const featherLight = stroke('#ffffff', Math.max(0.5, s * 0.018), 0.5);
  for (let row = 0; row < 3; row++) {
    for (let i = -1; i <= 1; i++) {
      const x = i * s * 0.11 + (row % 2) * s * 0.055;
      const y = s * (0.08 + row * 0.1);
      // Highlight rim
      canvas.drawArc({ x: x - s * 0.05, y: y - s * 0.032, width: s * 0.1, height: s * 0.07 }, 20, 140, false, featherLight);
      // Main arc
      canvas.drawArc({ x: x - s * 0.05, y: y - s * 0.03, width: s * 0.1, height: s * 0.07 }, 20, 140, false, featherDark);
    }
  }

  // 6. 3D Talons clutching branch
  for (const side of [-1, 1]) {
    for (let k = -1; k <= 1; k++) {
      const tx = side * s * 0.1 + k * s * 0.035;
      const ty = s * 0.47;
      const tr = s * 0.03;
      // Talon shadow
      canvas.drawCircle(tx, ty + tr * 0.3, tr, fill('rgba(0, 0, 0, 0.4)'));
      // 3D talon ball
      canvas.drawCircle(tx, ty, tr, radialGradient(
        { x: tx - tr * 0.3, y: ty - tr * 0.3 }, tr * 1.2,
        [
          { color: '#ffd073', at: 0 },
          { color: look.feet, at: 0.7 },
          { color: '#8a5618', at: 1 },
        ]
      ));
    }
  }

  // 7. Pixar Eyes (Limbal ring, warm amber iris, eyelid shadow, cornea glints)
  for (const side of [-1, 1]) {
    const x = side * s * OWL_EYES.dx;
    const y = s * OWL_EYES.y;
    const r = s * OWL_EYES.r;

    // Atmospheric warm eye glow
    canvas.drawCircle(x, y, r * 1.8, blurred(fill(look.eyeGlow, 0.32), r * 0.7));

    // Outer sculpt eye ring (ivory socket rim)
    canvas.drawCircle(x, y, r * 1.22, radialGradient(
      { x: x - r * 0.2, y: y - r * 0.3 }, r * 1.4,
      [
        { color: '#fff9e6', at: 0 },
        { color: look.eyeRing, at: 0.7 },
        { color: '#c4b58e', at: 1 },
      ]
    ));

    // Dark limbal ring
    canvas.drawCircle(x, y, r * 1.05, fill('#3d2b10'));

    // Warm luminous amber iris
    canvas.drawCircle(x, y, r, radialGradient(
      { x: x, y: y }, r,
      [
        { color: '#ffffff', at: 0 },
        { color: look.eye, at: 0.4 },
        { color: '#e69d1e', at: 0.8 },
        { color: '#7a4205', at: 1 },
      ]
    ));

    // Upper eyelid shadow (occlusion inside eye)
    const lidShadow = Skia.Paint();
    lidShadow.setColor(Skia.Color('rgba(20, 10, 0, 0.6)'));
    lidShadow.setBlendMode(BlendMode.Multiply);
    canvas.save();
    canvas.clipPath(Skia.Path.Circle(x, y, r), 0 as any, true);
    canvas.drawRect({ x: x - r, y: y - r, width: r * 2, height: r * 0.75 }, lidShadow);
    canvas.restore();

    // Pupil
    const pupilX = x + side * r * 0.08;
    const pupilY = y + r * 0.06;
    const pupilR = r * 0.52;
    canvas.drawCircle(pupilX, pupilY, pupilR, fill(look.pupil));

    // Cornea Specular Glint 1 (Key light highlight)
    canvas.drawCircle(x - r * 0.26, y - r * 0.28, r * 0.22, fill('#ffffff', 0.96));

    // Cornea Specular Glint 2 (Secondary bounce highlight)
    canvas.drawCircle(x + r * 0.18, y + r * 0.22, r * 0.09, fill('rgba(255, 245, 200, 0.7)'));
  }

  // 8. Glossy 3D Beak with Specular Sheen
  const beakPath = leafPath({ x: 0, y: s * 0.0 }, s * 0.15, s * 0.11, 90, 0, 0.4);
  const beakPaint = radialGradient(
    { x: -s * 0.02, y: -s * 0.02 }, s * 0.12,
    [
      { color: '#ffd580', at: 0 },
      { color: look.beak, at: 0.65 },
      { color: '#8f4f0e', at: 1 },
    ]
  );
  canvas.drawPath(beakPath, beakPaint);

  // Beak specular sheen
  const beakSpec = fill('#ffffff', 0.75);
  beakSpec.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 0.8, true));
  canvas.drawOval({ x: -s * 0.02, y: -s * 0.04, width: s * 0.04, height: s * 0.06 }, beakSpec);
}

/** Both eyelids, fully closed. Scale them on y around the eye line to blink. */
export function drawOwlEyelids(canvas: SkCanvas, size: number, look: OwlLook = OWL_LOOK) {
  const s = size;
  for (const side of [-1, 1]) {
    const x = side * s * OWL_EYES.dx;
    const y = s * OWL_EYES.y;
    const r = s * OWL_EYES.r * 1.22;
    canvas.drawCircle(x, y, r, fill(look.bodyDark));
    canvas.drawArc(
      { x: x - r * 0.8, y: y - r * 0.5, width: r * 1.6, height: r },
      20,
      140,
      false,
      stroke(look.body, Math.max(0.8, s * 0.03)),
    );
  }
}
