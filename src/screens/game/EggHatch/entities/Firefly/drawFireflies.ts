/**
 * Draws every firefly at time `t`: a blurred glow and a bright core each.
 * The app builds the same picture from `fireflyPose` on the UI thread.
 */

import type { SkCanvas } from 'react-native-skia';

import { blurred, fill } from '../../shared/paperKit';
import { FIREFLY_LOOK, type FireflyLook } from './fireflyLook';
import { FIREFLY_HOMES, fireflyPose } from './fireflyMotion';

export function drawFireflies(canvas: SkCanvas, t: number, look: FireflyLook = FIREFLY_LOOK) {
  for (let i = 0; i < FIREFLY_HOMES.length; i++) {
    const p = fireflyPose(i, t);
    const color = p.warm ? look.warm : look.cool;
    canvas.drawCircle(p.x, p.y, p.r * 4, blurred(fill(color, look.glowAlpha * p.glow), p.r * 2.2));
    canvas.drawCircle(p.x, p.y, p.r, fill('#ffffff', 0.6 + p.glow * 0.4));
  }
}
