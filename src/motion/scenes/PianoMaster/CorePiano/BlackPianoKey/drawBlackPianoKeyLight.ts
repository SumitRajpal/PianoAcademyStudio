import type { SkCanvas, SkColor, SkPaint, SkShader } from 'react-native-skia';

import {
  clipToBox,
  drawPressedPianoKeyFace,
  makePianoKeyLightGradient,
  makePressedPianoKeyFace,
  pianoKeyShape,
  setPianoKeyLightShader,
  type Box,
  type KeyBand,
  type PressedPianoKeyFace,
} from '../../shared';
import type { BlackPianoKeyLook } from './blackPianoKeyLook';

export type BlackPianoKeyLight = { body: SkShader; face: PressedPianoKeyFace };

/** The shaders of a lit black key in one role colour, made once per layout. */
export function makeBlackPianoKeyLight(
  band: KeyBand,
  look: BlackPianoKeyLook,
  pitch: number,
  color: SkColor,
): BlackPianoKeyLight {
  return {
    body: makePianoKeyLightGradient(band, color, look.pressed.body),
    face: makePressedPianoKeyFace(
      { y: band.y, height: band.height * look.pressed.panelBottom },
      pitch,
      look.pressed,
      color,
    ),
  };
}

/**
 * A pressed black key keeps dark side rails around a pastel inset face.
 * Extending the face compresses the raised front without moving the key box.
 */
export function drawBlackPianoKeyLight(
  canvas: SkCanvas,
  key: Box,
  look: BlackPianoKeyLook,
  pitch: number,
  light: BlackPianoKeyLight,
  level: number,
  paint: SkPaint,
) {
  'worklet';
  canvas.save();
  clipToBox(canvas, key);
  setPianoKeyLightShader(paint, light.body, level);
  canvas.drawRRect(pianoKeyShape(key, look.cornerRadius * pitch), paint);
  drawPressedPianoKeyFace(
    canvas,
    {
      x: key.x + look.panel.left * pitch,
      y: key.y,
      width: key.width - (look.panel.left + look.panel.right) * pitch,
      height: key.height * look.pressed.panelBottom,
    },
    look.panel.radius * pitch,
    pitch,
    look.pressed,
    light.face,
    level,
    paint,
  );
  canvas.restore();
}
