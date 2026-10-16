import type { SkCanvas } from 'react-native-skia';

import { fillPaint, fillRect } from '../../../shared';
import type { StaffLook } from './staffLook';

/** Where a staff is drawn: its top line's height, and where its lines run. */
export type StaffPlacement = { top: number; left: number; right: number };

/** The 5 staff lines, from the top one down. */
export function drawStaff(
  canvas: SkCanvas,
  staff: StaffPlacement,
  look: StaffLook,
) {
  const half = look.lineThickness / 2;
  const width = staff.right - staff.left;
  const paint = fillPaint(look.color);
  for (let line = 0; line < 5; line++) {
    fillRect(
      canvas,
      paint,
      staff.left,
      staff.top + line * look.space - half,
      width,
      look.lineThickness,
    );
  }
}

/**
 * How far a staff whose top line is at `top` reaches: from the top edge of
 * its top line to the bottom edge of its bottom line. Barlines span it.
 */
export function staffSpan(top: number, look: StaffLook) {
  return {
    top: top - look.lineThickness / 2,
    height: 4 * look.space + look.lineThickness,
  };
}
