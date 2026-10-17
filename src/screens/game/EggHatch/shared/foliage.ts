/**
 * Foliage builders shared by the forest atoms: leaf clusters (canopies,
 * bushes, hanging leaves) and fern fronds. Every leaf is a cut-paper piece
 * with a pale vein, the way paper-craft leaves are scored.
 */

import { Skia, type SkCanvas } from 'react-native-skia';

import { fill, stroke, type Point, type Random } from './paperKit';
import {
  leafPath,
  leafVeinPath,
  polar,
  quadAngle,
  quadPoint,
} from './paperShapes';

export type LeafClusterOptions = {
  center: Point;
  /** How far leaves start from the centre (they grow outward from there). */
  spread: number;
  count: number;
  length: [number, number];
  width: number;
  /** Leaves fan between these angles (degrees). */
  angles: [number, number];
  colors: readonly string[];
  vein?: string;
  veinAlpha?: number;
};

/** A fan of leaves growing out from around a centre point. */
export function drawLeafCluster(
  canvas: SkCanvas,
  rand: Random,
  o: LeafClusterOptions,
) {
  for (let i = 0; i < o.count; i++) {
    const angle = rand.range(o.angles[0], o.angles[1]);
    const base = polar(o.center, rand.range(0, o.spread), angle + rand.range(-60, 60));
    const length = rand.range(o.length[0], o.length[1]);
    const width = o.width * rand.range(0.75, 1.2);
    const bend = rand.range(-0.6, 0.6);
    canvas.drawPath(
      leafPath(base, length, width, angle, bend),
      fill(rand.pick(o.colors)),
    );
    if (o.vein) {
      canvas.drawPath(
        leafVeinPath(base, length, angle, bend),
        stroke(o.vein, Math.max(0.5, width * 0.06), o.veinAlpha ?? 0.35),
      );
    }
  }
}

export type FernOptions = {
  base: Point;
  /** Where the frond ends and how it arches (quadratic control point). */
  tip: Point;
  control: Point;
  /** Leaflet length at the base of the frond (they shrink to the tip). */
  leaflet: number;
  pairs: number;
  color: string;
  stemColor: string;
  /** Optional lighter tone for alternate leaflets. */
  accent?: string;
};

/** A fern frond: an arching stem with paired leaflets shrinking to the tip. */
export function drawFern(canvas: SkCanvas, o: FernOptions) {
  const { base, control, tip } = o;
  for (let i = 0; i < o.pairs; i++) {
    const t = 0.08 + (i / o.pairs) * 0.9;
    const p = quadPoint(base, control, tip, t);
    const dir = quadAngle(base, control, tip, t);
    const len = o.leaflet * (1 - t * 0.8);
    const w = len * 0.42;
    const paint = fill(o.accent && i % 2 ? o.accent : o.color);
    canvas.drawPath(leafPath(p, len, w, dir - 58, -0.6, 0.4), paint);
    canvas.drawPath(leafPath(p, len, w, dir + 58, 0.6, 0.4), paint);
  }
  // The stem itself.
  canvas.drawPath(
    Skia.PathBuilder.Make()
      .moveTo(base.x, base.y)
      .quadTo(control.x, control.y, tip.x, tip.y)
      .build(),
    stroke(o.stemColor, Math.max(1, o.leaflet * 0.1)),
  );
}
