import { LESSON_NOTATION_INK } from '../../../shared';

/**
 * A ledger line. Sizes are in points; `extension` is how far it reaches past
 * each side of the notehead.
 */
export type LedgerLineLook = {
  color: string;
  thickness: number;
  extension: number;
};

export const LESSON_LEDGER_LINE_LOOK: LedgerLineLook = {
  color: LESSON_NOTATION_INK,
  thickness: 1,
  extension: 7.9 / 3,
};
