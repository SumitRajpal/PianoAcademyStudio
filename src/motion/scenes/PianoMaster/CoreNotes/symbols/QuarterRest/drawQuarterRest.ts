import type { SkCanvas } from 'react-native-skia';

import {
  drawMusicGlyph,
  fillPaint,
  staffLineY,
  type NotationTypefaces,
  type StaffPosition,
} from '../../../shared';
import type { QuarterRestLook } from './quarterRestLook';

/** SMuFL restQuarter (U+E4E5). */
const REST_QUARTER = 0xe4e5;

/**
 * A quarter rest: one beat of silence, centred on line 3 (the middle line).
 * `x` is where the glyph starts.
 */
export function drawQuarterRest(
  canvas: SkCanvas,
  x: number,
  staff: StaffPosition,
  look: QuarterRestLook,
  typefaces: NotationTypefaces,
) {
  drawMusicGlyph(
    canvas,
    typefaces,
    REST_QUARTER,
    x,
    staffLineY(staff, 3),
    look,
    staff.space,
    fillPaint(look.color),
  );
}
