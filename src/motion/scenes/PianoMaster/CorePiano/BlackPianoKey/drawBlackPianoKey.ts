import { Skia, type SkCanvas } from 'react-native-skia';

import {
  clipToBox,
  pianoKeyShape,
  setLinearGradient,
  type Box,
} from '../../shared';
import type { BlackPianoKeyLook } from './blackPianoKeyLook';

/**
 * One black key at rest: the body, the lighter top face with its highlight,
 * bevel and reflection, and the lip at the front. Its shadow is drawn
 * separately, under all black keys at once (see BlackPianoKeyShadows).
 */
export function drawBlackPianoKey(
  canvas: SkCanvas,
  key: Box,
  look: BlackPianoKeyLook,
  pitch: number,
) {
  const { x, y, width, height } = key;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.save();
  clipToBox(canvas, key);

  // Body.
  setLinearGradient(paint, { x: 0, y }, { x: 0, y: y + height }, look.body);
  canvas.drawRRect(pianoKeyShape(key, look.cornerRadius * pitch), paint);

  // Top face.
  const panel = {
    x: x + look.panel.left * pitch,
    y,
    width: width - (look.panel.left + look.panel.right) * pitch,
    height: look.panel.bottom * height,
  };
  const panelRadius = look.panel.radius * pitch;
  setLinearGradient(
    paint,
    { x: 0, y },
    { x: 0, y: y + panel.height },
    look.panel.stops,
  );
  canvas.drawRRect(pianoKeyShape(panel, panelRadius), paint);

  // Right bevel.
  const straight = panel.height - panelRadius;
  const bevel = look.rightBevel.width * pitch;
  setLinearGradient(
    paint,
    { x: panel.x + panel.width - bevel, y: 0 },
    { x: panel.x + panel.width, y: 0 },
    [
      [0, 'rgba(0, 0, 0, 0)'],
      [1, look.rightBevel.color],
    ],
  );
  canvas.drawRect(
    Skia.XYWHRect(panel.x + panel.width - bevel, y, bevel, straight),
    paint,
  );

  // Highlight.
  setLinearGradient(
    paint,
    { x: 0, y },
    { x: 0, y: y + panel.height },
    look.highlight.stops,
  );
  canvas.drawRect(
    Skia.XYWHRect(
      x + look.highlight.left * pitch,
      y,
      look.highlight.width * pitch,
      straight,
    ),
    paint,
  );

  // Reflection.
  const reflectionTop = y + panel.height;
  const reflectionHeight = look.reflection.height * pitch;
  setLinearGradient(
    paint,
    { x: 0, y: reflectionTop },
    { x: 0, y: reflectionTop + reflectionHeight },
    look.reflection.stops,
  );
  canvas.drawRect(
    Skia.XYWHRect(
      x + look.reflection.left * pitch,
      reflectionTop,
      width - (look.reflection.left + look.reflection.right) * pitch,
      reflectionHeight,
    ),
    paint,
  );

  // Lip.
  const lipTop = y + look.lip.top * height;
  const lipBottom = y + look.lip.bottom * height;
  const lipRadius = look.lip.radius * pitch;
  setLinearGradient(
    paint,
    { x: 0, y: lipTop },
    { x: 0, y: lipBottom },
    look.lip.stops,
  );
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(
        x + look.lip.left * pitch,
        lipTop,
        width - (look.lip.left + look.lip.right) * pitch,
        lipBottom - lipTop,
      ),
      lipRadius,
      lipRadius,
    ),
    paint,
  );

  canvas.restore();
}
