/**
 * Glowing mushrooms. `drawMushroomCluster` draws a cluster standing on (0,0);
 * `drawMushroomGlow` is its light pool, drawn separately so it can pulse.
 */

import { Skia, type SkCanvas } from 'react-native-skia';

import { drawGlow, fill, linearGradient, paperSheet, radialGradient } from '../../shared/paperKit';
import { MUSHROOM_LOOK, type MushroomLook } from './mushroomLook';

/** One mushroom: height, cap width, x offset and lean (degrees). */
const CLUSTER = [
  { x: -16, h: 30, cap: 26, lean: -10 },
  { x: 6, h: 44, cap: 34, lean: 4 },
  { x: 24, h: 22, cap: 20, lean: 14 },
  { x: -2, h: 16, cap: 14, lean: -4 },
];

function drawMushroom(canvas: SkCanvas, x: number, h: number, capW: number, lean: number, look: MushroomLook) {
  canvas.save();
  canvas.translate(x, 0);
  canvas.rotate(lean, 0, 0);
  const sw = capW * 0.22;
  const stem = Skia.PathBuilder.Make()
    .moveTo(-sw * 0.7, 0)
    .quadTo(-sw * 0.4, -h * 0.5, -sw * 0.5, -h)
    .lineTo(sw * 0.5, -h)
    .quadTo(sw * 0.4, -h * 0.5, sw * 0.7, 0)
    .close()
    .build();
  canvas.drawPath(stem, linearGradient({ x: -sw, y: 0 }, { x: sw, y: 0 }, [look.stem, look.stemShade]));
  const cap = Skia.PathBuilder.Make()
    .moveTo(-capW / 2, -h + 2)
    .cubicTo(-capW / 2, -h - capW * 0.62, capW / 2, -h - capW * 0.62, capW / 2, -h + 2)
    .quadTo(0, -h - capW * 0.08, -capW / 2, -h + 2)
    .close()
    .build();
  canvas.drawPath(
    cap,
    radialGradient({ x: -capW * 0.12, y: -h - capW * 0.3 }, capW * 0.7, [
      { color: look.cap[0], at: 0 },
      { color: look.cap[1], at: 0.55 },
      { color: look.cap[2], at: 1 },
    ]),
  );
  const spot = fill(look.spot, 0.85);
  canvas.drawCircle(-capW * 0.18, -h - capW * 0.22, capW * 0.06, spot);
  canvas.drawCircle(capW * 0.14, -h - capW * 0.28, capW * 0.05, spot);
  canvas.drawCircle(capW * 0.3, -h - capW * 0.1, capW * 0.04, spot);
  canvas.restore();
}

export function drawMushroomCluster(canvas: SkCanvas, scale: number, look: MushroomLook = MUSHROOM_LOOK) {
  paperSheet(canvas, { dx: 1, dy: 2, blur: 2, alpha: 0.4 }, c => {
    for (const m of CLUSTER) {
      drawMushroom(c, m.x * scale, m.h * scale, m.cap * scale, m.lean, look);
    }
  });
}

export function drawMushroomGlow(canvas: SkCanvas, scale: number, look: MushroomLook = MUSHROOM_LOOK) {
  drawGlow(canvas, { x: 4 * scale, y: -26 * scale }, 70 * scale, look.glow, look.glowAlpha);
}
