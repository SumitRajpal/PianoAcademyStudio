/**
 * One piece of celebratory confetti, rendered in 3D CGI stylized cartoon
 * aesthetic (Pixar / The Incredibles standard):
 * - Metallic foil ribbons with specular sheen and edge highlights.
 * - Glossy enameled discs with spherical reflection.
 * - Faceted 4-point diamond sparkles with additive bloom.
 */

import { BlendMode, type SkCanvas } from 'react-native-skia';

import { fill, linearGradient, radialGradient, stroke } from '../../shared/paperKit';
import { sparklePath } from '../../shared/paperShapes';

export const CONFETTI_SHAPES = 3;

export function drawConfettiPiece(canvas: SkCanvas, color: string, shape: number, size: number) {
  if (shape === 0) {
    // 1. Metallic Foil Ribbon with Specular Sheen
    const ribbonPaint = linearGradient(
      { x: -size * 0.35, y: -size },
      { x: size * 0.35, y: size },
      ['#ffffff', color, '#ffffff', color],
      [0.0, 0.35, 0.7, 1.0]
    );
    canvas.drawRRect(
      { rect: { x: -size * 0.35, y: -size, width: size * 0.7, height: size * 2 }, rx: 1.2, ry: 1.2 },
      ribbonPaint
    );
    // Center specular crease line
    canvas.drawLine(0, -size, 0, size, stroke('#ffffff', 0.8, 0.65));
  } else if (shape === 1) {
    // 2. Glossy Enameled Disc
    const discPaint = radialGradient(
      { x: -size * 0.25, y: -size * 0.25 }, size * 0.9,
      [
        { color: '#ffffff', at: 0 },
        { color, at: 0.4 },
        { color: '#1a1020', at: 1 },
      ]
    );
    canvas.drawCircle(0, 0, size * 0.7, discPaint);
    // Specular glint
    canvas.drawCircle(-size * 0.2, -size * 0.25, size * 0.18, fill('#ffffff', 0.9));
  } else {
    // 3. Faceted Diamond Sparkle Star
    const starP = sparklePath({ x: 0, y: 0 }, size * 1.2, 0.3);
    canvas.drawPath(starP, fill(color));

    // Star core bloom
    const starCore = sparklePath({ x: 0, y: 0 }, size * 0.6, 0.3);
    const corePaint = fill('#ffffff', 0.95);
    corePaint.setBlendMode(BlendMode.Plus);
    canvas.drawPath(starCore, corePaint);
  }
}
