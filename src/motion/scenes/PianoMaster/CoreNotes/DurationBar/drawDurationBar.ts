import {
  BlendMode,
  PaintStyle,
  Skia,
  TileMode,
  vec,
  type SkCanvas,
  type SkPaint,
} from 'react-native-skia';

import { fillPaint } from '../../shared';
import type { DurationBarLook } from './durationBarLook';

/**
 * Where a note's bar goes: its notehead's centre, its stem's right edge and
 * the height of its centre.
 */
export type DurationBarPlacement = {
  noteheadX: number;
  stemRight: number;
  y: number;
};

/** For the note to play now: how its bar fades in, and its note shape. */
export type DurationBarFade = {
  /** Where the fade starts: the notehead's left edge. */
  from: number;
  /** Draws the note's notehead and stem with `eraser`, cutting them out. */
  cutOut: (eraser: SkPaint) => void;
};

/**
 * The bar showing how long to hold a note: part of the lesson design, not a
 * music symbol. Drawn over the staff lines and under the note. With `fade`,
 * it fades in from the notehead and the note's see-through shape shows the
 * staff rather than the bar.
 */
export function drawDurationBar(
  canvas: SkCanvas,
  bar: DurationBarPlacement,
  look: DurationBarLook,
  fade?: DurationBarFade,
) {
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  const stroke = fillPaint(look.strokeColor);
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeWidth(look.stroke);
  const radius = look.height / 2;

  const x = bar.noteheadX - look.start;
  const y = bar.y - look.height / 2;
  const width = bar.stemRight + look.end - x;
  fill.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(0, y),
      vec(0, y + look.height),
      [Skia.Color(look.top), Skia.Color(look.bottom)],
      null,
      TileMode.Clamp,
    ),
  );
  const shape = Skia.RRectXY(
    Skia.XYWHRect(x, y, width, look.height),
    radius,
    radius,
  );
  const inset = look.stroke / 2;
  const edge = Skia.RRectXY(
    Skia.XYWHRect(
      x + inset,
      y + inset,
      width - look.stroke,
      look.height - look.stroke,
    ),
    radius - inset,
    radius - inset,
  );
  if (!fade) {
    canvas.drawRRect(shape, fill);
    canvas.drawRRect(edge, stroke);
    return;
  }
  canvas.saveLayer();
  canvas.drawRRect(shape, fill);
  canvas.drawRRect(edge, stroke);
  const fadeIn = Skia.Paint();
  fadeIn.setBlendMode(BlendMode.DstIn);
  fadeIn.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(fade.from, 0),
      vec(fade.from + look.attention.fadeLength, 0),
      [
        Skia.Color(`rgba(0, 0, 0, ${look.attention.fadeFrom})`),
        Skia.Color('rgba(0, 0, 0, 1)'),
      ],
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(x, y, width, look.height), fadeIn);
  const eraser = fillPaint('#000000');
  eraser.setBlendMode(BlendMode.DstOut);
  fade.cutOut(eraser);
  canvas.restore();
}
