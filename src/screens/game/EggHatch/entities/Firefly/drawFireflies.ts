/**
 * Draws every bioluminescent firefly at time `t`:
 * Rendered with physical light emission:
 * - Multi-ring corona bloom with additive Plus blend mode.
 * - Incandescent white-hot core with Gaussian falloff.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { blurred, fill } from '../../shared/paperKit';
import { FIREFLY_LOOK, type FireflyLook } from './fireflyLook';
import { FIREFLY_HOMES, fireflyPose } from './fireflyMotion';

export function drawFireflies(canvas: SkCanvas, t: number, look: FireflyLook = FIREFLY_LOOK) {
  for (let i = 0; i < FIREFLY_HOMES.length; i++) {
    const p = fireflyPose(i, t);
    const color = p.warm ? look.warm : look.cool;

    // 1. Wide Atmospheric Glow Halo
    const outerHalo = fill(color, look.glowAlpha * p.glow * 0.4);
    outerHalo.setBlendMode(BlendMode.Plus);
    canvas.drawCircle(p.x, p.y, p.r * 5.5, blurred(outerHalo, p.r * 3.0));

    // 2. Bright Corona Ring
    const corona = fill(color, look.glowAlpha * p.glow * 0.85);
    corona.setBlendMode(BlendMode.Plus);
    canvas.drawCircle(p.x, p.y, p.r * 2.8, blurred(corona, p.r * 1.5));

    // 3. Incandescent White-Hot Core
    const core = fill('#ffffff', 0.8 + p.glow * 0.2);
    core.setBlendMode(BlendMode.Plus);
    canvas.drawCircle(p.x, p.y, p.r * 1.2, core);
  }
}
