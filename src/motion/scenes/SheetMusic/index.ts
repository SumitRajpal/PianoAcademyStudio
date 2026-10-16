/**
 * @purpose The staff of a lesson, drawn with Skia and SMuFL music fonts: the staff with its clef, time signature and rests, the QuarterNotes component (heads, stems and duration bars) and the playhead.
 */

export { QuarterNotes, type QuarterNotesProps } from './QuarterNotes';
export { drawQuarterNotes } from './drawQuarterNotes';
export {
  drawPlayhead,
  drawStaff,
  type NotationTypefaces,
  type Playhead,
} from './drawStaff';
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
export {
  LESSON_STAFF,
  type GlyphFit,
  type MusicFont,
  type StaffLook,
} from './staffLook';
export { useNotationTypefaces } from './useNotationTypefaces';
