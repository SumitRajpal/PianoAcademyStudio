/**
 * @purpose The sheet music above the piano, drawn with Skia and SMuFL music fonts: the music symbols (one folder each under symbols/), the score that places notes and rests on the staff, and the lesson design's own parts (staff paper, duration bars, playhead).
 */

export { QuarterNotes, type QuarterNotesProps } from './QuarterNotes';
export {
  drawCoreNotesNoteLayer,
  drawCoreNotesStaffLayer,
} from './drawCoreNotes';
export { LESSON_NOTES_LOOK, type CoreNotesLook } from './coreNotesLook';
export {
  beatX,
  diatonicStep,
  ledgerLines,
  trebleY,
  type NoteState,
  type Score,
  type ScoreItem,
  type StaffLayout,
} from './score';
export { useNotationTypefaces } from './useNotationTypefaces';
export {
  drawPlayhead,
  LESSON_PLAYHEAD_LOOK,
  type PlayheadLook,
  type PlayheadPosition,
} from './Playhead';
