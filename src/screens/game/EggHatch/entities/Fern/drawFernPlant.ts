/**
 * A fern plant growing from (0,0): rendered in 3D CGI stylized cartoon aesthetic
 * (Pixar / The Incredibles standard):
 * - Arching fronds with natural curvature and light transmittance.
 * - Soft ground contact ambient occlusion at the root base.
 */

import type { SkCanvas } from 'react-native-skia';

import { drawFern } from '../../shared/foliage';
import { fill } from '../../shared/paperKit';
import { polar } from '../../shared/paperShapes';
import { FERN_LOOK, type FernLook } from './fernLook';

export type Frond = {
  /** Direction the frond grows (degrees, -90 = straight up). */
  angle: number;
  length: number;
  /** How much it arches over (degrees), positive = clockwise. */
  curl: number;
  dark?: boolean;
};

export function drawFernPlant(canvas: SkCanvas, fronds: Frond[], look: FernLook = FERN_LOOK) {
  const base = { x: 0, y: 0 };

  // Contact AO shadow at fern base
  canvas.drawOval(
    { x: -16, y: -4, width: 32, height: 10 },
    fill('rgba(1, 4, 8, 0.45)')
  );

  for (const f of fronds) {
    drawFern(canvas, {
      base,
      control: polar(base, f.length * 0.62, f.angle - f.curl * 0.4),
      tip: polar(base, f.length, f.angle + f.curl),
      leaflet: f.length * 0.3,
      pairs: Math.round(f.length / 5.5),
      color: f.dark ? look.dark : look.frond,
      accent: f.dark ? undefined : look.accent,
      stemColor: look.stem,
    });
  }
}
