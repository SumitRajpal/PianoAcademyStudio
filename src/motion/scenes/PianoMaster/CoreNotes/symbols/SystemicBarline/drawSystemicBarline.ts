import type { SkCanvas } from 'react-native-skia';

import { fillPaint, fillRect } from '../../../shared';
import type { SystemicBarlineLook } from './systemicBarlineLook';

/**
 * The systemic barline: the line at the very start of the staff, its left
 * edge at `x`, across `span` (from Staff's staffSpan).
 */
export function drawSystemicBarline(
  canvas: SkCanvas,
  x: number,
  span: { top: number; height: number },
  look: SystemicBarlineLook,
) {
  fillRect(
    canvas,
    fillPaint(look.color),
    x,
    span.top,
    look.thickness,
    span.height,
  );
}
