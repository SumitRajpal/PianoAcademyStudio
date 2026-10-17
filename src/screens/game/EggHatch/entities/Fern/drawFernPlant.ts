/**
 * A fern plant growing from (0,0): a handful of arching fronds. The scene
 * rotates the whole plant gently around its base so it sways in the breeze.
 */

import type { SkCanvas } from 'react-native-skia';

import { drawFern } from '../../shared/foliage';
import { paperSheet } from '../../shared/paperKit';
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
  paperSheet(canvas, { dx: 2, dy: 4, blur: 4, alpha: 0.55 }, c => {
    for (const f of fronds) {
      drawFern(c, {
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
  });
}
