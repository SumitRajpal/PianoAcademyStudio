/**
 * Draws the sheet music from its symbols with the imperative Skia API, so the
 * same code renders in the app (recorded into pictures) and in tests
 * (rendered to an image). Two layers, with the playhead drawn over both:
 * 1. the staff layer: the staff paper, the staff, the barlines, the clef,
 *    the time signature and the rests;
 * 2. the note layer: each note's duration bar, then the notes.
 */

import type { SkCanvas } from 'react-native-skia';

import type { NotationTypefaces } from '../shared';
import type { CoreNotesLook } from './coreNotesLook';
import { drawDurationBar } from './DurationBar';
import {
  beatX,
  ledgerLines,
  trebleY,
  type Score,
  type StaffLayout,
} from './score';
import { drawStaffPaper } from './StaffPaper';
import {
  drawBarline,
  drawQuarterNote,
  drawQuarterRest,
  drawStaff,
  drawSystemicBarline,
  drawTimeSignature,
  drawTrebleClef,
  fillQuarterNoteShape,
  quarterNoteGeometry,
  staffSpan,
} from './symbols';

/** Everything under the notes; the staff layer draws the score's rests. */
export function drawCoreNotesStaffLayer(
  canvas: SkCanvas,
  layout: StaffLayout,
  score: Score,
  look: CoreNotesLook,
  typefaces: NotationTypefaces,
) {
  const span = staffSpan(layout.top, look.staff);
  drawStaffPaper(
    canvas,
    {
      x: layout.left,
      y: span.top,
      width: layout.right - layout.left,
      height: span.height,
    },
    look.staffPaper,
  );
  drawStaff(canvas, layout, look.staff);
  drawSystemicBarline(canvas, layout.left, span, look.systemicBarline);
  for (const x of layout.barlines) {
    drawBarline(canvas, x, span, look.barline);
  }

  const staff = { top: layout.top, space: look.staff.space };
  drawTrebleClef(canvas, layout.clef.x, staff, look.trebleClef, typefaces);
  // The score counts in quarter-note beats.
  drawTimeSignature(
    canvas,
    layout.timeSignature.x,
    staff,
    { beats: layout.timeSignature.beats, beatUnit: 4 },
    look.timeSignature,
    typefaces,
  );
  for (const item of score.items) {
    if (item.kind === 'rest') {
      drawQuarterRest(
        canvas,
        beatX(layout, item.measure, item.beat) - layout.restOffset,
        staff,
        look.quarterRest,
        typefaces,
      );
    }
  }
}

/** The score's notes, each with its duration bar; its rests are drawn above. */
export function drawCoreNotesNoteLayer(
  canvas: SkCanvas,
  layout: StaffLayout,
  score: Score,
  look: CoreNotesLook,
) {
  const { space } = look.staff;
  const notes = score.items.flatMap(item =>
    item.kind === 'note'
      ? [
          {
            state: item.state ?? 'normal',
            right: beatX(layout, item.measure, item.beat),
            y: trebleY(item.pitch, layout.top, space),
            ledgerLines: ledgerLines(item.pitch, layout.top, space),
          },
        ]
      : [],
  );

  // Duration bars first: over the staff lines and under every note.
  for (const note of notes) {
    const { notehead } = quarterNoteGeometry(note, space, look.quarterNote);
    drawDurationBar(
      canvas,
      { noteheadX: notehead.centerX, stemRight: note.right, y: note.y },
      look.durationBar,
      note.state === 'attention'
        ? {
            from: notehead.left,
            cutOut: eraser =>
              fillQuarterNoteShape(
                canvas,
                note,
                space,
                look.quarterNote,
                eraser,
              ),
          }
        : undefined,
    );
  }
  for (const note of notes) {
    drawQuarterNote(canvas, note, note.state, space, look.quarterNote);
  }
}
