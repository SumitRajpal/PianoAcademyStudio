/**
 * An owl perched on a branch, drawn centred on (0,0) with its feet at
 * y = 0.5 * size. Big glowing eyes, ear tufts, folded wings and a scalloped
 * cream belly. `drawOwlEyelids` draws the lids alone, so the scene can scale
 * them shut for a blink; `OWL_EYES` says where they sit.
 */

import type { SkCanvas } from 'react-native-skia';

import { blurred, fill, paperSheet, radialGradient, stroke } from '../../shared/paperKit';
import { eggPath, leafPath } from '../../shared/paperShapes';
import { OWL_LOOK, type OwlLook } from './owlLook';

/** Eye centres and radius as fractions of the owl's size. */
export const OWL_EYES = { dx: 0.2, y: -0.12, r: 0.15 };

export function drawOwl(canvas: SkCanvas, size: number, look: OwlLook = OWL_LOOK) {
  const s = size;
  paperSheet(canvas, { dx: 1, dy: 2, blur: 2.5, alpha: 0.55 }, c => {
    // Ear tufts.
    c.drawPath(leafPath({ x: -s * 0.24, y: -s * 0.3 }, s * 0.24, s * 0.14, -118, 0.2), fill(look.bodyDark));
    c.drawPath(leafPath({ x: s * 0.24, y: -s * 0.3 }, s * 0.24, s * 0.14, -62, -0.2), fill(look.bodyDark));
    // Body.
    const body = eggPath({ x: 0, y: 0 }, s * 0.78, s);
    c.drawPath(
      body,
      radialGradient({ x: -s * 0.12, y: -s * 0.2 }, s * 0.8, [
        { color: look.body, at: 0 },
        { color: look.bodyDark, at: 1 },
      ]),
    );
    // Belly with feather scallops.
    const belly = eggPath({ x: 0, y: s * 0.16 }, s * 0.46, s * 0.56);
    c.drawPath(belly, fill(look.belly));
    const feather = stroke(look.feather, Math.max(0.6, s * 0.025));
    for (let row = 0; row < 3; row++) {
      for (let i = -1; i <= 1; i++) {
        const x = i * s * 0.11 + (row % 2) * s * 0.055;
        const y = s * (0.08 + row * 0.1);
        c.drawArc({ x: x - s * 0.05, y: y - s * 0.03, width: s * 0.1, height: s * 0.07 }, 20, 140, false, feather);
      }
    }
    // Folded wings.
    c.drawPath(leafPath({ x: -s * 0.3, y: -s * 0.02 }, s * 0.5, s * 0.22, 78, 0.3), fill(look.wing));
    c.drawPath(leafPath({ x: s * 0.3, y: -s * 0.02 }, s * 0.5, s * 0.22, 102, -0.3), fill(look.wing));
    // Feet.
    for (const side of [-1, 1]) {
      for (let k = -1; k <= 1; k++) {
        c.drawCircle(side * s * 0.1 + k * s * 0.035, s * 0.47, s * 0.028, fill(look.feet));
      }
    }
  });
  // Glowing eyes.
  for (const side of [-1, 1]) {
    const x = side * s * OWL_EYES.dx;
    const y = s * OWL_EYES.y;
    const r = s * OWL_EYES.r;
    canvas.drawCircle(x, y, r * 1.7, blurred(fill(look.eyeGlow, 0.35), r * 0.8));
    canvas.drawCircle(x, y, r * 1.18, fill(look.eyeRing));
    canvas.drawCircle(x, y, r, fill(look.eye));
    canvas.drawCircle(x + side * r * 0.12, y + r * 0.08, r * 0.52, fill(look.pupil));
    canvas.drawCircle(x - r * 0.2, y - r * 0.28, r * 0.2, fill('#ffffff', 0.9));
  }
  // Beak.
  canvas.drawPath(leafPath({ x: 0, y: s * 0.0 }, s * 0.14, s * 0.1, 90, 0, 0.4), fill(look.beak));
}

/** Both eyelids, fully closed. Scale them on y around the eye line to blink. */
export function drawOwlEyelids(canvas: SkCanvas, size: number, look: OwlLook = OWL_LOOK) {
  const s = size;
  for (const side of [-1, 1]) {
    const r = s * OWL_EYES.r * 1.22;
    canvas.drawCircle(side * s * OWL_EYES.dx, s * OWL_EYES.y, r, fill(look.body));
    canvas.drawArc(
      { x: side * s * OWL_EYES.dx - r * 0.8, y: s * OWL_EYES.y - r * 0.5, width: r * 1.6, height: r },
      20,
      140,
      false,
      stroke(look.bodyDark, Math.max(0.8, s * 0.03)),
    );
  }
}
