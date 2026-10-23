/**
 * Draws the lesson screen behind the staff and keyboard: the background
 * gradient, the strip under the keyboard, the pause button and the progress
 * bar. Coordinates are design points (see lessonDesign.ts).
 */

import { Skia, TileMode, vec, type SkCanvas } from 'react-native-skia';

import { DESIGN_SIZE, LESSON_DESIGN } from './lessonDesign';

export function drawLessonBackground(canvas: SkCanvas, screenHeight: number) {
  const design = LESSON_DESIGN;
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
  canvas.drawRect(Skia.XYWHRect(0, 0, DESIGN_SIZE.width, screenHeight), paint);
  paint.setShader(null);

  const keyboardBottom = design.keyboard.top + design.keyboard.height;
  paint.setColor(Skia.Color(design.bottomStrip));
  canvas.drawRect(
    Skia.XYWHRect(
      0,
      keyboardBottom,
      DESIGN_SIZE.width,
      screenHeight - keyboardBottom,
    ),
    paint,
  );

  const { pause } = design;
  paint.setColor(Skia.Color(pause.fill));
  canvas.drawCircle(pause.centerX, pause.centerY, pause.radius, paint);
  paint.setColor(Skia.Color(pause.bars.color));
  const barRadius = pause.bars.width / 2;
  for (const left of pause.bars.left) {
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(
          left,
          pause.bars.top,
          pause.bars.width,
          pause.bars.height,
        ),
        barRadius,
        barRadius,
      ),
      paint,
    );
  }

  const { progress } = design;
  const radius = progress.height / 2;
  paint.setColor(Skia.Color(progress.track));
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(progress.x, progress.y, progress.width, progress.height),
      radius,
      radius,
    ),
    paint,
  );
  paint.setColor(Skia.Color(progress.fill));
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(
        progress.x,
        progress.y,
        progress.width * progress.value,
        progress.height,
      ),
      radius,
      radius,
    ),
    paint,
  );
}
