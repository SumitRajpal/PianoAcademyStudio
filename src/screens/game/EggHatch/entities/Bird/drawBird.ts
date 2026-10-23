/**
 * A small night bird flying across the moonlit sky, rendered in 3D CGI stylized
 * cartoon aesthetic (Pixar / The Incredibles standard):
 * - Volumetric aerodynamic body with moonlight rim light kicker along the spine.
 * - Layered 3D wing with light transmittance (SSS) on flight feather tips.
 * - Sculpted beak with specular sheen and luminous eye glint.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { fill, linearGradient, radialGradient, stroke } from '../../shared/paperKit';
import { leafPath } from '../../shared/paperShapes';
import { BIRD_LOOK, type BirdLook } from './birdLook';

export function drawBirdBody(canvas: SkCanvas, size: number, look: BirdLook = BIRD_LOOK) {
  const s = size;

  // 1. Tail with feathered ridges
  const tail = leafPath({ x: s * 0.3, y: 0 }, s * 0.52, s * 0.26, 8, 0.2);
  canvas.drawPath(tail, fill(look.body));
  // Tail rim highlight
  const tailRim = stroke('#4a7896', 0.8, 0.5);
  tailRim.setBlendMode(BlendMode.Screen);
  canvas.drawPath(tail, tailRim);

  // 2. Volumetric 3D Aerodynamic Body
  const bodyOval = { x: -s * 0.42, y: -s * 0.16, width: s * 0.84, height: s * 0.32 };
  const bodyPaint = linearGradient(
    { x: 0, y: -s * 0.16 },
    { x: 0, y: s * 0.16 },
    ['#315773', look.body, '#060f18'],
    [0.0, 0.5, 1.0]
  );
  canvas.drawOval(bodyOval, bodyPaint);

  // Soft glowing belly with bounce fill
  const bellyPaint = radialGradient(
    { x: -s * 0.05, y: s * 0.05 }, s * 0.25,
    [
      { color: look.belly, alpha: 0.85, at: 0 },
      { color: look.body, alpha: 0, at: 1 },
    ]
  );
  canvas.drawOval({ x: -s * 0.3, y: -s * 0.02, width: s * 0.5, height: s * 0.15 }, bellyPaint);

  // 3. Rounded Head with 3D Sphere Highlight
  const headPaint = radialGradient(
    { x: -s * 0.43, y: -s * 0.13 }, s * 0.15,
    [
      { color: '#457494', at: 0 },
      { color: look.body, at: 0.7 },
      { color: '#060f18', at: 1 },
    ]
  );
  canvas.drawCircle(-s * 0.4, -s * 0.1, s * 0.15, headPaint);

  // Dorsal rim kicker (moonlight along top of body and head)
  const dorsalRim = stroke('#7cb6d9', 1.0, 0.6);
  dorsalRim.setBlendMode(BlendMode.Screen);
  canvas.drawArc({ x: -s * 0.46, y: -s * 0.22, width: s * 0.22, height: s * 0.2 }, 190, 110, false, dorsalRim);

  // 4. Glossy Beak with Specular Sheen
  const beak = leafPath({ x: -s * 0.52, y: -s * 0.1 }, s * 0.14, s * 0.07, 180);
  canvas.drawPath(beak, fill('#d49742'));
  const beakSpec = stroke('#ffffff', 0.6, 0.75);
  canvas.drawLine(-s * 0.52, -s * 0.1, -s * 0.58, -s * 0.1, beakSpec);

  // 5. Expressive Eye with Specular Glint
  canvas.drawCircle(-s * 0.44, -s * 0.13, s * 0.032, fill(look.eye));
  canvas.drawCircle(-s * 0.442, -s * 0.135, s * 0.012, fill('#ffffff', 0.95));
}

export function drawBirdWing(canvas: SkCanvas, size: number, look: BirdLook = BIRD_LOOK) {
  const wingPath = leafPath({ x: 0, y: 0 }, size * 0.72, size * 0.32, -78, 0.4, 0.35);

  // Volumetric Wing Gradient
  const wingPaint = linearGradient(
    { x: -size * 0.2, y: -size * 0.5 },
    { x: size * 0.2, y: 0 },
    ['#3e6b8c', look.wing, '#07121c'],
    [0.0, 0.5, 1.0]
  );
  canvas.drawPath(wingPath, wingPaint);

  // Flight feather SSS edge highlight catching moonlight
  const featherRim = stroke('#82c4eb', 1.1, 0.65);
  featherRim.setBlendMode(BlendMode.Screen);
  canvas.drawPath(wingPath, featherRim);
}
