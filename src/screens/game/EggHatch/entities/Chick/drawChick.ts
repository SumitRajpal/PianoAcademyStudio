/**
 * The chick, centred on its body (0,0) with body radius `r`, in pieces so it
 * can celebrate:
 * - `drawChickBody`: round fluffy body, head tuft, beak, rosy cheeks, eyes.
 * - `drawChickWing`: one wing hinged at (0,0); the scene places it at
 *   CHICK_SHOULDER and flaps it.
 */

import type { SkCanvas } from 'react-native-skia';

import { fill, paperSheet, radialGradient } from '../../shared/paperKit';
import { leafPath } from '../../shared/paperShapes';
import { CHICK_LOOK, type ChickLook } from './chickLook';

/** Where each wing hinges, as fractions of the body radius. */
export const CHICK_SHOULDER = { x: 0.78, y: 0.06 };

export function drawChickWing(canvas: SkCanvas, r: number, side: -1 | 1, look: ChickLook = CHICK_LOOK) {
  canvas.drawPath(
    leafPath({ x: 0, y: 0 }, r * 0.72, r * 0.44, side < 0 ? -150 : -30, side * 0.4),
    fill(look.wing),
  );
}

export function drawChickBody(canvas: SkCanvas, r: number, look: ChickLook = CHICK_LOOK) {
  paperSheet(canvas, { dx: 1, dy: 3, blur: 3, alpha: 0.4 }, c => {
    // Tuft.
    for (const a of [-112, -90, -70]) {
      c.drawPath(leafPath({ x: 0, y: -r * 0.92 }, r * 0.42, r * 0.16, a, 0.4), fill(look.tuft));
    }
    c.drawOval(
      { x: -r, y: -r, width: r * 2, height: r * 1.92 },
      radialGradient({ x: -r * 0.25, y: -r * 0.35 }, r * 1.4, [
        { color: look.body[0], at: 0 },
        { color: look.body[1], at: 0.55 },
        { color: look.body[2], at: 1 },
      ]),
    );
    c.drawOval({ x: -r * 0.5, y: r * 0.18, width: r, height: r * 0.66 }, fill(look.belly, 0.7));
  });
  for (const side of [-1, 1]) {
    canvas.drawOval({ x: side * r * 0.36 - r * 0.1, y: -r * 0.32, width: r * 0.2, height: r * 0.26 }, fill(look.eye));
    canvas.drawCircle(side * r * 0.36 - r * 0.03, -r * 0.26, r * 0.05, fill('#ffffff'));
    canvas.drawOval({ x: side * r * 0.6 - r * 0.14, y: -r * 0.04, width: r * 0.28, height: r * 0.16 }, fill(look.cheek, 0.75));
  }
  canvas.drawPath(leafPath({ x: -r * 0.14, y: -r * 0.08 }, r * 0.28, r * 0.2, 0, 0, 0.5), fill(look.beak));
}
