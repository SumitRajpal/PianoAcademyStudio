import { Skia, type SkCanvas } from 'react-native-skia';

import { setLinearGradient, type Size } from '../../shared';
import type { PianoFrameShadowLook } from './pianoFrameShadowLook';

/** The shadow across the whole keyboard, from `top` (the white keys' top edge) down. */
export function drawPianoFrameShadow(
  canvas: SkCanvas,
  top: number,
  size: Size,
  look: PianoFrameShadowLook,
) {
  const height = look.height * size.height;
  const paint = Skia.Paint();
  setLinearGradient(
    paint,
    { x: 0, y: top },
    { x: 0, y: top + height },
    look.stops,
  );
  canvas.drawRect(Skia.XYWHRect(0, top, size.width, height), paint);
}
