/**
 * The enchanted egg, drawn centred on (0,0) so the scene can shake and split
 * it around its own centre. Deep berry shell with gold scallops, a teal band,
 * a ruby medallion flanked by teal teardrops and gold swirls, and a zigzag
 * hem, all clipped to the egg outline.
 *
 * - `drawMagicEgg(.., part)` draws the whole egg, the bottom cup, or one of
 *   the top shards, cut along SHATTER_LINES (the break lines the last crack
 *   draws), so the shell bursts exactly where it cracked.
 * - `drawEggGold` draws only the gold ornaments: the mask the scene sweeps
 *   a shimmer across.
 * - `drawEggAura` is the golden light around it, drawn separately to pulse.
 * The cracks themselves live in eggCracks.ts.
 */

import { ClipOp, PathOp, Skia, type SkCanvas, type SkPath } from 'react-native-skia';

import {
  blurred,
  drawGlow,
  fill,
  linearGradient,
  radialGradient,
  stroke,
  type Point,
} from '../../shared/paperKit';
import { eggPath, leafPath, sparklePath } from '../../shared/paperShapes';
import { SHATTER_LINES } from './eggCracks';
import { MAGIC_EGG_SIZE } from './eggGeometry';
import { MAGIC_EGG_LOOK, type MagicEggLook } from './magicEggLook';

export { MAGIC_EGG_SIZE };

/** Where the ruby sits, for its glint. */
export const EGG_GEM = { x: 0, y: MAGIC_EGG_SIZE.height * 0.12 };

function polyline(points: Point[]): SkPath {
  const b = Skia.PathBuilder.Make().moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) b.lineTo(p.x, p.y);
  return b.build();
}

const [WAIST, ...CUTS] = SHATTER_LINES;
const FAR = 120;

/** Waist points between x0 and x1, in order of x. */
function waistBetween(x0: number, x1: number): Point[] {
  return WAIST.filter(p => p.x > x0 && p.x < x1);
}

/** The pieces the shell bursts into: the cup, then the top shards left to right. */
export type EggPart = 'whole' | 'cup' | number;

export const EGG_SHARD_COUNT = CUTS.length + 1;

function partRegion(part: Exclude<EggPart, 'whole'>): SkPath {
  if (part === 'cup') {
    return Skia.Path.Polygon(
      [{ x: -FAR, y: WAIST[0].y }, ...WAIST, { x: FAR, y: WAIST[WAIST.length - 1].y }, { x: FAR, y: FAR }, { x: -FAR, y: FAR }],
      true,
    );
  }
  // Shard i lies between cut i-1 (or the far left) and cut i (or the far right).
  const leftCut = part > 0 ? CUTS[part - 1] : null;
  const rightCut = part < CUTS.length ? CUTS[part] : null;
  const leftX = leftCut ? leftCut[leftCut.length - 1].x : -FAR;
  const rightX = rightCut ? rightCut[rightCut.length - 1].x : FAR;
  const pts: Point[] = [];
  if (leftCut) {
    pts.push({ x: leftCut[0].x, y: -FAR }, ...leftCut);
  } else {
    pts.push({ x: -FAR, y: -FAR }, { x: -FAR, y: WAIST[0].y });
  }
  pts.push(...waistBetween(leftX, rightX));
  if (rightCut) {
    pts.push(...[...rightCut].reverse(), { x: rightCut[0].x, y: -FAR });
  } else {
    pts.push({ x: FAR, y: WAIST[WAIST.length - 1].y }, { x: FAR, y: -FAR });
  }
  return Skia.Path.Polygon(pts, true);
}

/** The middle of a shell piece (egg points): the shard spins around it. */
export function eggPartCentre(part: Exclude<EggPart, 'whole'>): Point {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  const piece = Skia.Path.MakeFromOp(eggPath({ x: 0, y: 0 }, w, h), partRegion(part), PathOp.Intersect);
  const b = piece ? piece.computeTightBounds() : { x: 0, y: 0, width: 0, height: 0 };
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function spiralPath(center: Point, radius: number, turns: number, flip: 1 | -1): SkPath {
  const b = Skia.PathBuilder.Make();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2 * flip;
    const r = radius * (1 - t * 0.85);
    const x = center.x + Math.cos(a) * r;
    const y = center.y + Math.sin(a) * r;
    if (i === 0) b.moveTo(x, y);
    else b.lineTo(x, y);
  }
  return b.build();
}

function drawOrnaments(canvas: SkCanvas, w: number, h: number, look: MagicEggLook, goldOnly = false) {
  const gold = stroke(look.gold, 1.6);
  const goldFill = fill(look.gold);
  // In the gold-only mask, the coloured parts are left out.
  const tealFill = fill(look.teal, goldOnly ? 0 : 1);

  // Top: a small gold crown of dots and a teal drop at the tip.
  for (let i = -2; i <= 2; i++) {
    canvas.drawCircle(i * 7, -h * 0.43 + Math.abs(i) * 3, 1.8, goldFill);
  }
  canvas.drawPath(leafPath({ x: 0, y: -h * 0.52 }, 13, 8, 90, 0, 0.6), tealFill);

  // Gold scallop band.
  const scallopY = -h * 0.3;
  for (let x = -w / 2; x < w / 2; x += 9) {
    canvas.drawArc({ x, y: scallopY - 4.5, width: 9, height: 9 }, 0, 180, false, gold);
    canvas.drawCircle(x + 4.5, scallopY + 9, 1.3, goldFill);
  }

  // Teal band with a gold edge and dots.
  const bandY = -h * 0.12;
  canvas.drawRect({ x: -w, y: bandY - 5, width: w * 2, height: 10 }, fill(look.tealDeep, goldOnly ? 0 : 1));
  canvas.drawLine(-w, bandY - 5, w, bandY - 5, stroke(look.gold, 1.2));
  canvas.drawLine(-w, bandY + 5, w, bandY + 5, stroke(look.gold, 1.2));
  for (let x = -w / 2; x < w / 2; x += 7) {
    canvas.drawCircle(x, bandY, 1.6, tealFill);
  }

  // The ruby medallion with teal teardrops and gold swirls.
  const m = { x: 0, y: h * 0.12 };
  for (const side of [-1, 1] as const) {
    const drop = leafPath({ x: m.x + side * 8, y: m.y }, 24, 15, side > 0 ? 0 : 180, 0.2 * side, 0.55);
    canvas.drawPath(drop, tealFill);
    canvas.drawPath(drop, stroke(look.gold, 1.1));
    canvas.drawPath(spiralPath({ x: m.x + side * 22, y: m.y - 16 }, 7, 1.4, side), gold);
    canvas.drawPath(spiralPath({ x: m.x + side * 22, y: m.y + 17 }, 6, 1.3, -side as 1 | -1), gold);
  }
  const gem = Skia.Path.Polygon(
    [{ x: m.x, y: m.y - 14 }, { x: m.x + 9, y: m.y }, { x: m.x, y: m.y + 14 }, { x: m.x - 9, y: m.y }],
    true,
  );
  if (!goldOnly) {
    canvas.drawPath(gem, linearGradient({ x: m.x - 9, y: m.y - 14 }, { x: m.x + 9, y: m.y + 14 }, [look.gemLight, look.gem, '#8a1028']));
  }
  canvas.drawPath(gem, stroke(look.gold, 2));
  if (!goldOnly) {
    canvas.drawPath(
      Skia.Path.Polygon([{ x: m.x - 1, y: m.y - 9 }, { x: m.x - 5, y: m.y }, { x: m.x - 1, y: m.y - 2 }], true),
      fill(look.highlight, 0.6),
    );
  }

  // Zigzag hem with teal dots.
  const hemY = h * 0.33;
  const zig: Point[] = [];
  for (let x = -w / 2, i = 0; x <= w / 2; x += 6, i++) {
    zig.push({ x, y: hemY + (i % 2 ? 4 : -4) });
  }
  canvas.drawPath(polyline(zig), gold);
  for (let x = -w / 2 + 3; x < w / 2; x += 12) {
    canvas.drawCircle(x, hemY + 10, 1.7, tealFill);
  }
}

export function drawMagicEgg(
  canvas: SkCanvas,
  part: EggPart = 'whole',
  look: MagicEggLook = MAGIC_EGG_LOOK,
) {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  const shell = eggPath({ x: 0, y: 0 }, w, h);
  canvas.save();
  if (part !== 'whole') canvas.clipPath(partRegion(part), ClipOp.Intersect, true);

  // Soft shadow under the egg, then the shell.
  canvas.drawPath(shell, blurred(fill('#05020a', 0.5), 4));
  canvas.drawPath(
    shell,
    radialGradient({ x: -w * 0.22, y: -h * 0.24 }, h * 0.85, [
      { color: look.shell[0], at: 0 },
      { color: look.shell[1], at: 0.55 },
      { color: look.shell[2], at: 1 },
    ]),
  );
  canvas.save();
  canvas.clipPath(shell, ClipOp.Intersect, true);
  drawOrnaments(canvas, w, h, look);
  // Shading: dark on the right, a soft shine top-left.
  canvas.drawRect(
    { x: -w, y: -h, width: w * 2, height: h * 2 },
    linearGradient({ x: -w * 0.1, y: 0 }, { x: w / 2, y: 0 }, ['#00000000', '#1a0410aa']),
  );
  canvas.drawOval({ x: -w * 0.36, y: -h * 0.46, width: w * 0.3, height: h * 0.34 }, blurred(fill(look.highlight, 0.22), 5));
  canvas.restore();
  canvas.drawPath(shell, stroke(look.gold, 1.1, 0.55));

  // A broken piece glows along its broken edges, with the light inside.
  if (part !== 'whole') {
    canvas.clipPath(shell, ClipOp.Intersect, true);
    for (const line of SHATTER_LINES) {
      canvas.drawPath(polyline(line), blurred(stroke(look.crackGlow, 6, 0.9), 3));
      canvas.drawPath(polyline(line), stroke(look.inside, 1.6));
    }
  }
  canvas.restore();
}

/** Only the gold ornaments: the mask the shimmer sweeps across. */
export function drawEggGold(canvas: SkCanvas, look: MagicEggLook = MAGIC_EGG_LOOK) {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  canvas.save();
  canvas.clipPath(eggPath({ x: 0, y: 0 }, w, h), ClipOp.Intersect, true);
  drawOrnaments(canvas, w, h, look, true);
  canvas.restore();
}

/** A soft diagonal band of light, centred on (0,0): swept across the gold mask. */
export function drawShimmerBand(canvas: SkCanvas, look: MagicEggLook = MAGIC_EGG_LOOK) {
  const { height: h } = MAGIC_EGG_SIZE;
  canvas.save();
  canvas.rotate(22, 0, 0);
  canvas.drawRect(
    { x: -9, y: -h, width: 18, height: h * 2 },
    linearGradient({ x: -9, y: 0 }, { x: 9, y: 0 }, ['#fff8e000', look.shimmer, '#fff8e000']),
  );
  canvas.restore();
}

/** The golden aura around the egg, with a few sparkles. */
export function drawEggAura(canvas: SkCanvas, look: MagicEggLook = MAGIC_EGG_LOOK) {
  const { width: w, height: h } = MAGIC_EGG_SIZE;
  drawGlow(canvas, { x: 0, y: -h * 0.05 }, h * 1.25, look.aura, look.auraAlpha);
  drawGlow(canvas, { x: 0, y: -h * 0.05 }, h * 0.7, look.aura, look.auraAlpha * 0.8);
  const sparkle = fill(look.inside, 0.95);
  for (const [x, y, r] of [
    [-w * 0.78, -h * 0.4, 5],
    [w * 0.8, -h * 0.2, 4],
    [-w * 0.62, h * 0.18, 3],
    [w * 0.66, h * 0.3, 3.5],
    [w * 0.3, -h * 0.72, 3],
  ]) {
    canvas.drawPath(sparklePath({ x, y }, r), sparkle);
  }
}
