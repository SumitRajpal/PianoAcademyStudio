/**
 * A band of soft volumetric mist along the forest floor.
 * Rendered with physical in-scattering and exponential vapor diffusion:
 * - Multi-layer puff structure: dense core vapor + ethereal diffuse plumes.
 * - Screen blend mode to seamlessly illuminate ground vegetation.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { blurred, fill, seeded } from '../../shared/paperKit';
import { MIST_LOOK, type MistLook } from './mistLook';

export function drawMist(
  canvas: SkCanvas,
  width: number,
  y: number,
  seed: number,
  look: MistLook = MIST_LOOK,
) {
  const rand = seeded(seed);

  // 1. Ethereal Wide Diffusion Layer
  const widePaint = blurred(fill(look.color, look.alpha * 0.5), look.softness * 1.4);
  widePaint.setBlendMode(BlendMode.Screen);

  // 2. Core Vapor Plume Layer
  const corePaint = blurred(fill(look.color, look.alpha * 0.8), look.softness * 0.8);
  corePaint.setBlendMode(BlendMode.Screen);

  const puffs = 10;
  for (let i = 0; i < puffs; i++) {
    const x = (i / puffs) * width;
    const rx = rand.range(80, 140);
    const ry = rand.range(14, 26);
    const cy = y + rand.range(-12, 12);

    for (const shift of [0, width, -width]) {
      // Wide plume
      canvas.drawOval({ x: x + shift - rx * 1.2, y: cy - ry * 1.2, width: rx * 2.4, height: ry * 2.4 }, widePaint);
      // Core vapor
      canvas.drawOval({ x: x + shift - rx, y: cy - ry, width: rx * 2, height: ry * 2 }, corePaint);
    }
  }
}
