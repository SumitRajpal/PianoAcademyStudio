import type { SkCanvas } from 'react-native-skia';

import { fillPaint, fillRect } from '../../../shared';
import type { BarlineLook } from './barlineLook';

/**
 * A single barline, the line between two measures: centred on `x`, across
 * `span` (from Staff's staffSpan).
 */
export function drawBarline(
  canvas: SkCanvas,
  x: number,
  span: { top: number; height: number },
  look: BarlineLook,
) {
  fillRect(
    canvas,
    fillPaint(look.color),
    x - look.thickness / 2,
    span.top,
    look.thickness,
    span.height,
  );
}
