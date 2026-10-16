/**
 * The look of the sheet music: the look of each of its parts. Each part's
 * values live in its own folder, measured in points from the reference
 * lesson screen (iPhone 15 Plus); this file only puts them together.
 */

import { LESSON_DURATION_BAR_LOOK, type DurationBarLook } from './DurationBar';
import { LESSON_PLAYHEAD_LOOK, type PlayheadLook } from './Playhead';
import { LESSON_STAFF_PAPER_LOOK, type StaffPaperLook } from './StaffPaper';
import {
  LESSON_BARLINE_LOOK,
  LESSON_QUARTER_NOTE_LOOK,
  LESSON_QUARTER_REST_LOOK,
  LESSON_STAFF_LOOK,
  LESSON_SYSTEMIC_BARLINE_LOOK,
  LESSON_TIME_SIGNATURE_LOOK,
  LESSON_TREBLE_CLEF_LOOK,
  type BarlineLook,
  type QuarterNoteLook,
  type QuarterRestLook,
  type StaffLook,
  type SystemicBarlineLook,
  type TimeSignatureLook,
  type TrebleClefLook,
} from './symbols';

export type CoreNotesLook = {
  staffPaper: StaffPaperLook;
  staff: StaffLook;
  systemicBarline: SystemicBarlineLook;
  barline: BarlineLook;
  trebleClef: TrebleClefLook;
  timeSignature: TimeSignatureLook;
  quarterRest: QuarterRestLook;
  quarterNote: QuarterNoteLook;
  durationBar: DurationBarLook;
  playhead: PlayheadLook;
};

/** The lesson screen's sheet music. */
export const LESSON_NOTES_LOOK: CoreNotesLook = {
  staffPaper: LESSON_STAFF_PAPER_LOOK,
  staff: LESSON_STAFF_LOOK,
  systemicBarline: LESSON_SYSTEMIC_BARLINE_LOOK,
  barline: LESSON_BARLINE_LOOK,
  trebleClef: LESSON_TREBLE_CLEF_LOOK,
  timeSignature: LESSON_TIME_SIGNATURE_LOOK,
  quarterRest: LESSON_QUARTER_REST_LOOK,
  quarterNote: LESSON_QUARTER_NOTE_LOOK,
  durationBar: LESSON_DURATION_BAR_LOOK,
  playhead: LESSON_PLAYHEAD_LOOK,
};
