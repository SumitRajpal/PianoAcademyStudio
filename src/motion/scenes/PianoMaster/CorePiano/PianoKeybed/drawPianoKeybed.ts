import { Skia, type SkCanvas } from 'react-native-skia';

import type { Size } from '../../shared';
import type { PianoKeybedLook } from './pianoKeybedLook';

/** Fills the whole keyboard; the keys are drawn over it. */
export function drawPianoKeybed(
  canvas: SkCanvas,
  size: Size,
  look: PianoKeybedLook,
) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(look.color));
  canvas.drawRect(Skia.XYWHRect(0, 0, size.width, size.height), paint);
}
