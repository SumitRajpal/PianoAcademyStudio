/**
 * Paper-cut shape paths shared by the egg-hatch atoms: leaves, fern fronds,
 * petals, sparkles, the egg outline and the ghost body. Each returns an
 * SkPath in design points; angles are degrees, 0 = pointing right, -90 = up.
 */

import { PathOp, Skia, type SkPath } from 'react-native-skia';

import type { Point } from './paperKit';

const RAD = Math.PI / 180;

function rotate(p: Point, origin: Point, angleDeg: number): Point {
  const a = angleDeg * RAD;
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: origin.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** The point `distance` away from `from` in direction `angleDeg`. */
export function polar(from: Point, distance: number, angleDeg: number): Point {
  return {
    x: from.x + Math.cos(angleDeg * RAD) * distance,
    y: from.y + Math.sin(angleDeg * RAD) * distance,
  };
}

/**
 * A pointed leaf from `base` along `angleDeg`. `bend` curls the tip sideways
 * (-1..1), `belly` moves the widest point (0..1 along the leaf).
 */
export function leafPath(
  base: Point,
  length: number,
  width: number,
  angleDeg: number,
  bend = 0,
  belly = 0.42,
): SkPath {
  // Built pointing right from the origin, then rotated into place.
  const tip = { x: length, y: bend * length * 0.25 };
  const w = width / 2;
  const pts = [
    { x: length * belly * 0.4, y: -w * 1.05 },
    { x: length * (belly + 0.32), y: -w * 0.95 + tip.y * 0.6 },
    { x: length * (belly + 0.32), y: w * 0.95 + tip.y * 0.6 },
    { x: length * belly * 0.4, y: w * 1.05 },
  ].map(p => rotate({ x: p.x + base.x, y: p.y + base.y }, base, angleDeg));
  const t = rotate({ x: tip.x + base.x, y: tip.y + base.y }, base, angleDeg);
  return Skia.PathBuilder.Make()
    .moveTo(base.x, base.y)
    .cubicTo(pts[0].x, pts[0].y, pts[1].x, pts[1].y, t.x, t.y)
    .cubicTo(pts[2].x, pts[2].y, pts[3].x, pts[3].y, base.x, base.y)
    .close()
    .build();
}

/** The centre vein of a leaf made by `leafPath`, stopping short of the tip. */
export function leafVeinPath(
  base: Point,
  length: number,
  angleDeg: number,
  bend = 0,
): SkPath {
  const mid = rotate(
    { x: base.x + length * 0.5, y: base.y + bend * length * 0.06 },
    base,
    angleDeg,
  );
  const end = rotate(
    { x: base.x + length * 0.86, y: base.y + bend * length * 0.2 },
    base,
    angleDeg,
  );
  return Skia.PathBuilder.Make()
    .moveTo(base.x, base.y)
    .quadTo(mid.x, mid.y, end.x, end.y)
    .build();
}

/** A point along a quadratic curve from p0 through control c to p1. */
export function quadPoint(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

/** The direction (degrees) of the quadratic curve at t. */
export function quadAngle(p0: Point, c: Point, p1: Point, t: number): number {
  const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  return Math.atan2(dy, dx) / RAD;
}

/** A four-pointed sparkle star. */
export function sparklePath(center: Point, radius: number, waist = 0.22): SkPath {
  const b = Skia.PathBuilder.Make();
  const r = radius;
  const w = radius * waist;
  const { x, y } = center;
  b.moveTo(x, y - r)
    .quadTo(x + w, y - w, x + r, y)
    .quadTo(x + w, y + w, x, y + r)
    .quadTo(x - w, y + w, x - r, y)
    .quadTo(x - w, y - w, x, y - r)
    .close();
  return b.build();
}

/** An egg outline: `width` x `height`, narrower at the top. */
export function eggPath(center: Point, width: number, height: number): SkPath {
  const { x, y } = center;
  const w = width / 2;
  const top = y - height * 0.56;
  const bottom = y + height * 0.44;
  const k = 0.5523;
  return Skia.PathBuilder.Make()
    .moveTo(x, top)
    .cubicTo(x + w * 0.62, top, x + w, y - height * 0.18, x + w, y + height * 0.06)
    .cubicTo(x + w, bottom - height * 0.38 * (1 - k) + height * 0.1, x + w * k, bottom, x, bottom)
    .cubicTo(x - w * k, bottom, x - w, bottom - height * 0.38 * (1 - k) + height * 0.1, x - w, y + height * 0.06)
    .cubicTo(x - w, y - height * 0.18, x - w * 0.62, top, x, top)
    .close()
    .build();
}

/** A crescent moon: a disc with an offset disc cut out of it. */
export function crescentPath(center: Point, radius: number, cut: Point): SkPath {
  const disc = Skia.Path.Circle(center.x, center.y, radius);
  const bite = Skia.Path.Circle(center.x + cut.x, center.y + cut.y, radius * 0.92);
  return Skia.Path.MakeFromOp(disc, bite, PathOp.Difference) ?? disc;
}

/**
 * The cute ghost body, centred on its head (0,0) with head radius `r`:
 * round head, slightly flared sides, a scalloped hem and a wisp of tail that
 * curls to `tailSide` (-1 left, 1 right). `wave` (radians) ripples the tail
 * and the hem: baking a few phases gives a flowing, wispy tail.
 */
export function ghostBodyPath(r: number, tailSide: 1 | -1 = 1, wave = 0): SkPath {
  const s = tailSide;
  const w = (k: number) => Math.sin(wave + k);
  const b = Skia.PathBuilder.Make();
  // Start on the tail-free side at head height and go over the top.
  b.moveTo(-r * s, 0)
    .cubicTo(-r * s, -r * 0.56, -r * 0.56 * s, -r, 0, -r)
    .cubicTo(r * 0.56 * s, -r, r * s, -r * 0.56, r * s, 0)
    // Down the tail side, sweeping out into a curled wisp that ripples.
    .cubicTo(
      r * (1.02 + 0.04 * w(0)) * s, r * 0.55,
      r * (1.1 + 0.08 * w(0.6)) * s, r * (0.95 + 0.05 * w(1.2)),
      r * (1.55 + 0.12 * w(1.4)) * s, r * (1.25 + 0.1 * w(2.2)),
    )
    .cubicTo(
      r * (1.22 + 0.08 * w(1.9)) * s, r * (1.42 + 0.06 * w(2.6)),
      r * 0.85 * s, r * (1.3 + 0.05 * w(2.4)),
      r * 0.6 * s, r * (1.2 + 0.04 * w(2.8)),
    )
    // Scalloped hem back towards the other side, each scallop rippling in turn.
    .quadTo(r * 0.38 * s, r * (1.48 + 0.07 * w(3.2)), r * 0.12 * s, r * 1.22)
    .quadTo(-r * 0.12 * s, r * (1.44 + 0.07 * w(4.1)), -r * 0.38 * s, r * 1.18)
    .quadTo(-r * 0.66 * s, r * (1.4 + 0.07 * w(5)), -r * 0.92 * s, r * 1.02)
    .cubicTo(-r * 1.02 * s, r * 0.7, -r * s, r * 0.3, -r * s, 0)
    .close();
  return b.build();
}

/** A small rounded ghost arm (a teardrop) from `base` along `angleDeg`. */
export function ghostArmPath(base: Point, r: number, angleDeg: number): SkPath {
  return leafPath(base, r * 0.62, r * 0.36, angleDeg, 0.3, 0.6);
}

/** A tapered tree trunk from `base` up to `top`, leaning by its control point. */
export function trunkPath(
  base: Point,
  top: Point,
  baseWidth: number,
  topWidth: number,
  lean: number,
): SkPath {
  const c = { x: (base.x + top.x) / 2 + lean, y: (base.y + top.y) / 2 };
  const b = Skia.PathBuilder.Make();
  const bw = baseWidth / 2;
  const tw = topWidth / 2;
  // Flared roots at the base.
  b.moveTo(base.x - bw * 1.9, base.y)
    .quadTo(base.x - bw, base.y - bw * 0.5, base.x - bw, base.y - bw * 1.4)
    .quadTo(c.x - (bw + tw) / 2, c.y, top.x - tw, top.y)
    .lineTo(top.x + tw, top.y)
    .quadTo(c.x + (bw + tw) / 2, c.y, base.x + bw, base.y - bw * 1.4)
    .quadTo(base.x + bw, base.y - bw * 0.5, base.x + bw * 1.9, base.y)
    .close();
  return b.build();
}

/** A tapered branch from `from` to `to` bending through `control`. */
export function branchPath(
  from: Point,
  control: Point,
  to: Point,
  fromWidth: number,
  toWidth: number,
): SkPath {
  const a = quadAngle(from, control, to, 0) + 90;
  const e = quadAngle(from, control, to, 1) + 90;
  const p0 = polar(from, fromWidth / 2, a);
  const p1 = polar(to, toWidth / 2, e);
  const p2 = polar(to, -toWidth / 2, e);
  const p3 = polar(from, -fromWidth / 2, a);
  const ca = quadAngle(from, control, to, 0.5) + 90;
  const mid = (fromWidth + toWidth) / 4;
  const c0 = polar(control, mid, ca);
  const c1 = polar(control, -mid, ca);
  return Skia.PathBuilder.Make()
    .moveTo(p0.x, p0.y)
    .quadTo(c0.x, c0.y, p1.x, p1.y)
    .lineTo(p2.x, p2.y)
    .quadTo(c1.x, c1.y, p3.x, p3.y)
    .close()
    .build();
}
