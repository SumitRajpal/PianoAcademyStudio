/**
 * The pond in the clearing: a lush mossy bank around deep glossy liquid water,
 * moonlight glinting across its surface, and volumetric ripple waves ringing the lotus.
 * Rendered in 3D CGI stylized cartoon aesthetic (Pixar / The Incredibles standard).
 */

import { BlendMode, BlurStyle, ClipOp, PaintStyle, Skia, TileMode, type SkCanvas, type SkPath } from 'react-native-skia';

import { blurred, fill, linearGradient, seeded, stroke, verticalGradient } from '../../shared/paperKit';
import { POND_LOOK, type PondLook } from './pondLook';

type PondShape = { x: number; y: number; rx: number; ry: number };

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

  // 1. Lily pad contact shadow on water
  canvas.drawPath(pad, blurred(fill('rgba(2, 6, 14, 0.45)'), 2));

  // 2. Volumetric Pad Gradient
  const padPaint = Skia.Paint();
  padPaint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: x - r * 0.2, y: y - r * 0.1 }, r * 1.2,
      [Skia.Color(look.lilyPadHighlight), Skia.Color(color)],
      [0.0, 1.0],
      TileMode.Clamp
    )
  );
  canvas.drawPath(pad, padPaint);

  // 3. Delicate Leaf Veins
  const vein = stroke(look.lilyVein, 0.8, 0.5);
  for (let a = notch + 50; a < notch + 330; a += 55) {
    const rad = (a * Math.PI) / 180;
    canvas.drawLine(x, y, x + Math.cos(rad) * r * 0.8, y + Math.sin(rad) * r * 0.34, vein);
  }

  // 4. Glossy Rim Highlight
  const rim = stroke(look.lilyPadHighlight, 0.7, 0.4);
  rim.setBlendMode(BlendMode.Plus);
  canvas.drawPath(pad, rim);
}

/** The water's outline, for clipping reflections and ripples to it. */
export function pondWaterPath(pond: PondShape): SkPath {
  return wobblyOval(pond, 0.04, 11);
}

/** One volumetric ripple wave ring with illuminated crest and shadow trough. */
export function drawPondRipple(canvas: SkCanvas, rx: number, ry: number, look: PondLook = POND_LOOK) {
  // Wave shadow trough (below)
  canvas.drawOval(
    { x: -rx + 1, y: -ry + 1.2, width: rx * 2 - 2, height: ry * 2 },
    blurred(stroke(look.rippleTrough, 1.8, 0.65), 1.0)
  );
  // Wave illuminated crest (above) with additive specular glint
  const crestPaint = stroke(look.ripple, 1.5, 0.85);
  crestPaint.setBlendMode(BlendMode.Plus);
  canvas.drawOval({ x: -rx, y: -ry, width: rx * 2, height: ry * 2 }, blurred(crestPaint, 0.8));
}

/** The moon's reflection on the water: stacked glowing specular glints. */
export function drawMoonGlint(canvas: SkCanvas, look: PondLook = POND_LOOK) {
  const rand = seeded(303);
  for (let i = 0; i < 7; i++) {
    const w = 26 - i * 2.6 + rand.range(-3, 3);
    const glintPaint = fill(look.reflection, 0.75 - i * 0.08);
    glintPaint.setBlendMode(BlendMode.Plus);
    canvas.drawRRect(
      { rect: { x: -w / 2 + rand.range(-3, 3), y: i * 3.4, width: w, height: 1.8 }, rx: 0.9, ry: 0.9 },
      glintPaint,
    );
  }
}

export function drawPond(canvas: SkCanvas, pond: PondShape, look: PondLook = POND_LOOK) {
  const rand = seeded(77);

  // 1. Lush Mossy Pond Shore Bank with Volumetric Contact Occlusion
  const bankOuter = wobblyOval({ ...pond, rx: pond.rx + 18, ry: pond.ry + 10 }, 0.05, 3);
  canvas.drawPath(bankOuter, blurred(fill('rgba(2, 6, 12, 0.55)'), 5));
  canvas.drawPath(bankOuter, fill(look.bank));
  canvas.drawPath(bankOuter, stroke(look.bankEdge, 1.4, 0.75));

  // 2. Glossy Deep Liquid Water Basin
  const water = wobblyOval(pond, 0.04, 11);
  drawWater(canvas, water, pond, look);

  // 3. Volumetric Ripple Waves Ringing the Lotus
  for (let i = 1; i <= 4; i++) {
    const rx = 70 + i * 30;
    const ry = 13 + i * 6;
    const ripplePaint = stroke(look.ripple, 1.2, 0.42 - i * 0.06);
    ripplePaint.setBlendMode(BlendMode.Plus);
    canvas.drawOval({ x: pond.x - rx, y: pond.y - 6 - ry, width: rx * 2, height: ry * 2 }, ripplePaint);
  }

  // 4. Moon Specular Glints Drifting Across Water
  for (let i = 0; i < 6; i++) {
    const w = rand.range(12, 36);
    const glintPaint = fill(look.reflection, 0.42);
    glintPaint.setBlendMode(BlendMode.Plus);
    canvas.drawRRect(
      { rect: { x: pond.x - w / 2 + rand.range(-60, 60), y: pond.y + 8 + i * 5, width: w, height: 1.8 }, rx: 1, ry: 1 },
      glintPaint,
    );
  }

  // 5. Lily Pads Resting on Water
  drawLilyPad(canvas, pond.x - 168, pond.y + 8, 22, 300, look, look.lilyPad[0]);
  drawLilyPad(canvas, pond.x - 128, pond.y + 30, 16, 250, look, look.lilyPad[2]);
  drawLilyPad(canvas, pond.x + 150, pond.y + 20, 24, 210, look, look.lilyPad[1]);
  drawLilyPad(canvas, pond.x + 190, pond.y - 4, 14, 260, look, look.lilyPad[0]);
  drawLilyPad(canvas, pond.x - 62, pond.y + 34, 12, 280, look, look.lilyPad[1]);
  drawLilyPad(canvas, pond.x + 96, pond.y + 36, 13, 230, look, look.lilyPad[2]);

  // Lotus Buds
  for (const [bx, by] of [[pond.x - 160, pond.y + 4], [pond.x + 158, pond.y + 15]]) {
    canvas.drawOval({ x: bx - 4, y: by - 9, width: 8, height: 11 }, fill(look.bud));
    const budTip = stroke('#ff9ebb', 1.0);
    budTip.setBlendMode(BlendMode.Plus);
    canvas.drawCircle(bx, by - 6, 2.5, budTip);
  }
}

/** The water: deep volumetric liquid gradient with soft shoreline ambient occlusion. */
function drawWater(canvas: SkCanvas, water: SkPath, pond: PondShape, look: PondLook) {
  canvas.drawPath(water, verticalGradient(pond.y - pond.ry, pond.y + pond.ry, look.water));

  canvas.save();
  canvas.clipPath(water, ClipOp.Intersect, true);

  // Shoreline ambient occlusion shadow (water is darker under bank's lip)
  canvas.drawOval(
    { x: pond.x - pond.rx * 1.1, y: pond.y - pond.ry * 1.9, width: pond.rx * 2.2, height: pond.ry * 1.4 },
    blurred(fill('#01050c', 0.72), 8),
  );

  // Liquid surface specular pool (faint ambient sheen reflecting night sky)
  const sheenPaint = Skia.Paint();
  sheenPaint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: pond.x, y: pond.y }, pond.rx * 0.9,
      [Skia.Color('rgba(77, 232, 216, 0.12)'), Skia.Color('transparent')],
      [0.0, 1.0],
      TileMode.Clamp
    )
  );
  sheenPaint.setBlendMode(BlendMode.Plus);
  canvas.drawPath(water, sheenPaint);

  canvas.restore();
}
