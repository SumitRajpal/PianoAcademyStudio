/**
 * @purpose The music notation symbols, one folder each and named as in music: Staff (the 5 lines), SystemicBarline, Barline, TrebleClef, TimeSignature, Notehead, Stem, LedgerLine, QuarterNote (notehead + stem) and QuarterRest. Each draws on its own, to be reused by any component.
 */

export {
  drawStaff,
  LESSON_STAFF_LOOK,
  staffSpan,
  type StaffLook,
  type StaffPlacement,
} from './Staff';
export {
  drawSystemicBarline,
  LESSON_SYSTEMIC_BARLINE_LOOK,
  type SystemicBarlineLook,
} from './SystemicBarline';
export { drawBarline, LESSON_BARLINE_LOOK, type BarlineLook } from './Barline';
export {
  drawTrebleClef,
  LESSON_TREBLE_CLEF_LOOK,
  type TrebleClefLook,
} from './TrebleClef';
export {
  drawTimeSignature,
  LESSON_TIME_SIGNATURE_LOOK,
  type TimeSignatureLook,
  type TimeSignatureNumbers,
} from './TimeSignature';
export {
  drawNotehead,
  fillNoteheadShape,
  LESSON_NOTEHEAD_LOOK,
  noteheadGeometry,
  type NoteheadLook,
} from './Notehead';
export { drawStem, LESSON_STEM_LOOK, stemRect, type StemLook } from './Stem';
export {
  drawLedgerLine,
  LESSON_LEDGER_LINE_LOOK,
  type LedgerLineLook,
} from './LedgerLine';
export {
  drawQuarterNote,
  fillQuarterNoteShape,
  LESSON_QUARTER_NOTE_LOOK,
  quarterNoteGeometry,
  type QuarterNoteLook,
  type QuarterNotePlacement,
  type QuarterNoteState,
} from './QuarterNote';
export {
  drawQuarterRest,
  LESSON_QUARTER_REST_LOOK,
  type QuarterRestLook,
} from './QuarterRest';
