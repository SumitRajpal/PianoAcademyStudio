/**
 * Draws quarter notes on a staff with the imperative Skia API, so the same
 * code renders in the app (the QuarterNotes component) and in tests: each
 * note's duration bar, head and stem, and the ledger lines it needs.
 * Note heads are ellipses, as in the reference design. The note to play now
 * (state "attention") is see-through red and its bar fades in from its head.
 */

import {
  BlendMode,
  PaintStyle,
  Skia,
  TileMode,
  vec,
  type SkCanvas,
  type SkPaint,
} from 'react-native-skia';

import { fillPaint, fillRect } from './paint';
import {
  beatX,
  ledgerLines,
  trebleY,
  type Score,
  type StaffLayout,
} from './score';
import type { StaffLook } from './staffLook';

type HeadShape = StaffLook['head'];

/**
 * Where an elliptical head meets its stem: how far its rightmost point is
 * from its centre, sideways (`right`) and up or down (`attach`).
 */
function headGeometry({ rx, ry, rotation }: HeadShape) {
  const turn = (rotation * Math.PI) / 180;
  const t = Math.atan2(-ry * Math.sin(turn), rx * Math.cos(turn));
  return {
    right:
      rx * Math.cos(t) * Math.cos(turn) - ry * Math.sin(t) * Math.sin(turn),
    attach:
      rx * Math.cos(t) * Math.sin(turn) + ry * Math.sin(t) * Math.cos(turn),
  };
}

function drawHead(
  canvas: SkCanvas,
  { rx, ry, rotation }: HeadShape,
  centerX: number,
  centerY: number,
  paint: SkPaint,
) {
  canvas.save();
  canvas.translate(centerX, centerY);
  canvas.rotate(rotation, 0, 0);
  canvas.drawOval(Skia.XYWHRect(-rx, -ry, 2 * rx, 2 * ry), paint);
  canvas.restore();
}

/** Draws the score's notes; its rests belong to the staff. */
export function drawQuarterNotes(
  canvas: SkCanvas,
  layout: StaffLayout,
  score: Score,
  look: StaffLook,
) {
  const { space } = look;
  const ink = fillPaint(look.ink);

  const notes = score.items.flatMap(item =>
    item.kind === 'note'
      ? [
          {
            ...item,
            right: beatX(layout, item.measure, item.beat),
            y: trebleY(item.pitch, layout.top, space),
          },
        ]
      : [],
  );

  const head = headGeometry(look.head);
  const stemRect = (note: { right: number; y: number }) => {
    const stemTop = note.y - look.stem.length * space;
    return Skia.XYWHRect(
      note.right - look.stem.thickness,
      stemTop,
      look.stem.thickness,
      note.y + head.attach - stemTop,
    );
  };

  // Duration bars, over the staff lines and under the notes. Each starts
  // under its head, so the rounded end stays hidden.
  const bar = look.duration;
  const barFill = Skia.Paint();
  barFill.setAntiAlias(true);
  const barStroke = fillPaint(bar.strokeColor);
  barStroke.setStyle(PaintStyle.Stroke);
  barStroke.setStrokeWidth(bar.stroke);
  const radius = bar.height / 2;
  for (const note of notes) {
    const attention = note.state === 'attention';
    const centerX = note.right - head.right;
    const x = centerX - bar.start;
    const y = note.y - bar.height / 2;
    const barWidth = note.right + bar.end - x;
    barFill.setShader(
      Skia.Shader.MakeLinearGradient(
        vec(0, y),
        vec(0, y + bar.height),
        [Skia.Color(bar.top), Skia.Color(bar.bottom)],
        null,
        TileMode.Clamp,
      ),
    );
    const shape = Skia.RRectXY(
      Skia.XYWHRect(x, y, barWidth, bar.height),
      radius,
      radius,
    );
    const inset = bar.stroke / 2;
    const edge = Skia.RRectXY(
      Skia.XYWHRect(
        x + inset,
        y + inset,
        barWidth - bar.stroke,
        bar.height - bar.stroke,
      ),
      radius - inset,
      radius - inset,
    );
    if (!attention) {
      canvas.drawRRect(shape, barFill);
      canvas.drawRRect(edge, barStroke);
      continue;
    }
    // The bar of the note to play now fades in from its head, and its
    // see-through head and stem show the staff rather than the bar.
    canvas.saveLayer();
    canvas.drawRRect(shape, barFill);
    canvas.drawRRect(edge, barStroke);
    const headLeft = centerX - head.right;
    const fade = Skia.Paint();
    fade.setBlendMode(BlendMode.DstIn);
    fade.setShader(
      Skia.Shader.MakeLinearGradient(
        vec(headLeft, 0),
        vec(headLeft + look.attention.fadeLength, 0),
        [
          Skia.Color(`rgba(0, 0, 0, ${look.attention.fadeFrom})`),
          Skia.Color('rgba(0, 0, 0, 1)'),
        ],
        null,
        TileMode.Clamp,
      ),
    );
    canvas.drawRect(Skia.XYWHRect(x, y, barWidth, bar.height), fade);
    const eraser = fillPaint('#000000');
    eraser.setBlendMode(BlendMode.DstOut);
    drawHead(canvas, look.head, centerX, note.y, eraser);
    canvas.drawRect(stemRect(note), eraser);
    canvas.restore();
  }

  // Ledger lines, then heads and stems.
  for (const note of notes) {
    const centerX = note.right - head.right;
    const headLeft = centerX - head.right;
    for (const y of ledgerLines(note.pitch, layout.top, space)) {
      fillRect(
        canvas,
        ink,
        headLeft - look.ledger.extension,
        y - look.ledger.thickness / 2,
        2 * head.right + 2 * look.ledger.extension,
        look.ledger.thickness,
      );
    }
    const stem = stemRect(note);
    if (note.state !== 'attention') {
      drawHead(canvas, look.head, centerX, note.y, ink);
      canvas.drawRect(stem, ink);
      continue;
    }
    // The note to play now: head and stem drawn as one opaque shape, then
    // made see-through once, stronger towards the stem, so where the stem
    // crosses the head it is not twice as strong.
    const solid = fillPaint(look.attention.color);
    canvas.saveLayer();
    drawHead(canvas, look.head, centerX, note.y, solid);
    canvas.drawRect(stem, solid);
    const strength = Skia.Paint();
    strength.setBlendMode(BlendMode.DstIn);
    strength.setShader(
      Skia.Shader.MakeLinearGradient(
        vec(headLeft, 0),
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
        headLeft,
        stem.y,
        note.right - headLeft,
        note.y + look.head.rx - stem.y,
      ),
      strength,
    );
    canvas.restore();
  }
}
