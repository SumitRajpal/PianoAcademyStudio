import type { SkCanvas, SkColor, SkPaint } from 'react-native-skia';

import {
  drawPressedPianoKeyFace,
  makePressedPianoKeyFace,
  type Box,
  type KeyBand,
  type PressedPianoKeyFace,
} from '../../shared';
import type { WhitePianoKeyLook } from './whitePianoKeyLook';

export type WhitePianoKeyLight = PressedPianoKeyFace;

/** The shaders of a lit white key in one role colour, made once per layout. */
export function makeWhitePianoKeyLight(
  band: KeyBand,
  look: WhitePianoKeyLook,
  pitch: number,
  color: SkColor,
): WhitePianoKeyLight {
  return makePressedPianoKeyFace(band, pitch, look.pressed, color);
}

/**
 * A pastel, sunken white-key face. The inactive key is never changed.
 */
export function drawWhitePianoKeyLight(
  canvas: SkCanvas,
  key: Box,
  look: WhitePianoKeyLook,
  pitch: number,
  light: WhitePianoKeyLight,
  level: number,
  paint: SkPaint,
) {
  'worklet';
  drawPressedPianoKeyFace(
    canvas,
    key,
    look.cornerRadius * pitch,
    pitch,
    look.pressed,
    light,
    level,
    paint,
  );
}
