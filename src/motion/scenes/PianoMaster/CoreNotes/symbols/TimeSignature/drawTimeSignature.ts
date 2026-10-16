import type { SkCanvas } from 'react-native-skia';

import {
  drawMusicGlyph,
  fillPaint,
  staffLineY,
  type NotationTypefaces,
  type StaffPosition,
} from '../../../shared';
import type { TimeSignatureLook } from './timeSignatureLook';

/** SMuFL timeSig0 (U+E080); the digits 1 to 9 follow it. */
const TIME_SIG_0 = 0xe080;

/** The two numbers of a time signature, as in 4/4. */
export type TimeSignatureNumbers = {
  /** The top number: beats in each measure. */
  beats: number;
  /** The bottom number: the note value of one beat (4 = quarter note). */
  beatUnit: number;
};

/**
 * A time signature: the top number centred on line 4, the bottom number on
 * line 2. Each number is drawn as one digit, so 0 to 9 for now. `x` is where
 * the digits start.
 */
export function drawTimeSignature(
  canvas: SkCanvas,
  x: number,
  staff: StaffPosition,
  numbers: TimeSignatureNumbers,
  look: TimeSignatureLook,
  typefaces: NotationTypefaces,
) {
  const paint = fillPaint(look.color);
  drawMusicGlyph(
    canvas,
    typefaces,
    TIME_SIG_0 + numbers.beats,
    x,
    staffLineY(staff, 4),
    look,
    staff.space,
    paint,
  );
  drawMusicGlyph(
    canvas,
    typefaces,
    TIME_SIG_0 + numbers.beatUnit,
    x,
    staffLineY(staff, 2),
    look,
    staff.space,
    paint,
  );
}
