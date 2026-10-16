import type { SkCanvas, SkPaint } from 'react-native-skia';

import { clipToBox, pianoKeyShape, type Box } from '../../shared';
import type { BlackPianoKeyLook } from './blackPianoKeyLook';

/**
 * One lit black key: the key's shape filled with `paint`, which holds the
 * colour of the key's role. A worklet: the UI thread draws it every time the
 * key state changes.
 */
export function drawBlackPianoKeyLight(
  canvas: SkCanvas,
  key: Box,
  look: BlackPianoKeyLook,
  pitch: number,
  paint: SkPaint,
) {
  'worklet';
  canvas.save();
  clipToBox(canvas, key);
  canvas.drawRRect(pianoKeyShape(key, look.cornerRadius * pitch), paint);
  canvas.restore();
}
