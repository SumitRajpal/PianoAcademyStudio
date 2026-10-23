import { Skia, TileMode, vec, type SkPaint } from 'react-native-skia';

/** A gradient stop: position from 0 to 1, and a colour. */
export type GradientStop = readonly [position: number, color: string];

/** Makes `paint` fill with a linear gradient from `from` to `to`. */
export function setLinearGradient(
  paint: SkPaint,
  from: { x: number; y: number },
  to: { x: number; y: number },
  stops: readonly GradientStop[],
) {
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(from.x, from.y),
      vec(to.x, to.y),
      stops.map(([, color]) => Skia.Color(color)),
      stops.map(([position]) => position),
      TileMode.Clamp,
    ),
  );
}
