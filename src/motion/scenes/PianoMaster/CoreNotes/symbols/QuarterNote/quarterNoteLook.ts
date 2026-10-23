import { LESSON_LEDGER_LINE_LOOK, type LedgerLineLook } from '../LedgerLine';
import { LESSON_NOTEHEAD_LOOK, type NoteheadLook } from '../Notehead';
import { LESSON_STEM_LOOK, type StemLook } from '../Stem';

/** A quarter note: the look of its parts, and of the note to play now. */
export type QuarterNoteLook = {
  notehead: NoteheadLook;
  stem: StemLook;
  ledgerLine: LedgerLineLook;
  /**
   * The note to play now: notehead and stem as one see-through `color`
   * shape, its opacity rising from `fromAlpha` at the notehead's left edge
   * to `toAlpha` at the stem.
   */
  attention: { color: string; fromAlpha: number; toAlpha: number };
};

export const LESSON_QUARTER_NOTE_LOOK: QuarterNoteLook = {
  notehead: LESSON_NOTEHEAD_LOOK,
  stem: LESSON_STEM_LOOK,
  ledgerLine: LESSON_LEDGER_LINE_LOOK,
  attention: { color: '#FF0000', fromAlpha: 0.34, toAlpha: 0.68 },
};
