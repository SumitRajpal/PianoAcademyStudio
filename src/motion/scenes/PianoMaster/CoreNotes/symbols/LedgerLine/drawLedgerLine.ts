import type { SkCanvas } from 'react-native-skia';

import { fillPaint, fillRect } from '../../../shared';
import type { LedgerLineLook } from './ledgerLineLook';

/**
 * A ledger line at height `y`, for a note above or below the staff: across a
 * notehead that starts at `left` and is `width` wide.
 */
export function drawLedgerLine(
  canvas: SkCanvas,
  y: number,
  left: number,
  width: number,
  look: LedgerLineLook,
) {
  fillRect(
    canvas,
    fillPaint(look.color),
    left - look.extension,
    y - look.thickness / 2,
    width + 2 * look.extension,
    look.thickness,
  );
}
