/**
 * The paper-cut toolkit every egg-hatch atom draws with: paints, gradients,
 * glows, a seeded random generator, and `paperSheet`, which draws a group of
 * shapes as one sheet of cut paper casting a soft shadow on the sheets behind.
 *
 * All drawing is imperative SkCanvas calls, run once while recording a
 * picture (never per frame).
 */

import {
  BlendMode,
  BlurStyle,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkPaint,
  type SkPath,
} from 'react-native-skia';

export type Point = { x: number; y: number };

/** The painted area of a layer, in design points (includes the overscan). */
export type Bounds = { x: number; y: number; width: number; height: number };

/** `#rrggbb` plus an alpha 0..1, as a Skia colour. */
export function rgba(hex: string, alpha = 1) {
  const c = Skia.Color(hex);
  c[3] = alpha;
  return c;
}

export function fill(hex: string, alpha = 1): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(rgba(hex, alpha));
  return paint;
}

export function stroke(hex: string, width: number, alpha = 1): SkPaint {
  const paint = fill(hex, alpha);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  return paint;
}

/** A vertical linear gradient fill from `top` to `bottom`. */
export function verticalGradient(
  y0: number,
  y1: number,
  colors: string[],
  positions: number[] | null = null,
): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: y0 },
      { x: 0, y: y1 },
      colors.map(c => Skia.Color(c)),
      positions,
      TileMode.Clamp,
    ),
  );
  return paint;
}

/** A linear gradient fill between two points. */
export function linearGradient(
  from: Point,
  to: Point,
  colors: string[],
  positions: number[] | null = null,
): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      from,
      to,
      colors.map(c => Skia.Color(c)),
      positions,
      TileMode.Clamp,
    ),
  );
  return paint;
}

/** A radial gradient fill; colours are `#rrggbb` with their own alphas. */
export function radialGradient(
  center: Point,
  radius: number,
  stops: { color: string; alpha?: number; at: number }[],
): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      center,
      radius,
      stops.map(s => rgba(s.color, s.alpha ?? 1)),
      stops.map(s => s.at),
      TileMode.Clamp,
    ),
  );
  return paint;
}

/** A two-point conical gradient fill for 3D spherical / conical volume shading. */
export function twoPointConicalGradient(
  start: Point,
  startRadius: number,
  end: Point,
  endRadius: number,
  colors: string[],
  positions: number[] | null = null,
): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(
    Skia.Shader.MakeTwoPointConicalGradient(
      start,
      startRadius,
      end,
      endRadius,
      colors.map(c => Skia.Color(c)),
      positions,
      TileMode.Clamp,
    ),
  );
  return paint;
}

/** A soft light: a radial gradient fading from `alpha` to nothing. */
export function drawGlow(
  canvas: SkCanvas,
  center: Point,
  radius: number,
  color: string,
  alpha: number,
  blend: BlendMode = BlendMode.Plus,
) {
  const paint = radialGradient(center, radius, [
    { color, alpha, at: 0 },
    { color, alpha: alpha * 0.45, at: 0.4 },
    { color, alpha: 0, at: 1 },
  ]);
  paint.setBlendMode(blend);
  canvas.drawCircle(center.x, center.y, radius, paint);
}

/** A paint whose shape is blurred: for glowing edges and soft lights. */
export function blurred(paint: SkPaint, sigma: number): SkPaint {
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, sigma, true));
  return paint;
}

export type PaperShadow = {
  /** Shadow offset, in points. */
  dx: number;
  dy: number;
  /** Shadow softness (blur sigma), in points. */
  blur: number;
  /** Shadow darkness 0..1. */
  alpha: number;
  color?: string;
};

/**
 * Draws `draw` without flat paper-drop shadows, preserving volumetric depth.
 */
export function paperSheet(
  canvas: SkCanvas,
  _shadow: PaperShadow,
  draw: (canvas: SkCanvas) => void,
) {
  draw(canvas);
}

/** Deterministic random numbers, so a drawing is the same on every run. */
/* eslint-disable no-bitwise -- mulberry32 is integer bit mixing by design */
export function seeded(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  };
}
/* eslint-enable no-bitwise */

export type Random = ReturnType<typeof seeded>;

/** Fills `path` with `paint`, then draws a thin lighter cut edge on top. */
export function drawPaperPiece(
  canvas: SkCanvas,
  path: SkPath,
  paint: SkPaint,
  edge?: { color: string; alpha: number; width?: number },
) {
  canvas.drawPath(path, paint);
  if (edge) {
    canvas.drawPath(path, stroke(edge.color, edge.width ?? 0.8, edge.alpha));
  }
}
