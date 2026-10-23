/**
 * Draws the calibration screen behind its text and keyboard: the lesson's
 * background gradient and progress bar, the white paper the questions are
 * written on, and the callout over the key to play. Coordinates are design
 * points (see calibrationDesign.ts).
 */

import {
  BlurStyle,
  Skia,
  TileMode,
  vec,
  type SkCanvas,
} from 'react-native-skia';

import { calloutPlacement, CALIBRATION_DESIGN } from './calibrationDesign';

const DESIGN_WIDTH = 932;

export type CalibrationBackdrop = {
  /** How far along, 0 to 1. */
  progress: number;
  /** Centre of the key to play, in design points; null: no callout. */
  calloutX: number | null;
};

export function drawCalibrationBackground(
  canvas: SkCanvas,
  screenHeight: number,
  { progress, calloutX }: CalibrationBackdrop,
) {
  const design = CALIBRATION_DESIGN;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(0, 0),
      vec(0, design.background.end),
      design.background.stops.map(([, color]) => Skia.Color(color)),
      design.background.stops.map(([position]) => position),
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, DESIGN_WIDTH, screenHeight), paint);
  paint.setShader(null);

  const keyboardBottom = design.keyboard.top + design.keyboard.height;
  paint.setColor(Skia.Color(design.bottomStrip));
  canvas.drawRect(
    Skia.XYWHRect(
      0,
      keyboardBottom,
      DESIGN_WIDTH,
      screenHeight - keyboardBottom,
    ),
    paint,
  );

  const bar = design.progress;
  const barRadius = bar.height / 2;
  paint.setColor(Skia.Color(bar.track));
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(bar.x, bar.y, bar.width, bar.height),
      barRadius,
      barRadius,
    ),
    paint,
  );
  const filled = bar.width * Math.min(1, Math.max(0, progress));
  if (filled > 0) {
    paint.setColor(Skia.Color(bar.fill));
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(bar.x, bar.y, Math.max(filled, bar.height), bar.height),
        barRadius,
        barRadius,
      ),
      paint,
    );
  }

  const { box, color, shadow } = design.paper;
  const shadowPaint = Skia.Paint();
  shadowPaint.setColor(Skia.Color(shadow.color));
  shadowPaint.setMaskFilter(
    Skia.MaskFilter.MakeBlur(BlurStyle.Normal, shadow.sigma, true),
  );
  canvas.drawRect(
    Skia.XYWHRect(box.x, box.y, box.width, box.height),
    shadowPaint,
  );
  paint.setColor(Skia.Color(color));
  canvas.drawRect(Skia.XYWHRect(box.x, box.y, box.width, box.height), paint);

  if (calloutX !== null) {
    const callout = design.callout;
    const { box: bubble, tip } = calloutPlacement(calloutX, DESIGN_WIDTH);
    paint.setColor(Skia.Color(callout.color));
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(bubble.x, bubble.y, bubble.width, bubble.height),
        callout.radius,
        callout.radius,
      ),
      paint,
    );
    const half = callout.pointer.width / 2;
    const baseY = bubble.y + bubble.height - 0.5;
    const pointer = Skia.PathBuilder.Make()
      .moveTo(tip.x - half, baseY)
      .lineTo(tip.x + half, baseY)
      .lineTo(tip.x, tip.y)
      .close()
      .build();
    canvas.drawPath(pointer, paint);
  }
}
