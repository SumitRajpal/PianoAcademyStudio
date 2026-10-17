import {
  ClipOp,
  PaintStyle,
  Skia,
  TileMode,
  type SkCanvas,
  type SkColor,
  type SkPaint,
  type SkShader,
} from 'react-native-skia';

import { clipToBox, pianoKeyShape, type Box } from './pianoKeyShape';

/** Lightness mixes the role colour toward black (-1) or white (+1). */
export type PianoKeyLightStop = readonly [
  position: number,
  lightness: number,
  opacity?: number,
];

/** Sizes in white-key pitches, just like each key atom's resting look. */
export type PressedPianoKeyFaceLook = {
  face: readonly PianoKeyLightStop[];
  inset: readonly PianoKeyLightStop[];
  insetDepth: number;
  front: readonly PianoKeyLightStop[];
  frontDepth: number;
  edgeWidth: number;
  edgeLightness: number;
};

/** The top and height of a row of keys: all keys of one colour share it. */
export type KeyBand = { y: number; height: number };

/**
 * The shaders of one pressed face in one role colour, made once per layout
 * and colour so redrawing a chord creates no shaders.
 */
export type PressedPianoKeyFace = {
  face: SkShader;
  inset: SkShader;
  front: SkShader;
  edge: SkColor;
};

function shade(
  color: SkColor,
  lightness: number,
  opacity: number = 1,
): SkColor {
  'worklet';
  const scale = 1 - Math.abs(lightness);
  const lift = Math.max(0, lightness);
  return new Float32Array([
    color[0] * scale + lift,
    color[1] * scale + lift,
    color[2] * scale + lift,
    color[3] * opacity,
  ]);
}

/**
 * A vertical role-coloured gradient over `band`. Vertical, so one shader
 * serves every key in the row whatever its x.
 */
export function makePianoKeyLightGradient(
  band: KeyBand,
  color: SkColor,
  stops: readonly PianoKeyLightStop[],
): SkShader {
  return Skia.Shader.MakeLinearGradient(
    { x: 0, y: band.y },
    { x: 0, y: band.y + band.height },
    stops.map(([, lightness, opacity]) => shade(color, lightness, opacity)),
    stops.map(([position]) => position),
    TileMode.Clamp,
  );
}

export function makePressedPianoKeyFace(
  band: KeyBand,
  pitch: number,
  look: PressedPianoKeyFaceLook,
  color: SkColor,
): PressedPianoKeyFace {
  const insetDepth = Math.min(band.height, look.insetDepth * pitch);
  const frontDepth = Math.min(band.height, look.frontDepth * pitch);
  return {
    face: makePianoKeyLightGradient(band, color, look.face),
    inset: makePianoKeyLightGradient(
      { y: band.y, height: insetDepth },
      color,
      look.inset,
    ),
    front: makePianoKeyLightGradient(
      { y: band.y + band.height - frontDepth, height: frontDepth },
      color,
      look.front,
    ),
    edge: shade(color, look.edgeLightness),
  };
}

/** Fills with `shader`; the paint's alpha is the key's light level. */
export function setPianoKeyLightShader(
  paint: SkPaint,
  shader: SkShader,
  level: number,
) {
  'worklet';
  paint.setShader(shader);
  paint.setAlphaf(level);
}

/**
 * A sunken face with a short inset shadow and a compressed front lip. No blur,
 * offscreen layer or animation loop, and no shaders made while drawing: only
 * a few clipped draws with the shaders of `skin`. Leaves `paint` as a plain
 * fill with no shader, ready for the next key.
 */
export function drawPressedPianoKeyFace(
  canvas: SkCanvas,
  key: Box,
  radius: number,
  pitch: number,
  look: PressedPianoKeyFaceLook,
  skin: PressedPianoKeyFace,
  level: number,
  paint: SkPaint,
) {
  'worklet';
  const shape = pianoKeyShape(key, radius);
  canvas.save();
  clipToBox(canvas, key);
  canvas.clipRRect(shape, ClipOp.Intersect, true);

  setPianoKeyLightShader(paint, skin.face, level);
  canvas.drawRRect(shape, paint);

  setPianoKeyLightShader(paint, skin.inset, level);
  canvas.drawRect(
    Skia.XYWHRect(
      key.x,
      key.y,
      key.width,
      Math.min(key.height, look.insetDepth * pitch),
    ),
    paint,
  );

  const depth = Math.min(key.height, look.frontDepth * pitch);
  setPianoKeyLightShader(paint, skin.front, level);
  canvas.drawRect(
    Skia.XYWHRect(key.x, key.y + key.height - depth, key.width, depth),
    paint,
  );

  paint.setShader(null);
  paint.setColor(skin.edge);
  paint.setAlphaf(skin.edge[3] * level);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(look.edgeWidth * pitch);
  canvas.drawRRect(shape, paint);
  paint.setStyle(PaintStyle.Fill);
  canvas.restore();
}
