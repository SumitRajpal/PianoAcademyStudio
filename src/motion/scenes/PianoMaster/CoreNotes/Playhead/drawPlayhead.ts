import { Skia, type SkCanvas } from 'react-native-skia';

import { fillPaint } from '../../shared';
import type { PlayheadLook } from './playheadLook';

/** Where the playhead is: its left edge, and where it starts and ends. */
export type PlayheadPosition = { x: number; top: number; bottom: number };

/**
 * The playhead: the big see-through vertical line marking where the music
 * is now, drawn over the notes. Part of the lesson design, not a music symbol.
 */
export function drawPlayhead(
  canvas: SkCanvas,
  position: PlayheadPosition,
  look: PlayheadLook,
) {
  const end = look.width / 2;
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(
        position.x,
        position.top,
        look.width,
        position.bottom - position.top,
      ),
      end,
      end,
    ),
    fillPaint(look.color),
  );
}
