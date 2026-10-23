/**
 * A quarter note, built from the Notehead, Stem and LedgerLine symbols: a
 * filled notehead with a stem going up from its right side. The note to play
 * now ("attention") is see-through red.
 */

import {
  BlendMode,
  Skia,
  TileMode,
  vec,
  type SkCanvas,
  type SkPaint,
} from 'react-native-skia';

import { fillPaint } from '../../../shared';
import { drawLedgerLine } from '../LedgerLine';
import { drawNotehead, fillNoteheadShape, noteheadGeometry } from '../Notehead';
import { drawStem, stemRect } from '../Stem';
import type { QuarterNoteLook } from './quarterNoteLook';

/** "attention" is the note to play now. */
export type QuarterNoteState = 'normal' | 'attention';

/**
 * Where a quarter note goes: its stem's right edge, the height of its
 * notehead's centre, and the heights of the ledger lines it needs.
 */
export type QuarterNotePlacement = {
  right: number;
  y: number;
  ledgerLines: readonly number[];
};

/** Where the note's parts sit, on a staff whose spaces are `space` tall. */
export function quarterNoteGeometry(
  note: QuarterNotePlacement,
  space: number,
  look: QuarterNoteLook,
) {
  const head = noteheadGeometry(look.notehead);
  const centerX = note.right - head.right;
  return {
    /** The notehead's centre, its left edge and its width. */
    notehead: { centerX, left: centerX - head.right, width: 2 * head.right },
    /** The stem goes up from where it meets the notehead. */
    stem: {
      right: note.right,
      top: note.y - look.stem.length * space,
      bottom: note.y + head.attach,
    },
  };
}

/**
 * The note's notehead and stem as one shape filled with `paint`: to draw it
 * see-through, or to cut it out of what is under it.
 */
export function fillQuarterNoteShape(
  canvas: SkCanvas,
  note: QuarterNotePlacement,
  space: number,
  look: QuarterNoteLook,
  paint: SkPaint,
) {
  const { notehead, stem } = quarterNoteGeometry(note, space, look);
  fillNoteheadShape(canvas, notehead.centerX, note.y, look.notehead, paint);
  canvas.drawRect(stemRect(stem.right, stem.top, stem.bottom, look.stem), paint);
}

/** A quarter note: its ledger lines, then its notehead and stem. */
export function drawQuarterNote(
  canvas: SkCanvas,
  note: QuarterNotePlacement,
  state: QuarterNoteState,
  space: number,
  look: QuarterNoteLook,
) {
  const { notehead, stem } = quarterNoteGeometry(note, space, look);
  for (const y of note.ledgerLines) {
    drawLedgerLine(canvas, y, notehead.left, notehead.width, look.ledgerLine);
  }
  if (state !== 'attention') {
    drawNotehead(canvas, notehead.centerX, note.y, look.notehead);
    drawStem(canvas, stem.right, stem.top, stem.bottom, look.stem);
    return;
  }
  // The note to play now: notehead and stem drawn as one opaque shape, then
  // made see-through once, stronger towards the stem, so where the stem
  // crosses the notehead it is not twice as strong.
  canvas.saveLayer();
  fillQuarterNoteShape(
    canvas,
    note,
    space,
    look,
    fillPaint(look.attention.color),
  );
  const strength = Skia.Paint();
  strength.setBlendMode(BlendMode.DstIn);
  strength.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(notehead.left, 0),
      vec(note.right, 0),
      [
        Skia.Color(`rgba(0, 0, 0, ${look.attention.fromAlpha})`),
        Skia.Color(`rgba(0, 0, 0, ${look.attention.toAlpha})`),
      ],
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(
    Skia.XYWHRect(
      notehead.left,
      stem.top,
      note.right - notehead.left,
      note.y + look.notehead.rx - stem.top,
    ),
    strength,
  );
  canvas.restore();
}
