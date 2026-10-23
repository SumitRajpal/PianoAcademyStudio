/**
 * The shape every piano key is drawn with, white or black, unlit or lit.
 * These are worklets, so the same shape is drawn when the keys are recorded
 * (JS thread) and when they are lit (UI thread).
 */

import { ClipOp, Skia, type SkCanvas } from 'react-native-skia';

/** A rectangle in points. Every KeyRect is one. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * A key shape: square at the top, rounded at the bottom. It is drawn taller
 * than the key, so the caller clips it to the key box with `clipToBox`.
 */
export function pianoKeyShape(box: Box, radius: number) {
  'worklet';
  return Skia.RRectXY(
    Skia.XYWHRect(box.x, box.y - radius, box.width, box.height + radius),
    radius,
    radius,
  );
}

export function clipToBox(canvas: SkCanvas, box: Box) {
  'worklet';
  canvas.clipRect(
    Skia.XYWHRect(box.x, box.y, box.width, box.height),
    ClipOp.Intersect,
    true,
  );
}
