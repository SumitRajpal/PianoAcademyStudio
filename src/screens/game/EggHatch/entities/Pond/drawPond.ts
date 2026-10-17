/**
 * The pond in the clearing: a cut-paper bank around dark water, moonlight
 * glinting on it, ripples ringing the lotus, and lily pads with a few buds.
 * `pondWaterPath` is the water's outline (the scene clips reflections and
 * running ripples to it); `drawPondRipple` is one ripple ring and
 * `drawMoonGlint` the moon's shimmering reflection.
 */

import { ClipOp, Skia, type SkCanvas, type SkPath } from 'react-native-skia';

import { blurred, fill, paperSheet, seeded, stroke, verticalGradient } from '../../shared/paperKit';
import { POND_LOOK, type PondLook } from './pondLook';

type PondShape = { x: number; y: number; rx: number; ry: number };

/** A wobbly ellipse, so the bank looks hand-cut rather than geometric. */
function wobblyOval(p: PondShape, wobble: number, seed: number) {
  const rand = seeded(seed);
  const n = 18;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rand.range(-wobble, wobble);
    return { x: p.x + Math.cos(a) * p.rx * k, y: p.y + Math.sin(a) * p.ry * k };
  });
  const b = Skia.PathBuilder.Make();
  const mid = (i: number) => {
    const a = pts[i % n];
    const c = pts[(i + 1) % n];
    return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  };
  const start = mid(0);
  b.moveTo(start.x, start.y);
  for (let i = 1; i <= n; i++) {
    const m = mid(i);
    b.quadTo(pts[i % n].x, pts[i % n].y, m.x, m.y);
  }
  return b.close().build();
}

function drawLilyPad(canvas: SkCanvas, x: number, y: number, r: number, notch: number, look: PondLook, color: string) {
  const pad = Skia.PathBuilder.Make()
    .moveTo(x, y)
    .arcToOval({ x: x - r, y: y - r * 0.42, width: r * 2, height: r * 0.84 }, notch + 18, 324, false)
    .close()
    .build();
  canvas.drawPath(pad, fill(color));
  const vein = stroke(look.lilyVein, 0.7, 0.4);
  for (let a = notch + 50; a < notch + 330; a += 55) {
    const rad = (a * Math.PI) / 180;
    canvas.drawLine(x, y, x + Math.cos(rad) * r * 0.8, y + Math.sin(rad) * r * 0.34, vein);
  }
}

/** The water's outline, for clipping reflections and ripples to it. */
export function pondWaterPath(pond: PondShape): SkPath {
  return wobblyOval(pond, 0.04, 11);
}

/** One ripple ring centred on (0,0), radius `rx` by `ry`. */
export function drawPondRipple(canvas: SkCanvas, rx: number, ry: number, look: PondLook = POND_LOOK) {
  canvas.drawOval({ x: -rx, y: -ry, width: rx * 2, height: ry * 2 }, blurred(stroke(look.ripple, 1.6, 0.85), 0.8));
  canvas.drawOval({ x: -rx + 2, y: -ry + 1, width: rx * 2 - 4, height: ry * 2 - 2 }, stroke(look.reflection, 0.6, 0.5));
}

/** The moon's reflection on the water, centred on (0,0): stacked broken glints. */
export function drawMoonGlint(canvas: SkCanvas, look: PondLook = POND_LOOK) {
  const rand = seeded(303);
  for (let i = 0; i < 7; i++) {
    const w = 26 - i * 2.6 + rand.range(-3, 3);
    canvas.drawRRect(
      { rect: { x: -w / 2 + rand.range(-3, 3), y: i * 3.4, width: w, height: 1.8 }, rx: 0.9, ry: 0.9 },
      blurred(fill(look.reflection, 0.55 - i * 0.05), 0.6),
    );
  }
}

export function drawPond(canvas: SkCanvas, pond: PondShape, look: PondLook = POND_LOOK) {
  const rand = seeded(77);
  paperSheet(canvas, { dx: 0, dy: 3, blur: 4, alpha: 0.5 }, c => {
    c.drawPath(wobblyOval({ ...pond, rx: pond.rx + 16, ry: pond.ry + 9 }, 0.05, 3), fill(look.bank));
    c.drawPath(wobblyOval({ ...pond, rx: pond.rx + 16, ry: pond.ry + 9 }, 0.05, 3), stroke(look.bankEdge, 1.2, 0.6));
  });
  const water = wobblyOval(pond, 0.04, 11);
  drawWater(canvas, water, pond, look);
  // Ripples ringing the lotus.
  for (let i = 1; i <= 4; i++) {
    const rx = 70 + i * 30;
    const ry = 13 + i * 6;
    canvas.drawOval({ x: pond.x - rx, y: pond.y - 6 - ry, width: rx * 2, height: ry * 2 }, stroke(look.ripple, 1, 0.32 - i * 0.05));
  }
  // Moonlight glinting on the water.
  for (let i = 0; i < 6; i++) {
    const w = rand.range(10, 34);
    canvas.drawRRect(
      { rect: { x: pond.x - w / 2 + rand.range(-60, 60), y: pond.y + 8 + i * 5, width: w, height: 1.6 }, rx: 1, ry: 1 },
      fill(look.reflection, 0.28),
    );
  }
  paperSheet(canvas, { dx: 0, dy: 2, blur: 2, alpha: 0.55 }, c => {
    drawLilyPad(c, pond.x - 168, pond.y + 8, 22, 300, look, look.lilyPad[0]);
    drawLilyPad(c, pond.x - 128, pond.y + 30, 16, 250, look, look.lilyPad[2]);
    drawLilyPad(c, pond.x + 150, pond.y + 20, 24, 210, look, look.lilyPad[1]);
    drawLilyPad(c, pond.x + 190, pond.y - 4, 14, 260, look, look.lilyPad[0]);
    drawLilyPad(c, pond.x - 62, pond.y + 34, 12, 280, look, look.lilyPad[1]);
    drawLilyPad(c, pond.x + 96, pond.y + 36, 13, 230, look, look.lilyPad[2]);
    for (const [bx, by] of [[pond.x - 160, pond.y + 4], [pond.x + 158, pond.y + 15]]) {
      c.drawOval({ x: bx - 4, y: by - 9, width: 8, height: 11 }, fill(look.bud));
    }
  });
}

/** The water, darker under the bank's lip so it sits lower than the paper bank. */
function drawWater(canvas: SkCanvas, water: SkPath, pond: PondShape, look: PondLook) {
  canvas.drawPath(water, verticalGradient(pond.y - pond.ry, pond.y + pond.ry, look.water));
  canvas.save();
  canvas.clipPath(water, ClipOp.Intersect, true);
  canvas.drawOval(
    { x: pond.x - pond.rx * 1.1, y: pond.y - pond.ry * 1.9, width: pond.rx * 2.2, height: pond.ry * 1.4 },
    blurred(fill('#02060c', 0.55), 6),
  );
  canvas.restore();
}
