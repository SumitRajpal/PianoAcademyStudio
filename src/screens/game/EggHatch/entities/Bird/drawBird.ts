/**
 * A small paper bird flying left, in two pieces so it can flap:
 * `drawBirdBody` (body, head, tail, centred on (0,0)) and `drawBirdWing`
 * (one wing hinged at the shoulder (0,0), pointing up). The scene draws the
 * far wing, the body, then the near wing, and swings both wings.
 */

import type { SkCanvas } from 'react-native-skia';

import { fill } from '../../shared/paperKit';
import { leafPath } from '../../shared/paperShapes';
import { BIRD_LOOK, type BirdLook } from './birdLook';

export function drawBirdBody(canvas: SkCanvas, size: number, look: BirdLook = BIRD_LOOK) {
  const s = size;
  // Tail fanning back to the right.
  canvas.drawPath(leafPath({ x: s * 0.3, y: 0 }, s * 0.5, s * 0.26, 8, 0.2), fill(look.body));
  canvas.drawOval({ x: -s * 0.42, y: -s * 0.16, width: s * 0.84, height: s * 0.32 }, fill(look.body));
  canvas.drawOval({ x: -s * 0.3, y: -s * 0.02, width: s * 0.5, height: s * 0.15 }, fill(look.belly, 0.6));
  canvas.drawCircle(-s * 0.4, -s * 0.1, s * 0.15, fill(look.body));
  // Beak and eye.
  canvas.drawPath(leafPath({ x: -s * 0.52, y: -s * 0.1 }, s * 0.14, s * 0.07, 180), fill(look.body));
  canvas.drawCircle(-s * 0.44, -s * 0.13, s * 0.03, fill(look.eye));
}

export function drawBirdWing(canvas: SkCanvas, size: number, look: BirdLook = BIRD_LOOK) {
  canvas.drawPath(leafPath({ x: 0, y: 0 }, size * 0.7, size * 0.3, -78, 0.4, 0.35), fill(look.wing));
}
