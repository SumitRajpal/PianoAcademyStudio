/**
 * The lotus the egg rests in, in two parts so the egg can sit inside it:
 * `drawLotusBack` (pad, sepals, back and middle petals) goes behind the egg,
 * `drawLotusFront` (the three front petals) goes in front of it. Each row of
 * petals is its own paper sheet, shaded from a deep base to a light tip.
 */

import type { SkCanvas } from 'react-native-skia';

import { fill, linearGradient, paperSheet, stroke, type Point } from '../../shared/paperKit';
import { leafPath, leafVeinPath, polar } from '../../shared/paperShapes';
import { LOTUS_LOOK, type LotusLook } from './lotusLook';

function drawPetalRow(
  canvas: SkCanvas,
  base: Point,
  angles: number[],
  length: number,
  width: number,
  colors: string[],
  look: LotusLook,
) {
  for (const angle of angles) {
    const tip = polar(base, length, angle);
    const petal = leafPath(base, length, width, angle, 0, 0.5);
    canvas.drawPath(petal, linearGradient(base, tip, colors));
    canvas.drawPath(petal, stroke(look.edge, 0.7, 0.35));
    canvas.drawPath(leafVeinPath(base, length * 0.8, angle), stroke(look.vein, 0.7, 0.3));
  }
}

export function drawLotusBack(canvas: SkCanvas, at: Point, size: number, look: LotusLook = LOTUS_LOOK) {
  const base = { x: at.x, y: at.y };
  paperSheet(canvas, { dx: 0, dy: 3, blur: 4, alpha: 0.55 }, c => {
    c.drawOval({ x: at.x - 92 * size, y: at.y - 6 * size, width: 184 * size, height: 30 * size }, fill(look.pad));
    c.drawOval({ x: at.x - 92 * size, y: at.y - 6 * size, width: 184 * size, height: 30 * size }, stroke(look.padRim, 1.6, 0.8));
    // Teal sepals lying flat to both sides.
    for (const angle of [-172, -8, 172, 8]) {
      c.drawPath(leafPath({ x: base.x, y: base.y + 4 }, 78 * size, 24 * size, angle, 0, 0.5), fill(look.sepal[angle > 0 && angle < 90 ? 1 : 0]));
    }
  });
  paperSheet(canvas, { dx: 0, dy: 3, blur: 4, alpha: 0.5 }, c =>
    drawPetalRow(c, base, [-168, -146, -124, -56, -34, -12], 70 * size, 32 * size, look.back, look),
  );
  paperSheet(canvas, { dx: 0, dy: 3, blur: 4, alpha: 0.5 }, c =>
    drawPetalRow(c, base, [-156, -134, -112, -68, -46, -24], 64 * size, 32 * size, look.mid, look),
  );
}

export function drawLotusFront(canvas: SkCanvas, at: Point, size: number, look: LotusLook = LOTUS_LOOK) {
  const base = { x: at.x, y: at.y + 4 * size };
  paperSheet(canvas, { dx: 0, dy: -2, blur: 4, alpha: 0.45 }, c =>
    drawPetalRow(c, base, [-150, -124, -56, -30], 44 * size, 28 * size, look.mid, look),
  );
  paperSheet(canvas, { dx: 0, dy: -2, blur: 4, alpha: 0.45 }, c =>
    drawPetalRow(c, base, [-112, -90, -68], 38 * size, 28 * size, look.front, look),
  );
}
