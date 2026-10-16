import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  type SkCanvas,
} from 'react-native-skia';

import { clipToBox, pianoKeyShape, type Box } from '../../shared';
import type { WhitePianoKeyLook } from './whitePianoKeyLook';

/** One white key at rest: the key face, with a soft dark edge inside it. */
export function drawWhitePianoKey(
  canvas: SkCanvas,
  key: Box,
  look: WhitePianoKeyLook,
  pitch: number,
) {
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(look.fill));

  const shade = Skia.Paint();
  shade.setAntiAlias(true);
  shade.setStyle(PaintStyle.Stroke);
  shade.setStrokeWidth(look.edgeShade.stroke * pitch);
  shade.setColor(Skia.Color(`rgba(0, 0, 0, ${look.edgeShade.alpha})`));
  shade.setMaskFilter(
    Skia.MaskFilter.MakeBlur(
      BlurStyle.Normal,
      look.edgeShade.sigma * pitch,
      true,
    ),
  );

  const shape = pianoKeyShape(key, look.cornerRadius * pitch);
  canvas.save();
  clipToBox(canvas, key);
  canvas.drawRRect(shape, fill);
  canvas.clipRRect(shape, ClipOp.Intersect, true);
  canvas.drawRRect(shape, shade);
  canvas.restore();
}
