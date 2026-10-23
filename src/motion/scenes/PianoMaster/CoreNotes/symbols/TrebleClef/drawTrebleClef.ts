import type { SkCanvas } from 'react-native-skia';

import {
  drawMusicGlyph,
  fillPaint,
  staffLineY,
  type NotationTypefaces,
  type StaffPosition,
} from '../../../shared';
import type { TrebleClefLook } from './trebleClefLook';

/** SMuFL gClef (U+E050). */
const G_CLEF = 0xe050;

/**
 * The treble clef (G clef). Its curl sits on line 2, which it marks as G4,
 * the G above middle C. `x` is where the glyph starts.
 */
export function drawTrebleClef(
  canvas: SkCanvas,
  x: number,
  staff: StaffPosition,
  look: TrebleClefLook,
  typefaces: NotationTypefaces,
) {
  drawMusicGlyph(
    canvas,
    typefaces,
    G_CLEF,
    x,
    staffLineY(staff, 2),
    look,
    staff.space,
    fillPaint(look.color),
  );
}
