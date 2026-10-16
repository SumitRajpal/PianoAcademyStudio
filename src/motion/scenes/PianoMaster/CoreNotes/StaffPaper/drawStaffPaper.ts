import { BlurStyle, Skia, type SkCanvas } from 'react-native-skia';

import { fillPaint, fillRect, type Box } from '../../shared';
import type { StaffPaperLook } from './staffPaperLook';

/**
 * The white strip the staff is printed on, with a soft shadow around it.
 * Part of the lesson design, not a music symbol.
 */
export function drawStaffPaper(
  canvas: SkCanvas,
  box: Box,
  look: StaffPaperLook,
) {
  const shadow = fillPaint(look.shadow.color);
  shadow.setMaskFilter(
    Skia.MaskFilter.MakeBlur(BlurStyle.Normal, look.shadow.sigma, true),
  );
  fillRect(canvas, shadow, box.x, box.y, box.width, box.height);
  fillRect(canvas, fillPaint(look.color), box.x, box.y, box.width, box.height);
}
