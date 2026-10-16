/**
 * Draws the keyboard with the imperative Skia API, so the same code renders
 * in the app (recorded into pictures) and in tests (rendered to an image).
 *
 * Two layers, so lit keys can go in between:
 * 1. the keybed, white keys, the shadow under the frame and the marker dots;
 * 2. the shadows of the black keys, then the black keys.
 */

import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  TileMode,
  vec,
  type SkCanvas,
  type SkPaint,
  type SkPicture,
} from 'react-native-skia';

import type { KeyRect } from '../../../shared/piano';
import type { GradientStop, KeyboardLook } from './keyboardLook';

export type Size = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };

/** Records drawing commands into a picture of the given size. */
export function recordPicture(
  size: Size,
  draw: (canvas: SkCanvas) => void,
): SkPicture {
  const recorder = Skia.PictureRecorder();
  draw(recorder.beginRecording(Skia.XYWHRect(0, 0, size.width, size.height)));
  return recorder.finishRecordingAsPicture();
}

function setLinearGradient(
  paint: SkPaint,
  from: { x: number; y: number },
  to: { x: number; y: number },
  stops: readonly GradientStop[],
) {
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(from.x, from.y),
      vec(to.x, to.y),
      stops.map(([, color]) => Skia.Color(color)),
      stops.map(([position]) => position),
      TileMode.Clamp,
    ),
  );
}

/**
 * A key shape: square at the top, rounded at the bottom. It is drawn taller
 * than the key, so the caller clips it to the key box.
 */
function keyShape(box: Box, radius: number) {
  return Skia.RRectXY(
    Skia.XYWHRect(box.x, box.y - radius, box.width, box.height + radius),
    radius,
    radius,
  );
}

function clipTo(canvas: SkCanvas, box: Box) {
  canvas.clipRect(
    Skia.XYWHRect(box.x, box.y, box.width, box.height),
    ClipOp.Intersect,
    true,
  );
}

/** White key pitch of a laid-out keyboard. */
export function pitchOf(rects: readonly KeyRect[], width: number): number {
  const whites = rects.filter(key => !key.isBlack).length;
  return whites > 0 ? width / whites : 0;
}

export function drawWhiteLayer(
  canvas: SkCanvas,
  rects: readonly KeyRect[],
  size: Size,
  look: KeyboardLook,
  markers: ReadonlySet<number>,
) {
  const pitch = pitchOf(rects, size.width);
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(look.keybed));
  canvas.drawRect(Skia.XYWHRect(0, 0, size.width, size.height), fill);

  fill.setColor(Skia.Color(look.white.fill));
  const shade = Skia.Paint();
  shade.setAntiAlias(true);
  shade.setStyle(PaintStyle.Stroke);
  shade.setStrokeWidth(look.white.edgeShade.stroke * pitch);
  shade.setColor(Skia.Color(`rgba(0, 0, 0, ${look.white.edgeShade.alpha})`));
  shade.setMaskFilter(
    Skia.MaskFilter.MakeBlur(
      BlurStyle.Normal,
      look.white.edgeShade.sigma * pitch,
      true,
    ),
  );
  const radius = look.white.cornerRadius * pitch;
  for (const key of rects) {
    if (key.isBlack) {
      continue;
    }
    const shape = keyShape(key, radius);
    canvas.save();
    clipTo(canvas, key);
    canvas.drawRRect(shape, fill);
    canvas.clipRRect(shape, ClipOp.Intersect, true);
    canvas.drawRRect(shape, shade);
    canvas.restore();
  }

  const top = rects.find(key => !key.isBlack)?.y ?? 0;
  const height = look.topShadow.height * size.height;
  const shadow = Skia.Paint();
  setLinearGradient(
    shadow,
    { x: 0, y: top },
    { x: 0, y: top + height },
    look.topShadow.stops,
  );
  canvas.drawRect(Skia.XYWHRect(0, top, size.width, height), shadow);

  const dot = Skia.Paint();
  dot.setAntiAlias(true);
  dot.setColor(Skia.Color(look.marker.color));
  for (const key of rects) {
    if (!key.isBlack && markers.has(key.midi)) {
      canvas.drawCircle(
        key.x + key.width / 2,
        key.y + key.height - look.marker.bottom * pitch,
        look.marker.radius * pitch,
        dot,
      );
    }
  }
}

export function drawBlackLayer(
  canvas: SkCanvas,
  rects: readonly KeyRect[],
  size: Size,
  look: KeyboardLook,
) {
  const pitch = pitchOf(rects, size.width);
  const black = look.black;
  const blacks = rects.filter(key => key.isBlack);
  const radius = black.cornerRadius * pitch;

  // Shadows, clipped to the keyboard so they never darken what is above it.
  canvas.save();
  clipTo(canvas, { x: 0, y: 0, ...size });
  const layer = Skia.Paint();
  layer.setImageFilter(
    Skia.ImageFilter.MakeBlur(
      black.shadow.sigmaX * pitch,
      black.shadow.sigmaY * pitch,
      TileMode.Decal,
      null,
    ),
  );
  canvas.saveLayer(layer);
  const shadow = Skia.Paint();
  shadow.setAntiAlias(true);
  shadow.setColor(Skia.Color(black.shadow.color));
  for (const key of blacks) {
    canvas.drawRRect(
      keyShape({ ...key, y: key.y + black.shadow.dy * pitch }, radius),
      shadow,
    );
  }
  canvas.restore();
  canvas.restore();

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  for (const key of blacks) {
    const { x, y, width, height } = key;
    canvas.save();
    clipTo(canvas, key);

    setLinearGradient(paint, { x: 0, y }, { x: 0, y: y + height }, black.body);
    canvas.drawRRect(keyShape(key, radius), paint);

    const panel = {
      x: x + black.panel.left * pitch,
      y,
      width: width - (black.panel.left + black.panel.right) * pitch,
      height: black.panel.bottom * height,
    };
    const panelRadius = black.panel.radius * pitch;
    setLinearGradient(
      paint,
      { x: 0, y },
      { x: 0, y: y + panel.height },
      black.panel.stops,
    );
    canvas.drawRRect(keyShape(panel, panelRadius), paint);

    const straight = panel.height - panelRadius;
    const bevel = black.rightBevel.width * pitch;
    setLinearGradient(
      paint,
      { x: panel.x + panel.width - bevel, y: 0 },
      { x: panel.x + panel.width, y: 0 },
      [
        [0, 'rgba(0, 0, 0, 0)'],
        [1, black.rightBevel.color],
      ],
    );
    canvas.drawRect(
      Skia.XYWHRect(panel.x + panel.width - bevel, y, bevel, straight),
      paint,
    );

    setLinearGradient(
      paint,
      { x: 0, y },
      { x: 0, y: y + panel.height },
      black.highlight.stops,
    );
    canvas.drawRect(
      Skia.XYWHRect(
        x + black.highlight.left * pitch,
        y,
        black.highlight.width * pitch,
        straight,
      ),
      paint,
    );

    const reflectionTop = y + panel.height;
    const reflectionHeight = black.reflection.height * pitch;
    setLinearGradient(
      paint,
      { x: 0, y: reflectionTop },
      { x: 0, y: reflectionTop + reflectionHeight },
      black.reflection.stops,
    );
    canvas.drawRect(
      Skia.XYWHRect(
        x + black.reflection.left * pitch,
        reflectionTop,
        width - (black.reflection.left + black.reflection.right) * pitch,
        reflectionHeight,
      ),
      paint,
    );

    const lipTop = y + black.lip.top * height;
    const lipBottom = y + black.lip.bottom * height;
    const lipRadius = black.lip.radius * pitch;
    setLinearGradient(
      paint,
      { x: 0, y: lipTop },
      { x: 0, y: lipBottom },
      black.lip.stops,
    );
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(
          x + black.lip.left * pitch,
          lipTop,
          width - (black.lip.left + black.lip.right) * pitch,
          lipBottom - lipTop,
        ),
        lipRadius,
        lipRadius,
      ),
      paint,
    );
    canvas.restore();
  }
}
