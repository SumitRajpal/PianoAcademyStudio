/**
 * @purpose The quarter note: a notehead and a stem, with ledger lines when it sits above or below the staff; drawn in ink, or see-through red when it is the note to play now.
 */

export {
  drawQuarterNote,
  fillQuarterNoteShape,
  quarterNoteGeometry,
  type QuarterNotePlacement,
  type QuarterNoteState,
} from './drawQuarterNote';
export {
  LESSON_QUARTER_NOTE_LOOK,
  type QuarterNoteLook,
} from './quarterNoteLook';
