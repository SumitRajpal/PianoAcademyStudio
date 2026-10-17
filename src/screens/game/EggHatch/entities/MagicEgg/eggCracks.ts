/**
 * Realistic eggshell cracks, generated from where each ghost actually hits.
 *
 * `generateEggCrack(hit, earlier)` builds the fracture of one impact, in egg
 * points: three or four jagged radial fractures running from the impact
 * point, tapering to hairlines, with little hairline branches, a short
 * concentric ring of fracture around the hit, and a chip knocked out of the
 * shell at the impact point. One fracture is aimed at the nearest earlier
 * crack, so the cracks join into one web. The last impact also cuts the
 * break lines the shell later shatters along (`SHATTER_LINES`).
 *
 * Each crack is drawn in two baked layers:
 * - `drawEggCrack`: the broken shell: a dent at the impact, a darkened zone,
 *   the thin dark zigzag gap with a faint lit lip, and the crushed point.
 * - `drawEggCrackLight`: the golden light leaking around the gap (never over
 *   it). The scene pulses it, brighter with every crack.
 */

import { BlendMode, ClipOp, Skia, type SkCanvas, type SkPath } from 'react-native-skia';

import { blurred, fill, radialGradient, seeded, stroke, type Point, type Random } from '../../shared/paperKit';
import { eggPath } from '../../shared/paperShapes';
import { MAGIC_EGG_SIZE } from './eggGeometry';
import { MAGIC_EGG_LOOK, type MagicEggLook } from './magicEggLook';

/** A fracture line: points and the gap width at each point (tapering). */
export type Fracture = { points: Point[]; widths: number[] };

export type EggCrack = {
  /** The impact point, in egg points. */
  at: Point;
  fractures: Fracture[];
  /** The chipped-out hole at the impact point. */
  chip: Point[];
};

export type CrackHit = {
  /** Impact point on the shell (egg points) and the outward normal there. */
  x: number;
  y: number;
  nx: number;
  ny: number;
  /** 0-based impact number: later cracks run longer. */
  index: number;
  /** The final impact also cuts the shatter lines. */
  last: boolean;
};

const RAD = Math.PI / 180;

function eggOutline(): SkPath {
  return eggPath({ x: 0, y: 0 }, MAGIC_EGG_SIZE.width, MAGIC_EGG_SIZE.height);
}

/** Walks a jagged fracture from `from` along `angle` (degrees). */
function walkFracture(
  rand: Random,
  outline: SkPath,
  from: Point,
  angle: number,
  length: number,
  width: number,
  target?: Point,
): Fracture {
  const points = [from];
  const widths = [width];
  let p = from;
  let a = angle;
  let travelled = 0;
  let zig = rand.next() < 0.5 ? 1 : -1;
  while (travelled < length) {
    const step = rand.range(3.5, 7.5);
    zig = -zig;
    // Steer towards the target crack (if any), with a jagged wander.
    if (target) {
      const want = Math.atan2(target.y - p.y, target.x - p.x) / RAD;
      let d = want - a;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      a += d * 0.35;
    }
    // Shell breaks in sharp zigzags around a steady heading.
    a += rand.range(-10, 10);
    const turn = a + zig * rand.range(10, 26);
    const next = { x: p.x + Math.cos(turn * RAD) * step, y: p.y + Math.sin(turn * RAD) * step };
    if (!outline.contains(next.x, next.y)) break;
    travelled += step;
    points.push(next);
    const u = travelled / length;
    widths.push(width * (u < 0.6 ? 1 - u * 0.25 : Math.max(0.3, 0.85 - (u - 0.6) * 1.6)));
    p = next;
    if (target && Math.hypot(target.x - p.x, target.y - p.y) < 3) {
      points.push(target);
      widths.push(width * 0.2);
      break;
    }
  }
  return { points, widths };
}

/** The break lines of the final shatter: the waist ring and three cuts from the top. */
export const SHATTER_LINES: Point[][] = (() => {
  const rand = seeded(4242);
  const waist: Point[] = [];
  for (let x = -46, i = 0; x <= 46; x += 7, i++) {
    waist.push({ x, y: -13 + (i % 2 ? 5 : -4) + rand.range(-1.5, 1.5) });
  }
  const cut = (toX: number) => {
    const line: Point[] = [{ x: toX * 0.15, y: -64 }];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      line.push({ x: toX * (0.15 + 0.85 * t) + rand.range(-3, 3), y: -64 + t * 50 + rand.range(-2, 2) });
    }
    return line;
  };
  return [waist, cut(-20), cut(1), cut(21)];
})();

export function generateEggCrack(hit: CrackHit, earlier: EggCrack[]): EggCrack {
  const rand = seeded(9001 + hit.index * 131);
  const outline = eggOutline();
  // Start just inside the shell at the impact point.
  const at = { x: hit.x - hit.nx * 2, y: hit.y - hit.ny * 2 };
  const inward = Math.atan2(-hit.ny, -hit.nx) / RAD;
  const length = 30 + hit.index * 3 + rand.range(0, 10);

  // The nearest point of an earlier crack, to join the web.
  let target: Point | undefined;
  let best = Infinity;
  for (const c of earlier) {
    for (const f of c.fractures) {
      for (const p of f.points) {
        const d = Math.hypot(p.x - at.x, p.y - at.y);
        if (d > 10 && d < best) {
          best = d;
          target = p;
        }
      }
    }
  }

  const fractures: Fracture[] = [];
  const spreads = hit.index % 2 ? [-62, -18, 24, 70] : [-50, 4, 58];
  spreads.forEach((spread, k) => {
    const aimed = k === 1 && target ? target : undefined;
    const f = walkFracture(rand, outline, at, inward + spread, aimed ? best + 6 : length * rand.range(0.65, 1), rand.range(1.3, 1.7), aimed);
    fractures.push(f);
    // Hairline branches off the fracture.
    f.points.forEach((p, j) => {
      if (j > 2 && j < f.points.length - 1 && rand.next() < 0.14) {
        const dir = inward + spread + (rand.next() < 0.5 ? -1 : 1) * rand.range(32, 58);
        fractures.push(walkFracture(rand, outline, p, dir, rand.range(5, 10), f.widths[j] * 0.6));
      }
    });
  });
  // A short concentric ring of fracture around the impact.
  const ringR = rand.range(7, 10);
  const ring: Point[] = [];
  for (let a = -55; a <= 55; a += 14) {
    const ang = (inward + a) * RAD;
    const r = ringR + rand.range(-1.5, 1.5);
    const p = { x: at.x + Math.cos(ang) * r, y: at.y + Math.sin(ang) * r };
    if (outline.contains(p.x, p.y)) ring.push(p);
  }
  if (ring.length > 2) fractures.push({ points: ring, widths: ring.map(() => 0.9) });
  if (hit.last) {
    for (const line of SHATTER_LINES) fractures.push({ points: line, widths: line.map(() => 1.5) });
  }

  // The chip knocked out at the impact point: a small irregular hole.
  const chip: Point[] = [];
  const chipR = rand.range(2.6, 3.4);
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2;
    const r = chipR * rand.range(0.65, 1.1);
    chip.push({ x: at.x + Math.cos(ang) * r, y: at.y + Math.sin(ang) * r });
  }
  return { at, fractures, chip };
}

/** A tapered fracture as a filled shape: wide at the start, a hairline at the end. */
function taperedPath(f: Fracture, extra: number): SkPath {
  const left: Point[] = [];
  const right: Point[] = [];
  const n = f.points.length;
  for (let i = 0; i < n; i++) {
    const a = f.points[Math.max(0, i - 1)];
    const b = f.points[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const w = Math.max(0.12, f.widths[i] + extra) / 2;
    left.push({ x: f.points[i].x - (dy / len) * w, y: f.points[i].y + (dx / len) * w });
    right.push({ x: f.points[i].x + (dy / len) * w, y: f.points[i].y - (dx / len) * w });
  }
  return Skia.Path.Polygon([...left, ...right.reverse()], true);
}

function lineOf(f: Fracture): SkPath {
  return Skia.Path.Polygon(f.points, false);
}

/** The broken shell of one crack, clipped to the egg: dented, darkened, split. */
export function drawEggCrack(canvas: SkCanvas, crack: EggCrack, look: MagicEggLook = MAGIC_EGG_LOOK) {
  canvas.save();
  canvas.clipPath(eggOutline(), ClipOp.Intersect, true);
  // The dent: the shell is pushed in and shadowed around the impact.
  canvas.drawCircle(crack.at.x, crack.at.y, 9, radialGradient(crack.at, 9, [
    { color: look.crackBruise, alpha: 0.55, at: 0 },
    { color: look.crackBruise, alpha: 0, at: 1 },
  ]));
  for (const f of crack.fractures) {
    if (f.points.length < 2) continue;
    canvas.drawPath(lineOf(f), blurred(stroke(look.crackBruise, f.widths[0] * 2 + 1.5, 0.3), 1.2));
  }
  for (const f of crack.fractures) {
    if (f.points.length < 2) continue;
    // A faint lit lip on one side of the split, then the dark gap itself.
    canvas.save();
    canvas.translate(-0.45, -0.5);
    canvas.drawPath(taperedPath(f, 0.2), fill(look.crackEdge, 0.32));
    canvas.restore();
    canvas.drawPath(taperedPath(f, 0), fill(look.crack));
  }
  // The crushed point: a tiny hole with light pouring out of it.
  const chip = Skia.Path.Polygon(crack.chip, true);
  canvas.drawPath(chip, fill(look.crack));
  canvas.drawPath(chip, radialGradient(crack.at, 3.4, [
    { color: look.inside, alpha: 1, at: 0 },
    { color: look.crackGlow, alpha: 0.8, at: 0.6 },
    { color: look.crackGlow, alpha: 0, at: 1 },
  ]));
  canvas.restore();
}

/**
 * The golden light leaking from one crack, clipped to the egg: a soft glow
 * along the fractures with the dark gap cut out of it (so the split stays a
 * crisp dark line), and a thin bright seam of light deep inside the widest parts.
 */
export function drawEggCrackLight(canvas: SkCanvas, crack: EggCrack, look: MagicEggLook = MAGIC_EGG_LOOK) {
  canvas.save();
  canvas.clipPath(eggOutline(), ClipOp.Intersect, true);
  canvas.saveLayer();
  for (const f of crack.fractures) {
    if (f.points.length < 2) continue;
    canvas.drawPath(lineOf(f), blurred(stroke(look.crackGlow, f.widths[0] * 1.6 + 2, 0.6), 1.5));
  }
  canvas.drawCircle(crack.at.x, crack.at.y, 8, blurred(fill(look.crackGlow, 0.85), 3.5));
  const cut = fill('#000000');
  cut.setBlendMode(BlendMode.Clear);
  for (const f of crack.fractures) {
    if (f.points.length >= 2) canvas.drawPath(taperedPath(f, 0), cut);
  }
  canvas.restore();
  const seam = fill(look.inside, 0.85);
  for (const f of crack.fractures) {
    if (f.points.length >= 2 && f.widths[0] > 1.1) canvas.drawPath(taperedPath(f, -1.05), seam);
  }
  canvas.restore();
}
