import { Skia, TileMode, type SkCanvas } from 'react-native-skia';

import { clipToBox, pianoKeyShape, type Box, type Size } from '../../shared';
import type { BlackPianoKeyShadowsLook } from './blackPianoKeyShadowsLook';

/**
 * The shadows of all black keys, blurred together in one layer: one blur for
 * the whole keyboard costs far less than one per key. Each shadow has its
 * key's shape, `keyRadius` being the key's corner radius in points. The
 * shadows are clipped to the keyboard so they never darken what is above it.
 */
export function drawBlackPianoKeyShadows(
  canvas: SkCanvas,
  keys: readonly Box[],
  size: Size,
  look: BlackPianoKeyShadowsLook,
  pitch: number,
  keyRadius: number,
) {
  canvas.save();
  clipToBox(canvas, { x: 0, y: 0, ...size });
  const layer = Skia.Paint();
  layer.setImageFilter(
    Skia.ImageFilter.MakeBlur(
      look.sigmaX * pitch,
      look.sigmaY * pitch,
      TileMode.Decal,
      null,
    ),
  );
  canvas.saveLayer(layer);
  const shadow = Skia.Paint();
  shadow.setAntiAlias(true);
  shadow.setColor(Skia.Color(look.color));
  for (const key of keys) {
    canvas.drawRRect(
      pianoKeyShape({ ...key, y: key.y + look.dy * pitch }, keyRadius),
      shadow,
    );
  }
  canvas.restore();
  canvas.restore();
}
