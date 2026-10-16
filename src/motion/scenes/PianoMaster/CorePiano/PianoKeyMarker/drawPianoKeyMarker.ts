import { Skia, type SkCanvas } from 'react-native-skia';

import type { Box } from '../../shared';
import type { PianoKeyMarkerLook } from './pianoKeyMarkerLook';

/** A dot centred near the bottom of `key`. */
export function drawPianoKeyMarker(
  canvas: SkCanvas,
  key: Box,
  look: PianoKeyMarkerLook,
  pitch: number,
) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(look.color));
  canvas.drawCircle(
    key.x + key.width / 2,
    key.y + key.height - look.bottom * pitch,
    look.radius * pitch,
    paint,
  );
}
