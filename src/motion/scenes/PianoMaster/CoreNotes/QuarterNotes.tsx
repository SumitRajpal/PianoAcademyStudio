/**
 * The score's quarter notes, as a Skia element for a Canvas: each note's
 * duration bar, then the note (notehead, stem and ledger lines), with the
 * note to play now in the attention colour. Drawn in the staff's points,
 * under whatever transform its parent group sets, and recorded into a picture
 * only when its props change.
 */

import { useMemo } from 'react';
import { Picture, Skia } from 'react-native-skia';

import { LESSON_NOTES_LOOK, type CoreNotesLook } from './coreNotesLook';
import { drawCoreNotesNoteLayer } from './drawCoreNotes';
import type { Score, StaffLayout } from './score';

export type QuarterNotesProps = {
  /** The staff the notes sit on, and where its beats are. */
  layout: StaffLayout;
  /** The notes to draw; the staff layer draws the rests. */
  score: Score;
  look?: CoreNotesLook;
};

export function QuarterNotes({
  layout,
  score,
  look = LESSON_NOTES_LOOK,
}: QuarterNotesProps) {
  const picture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    drawCoreNotesNoteLayer(recorder.beginRecording(), layout, score, look);
    return recorder.finishRecordingAsPicture();
  }, [layout, score, look]);
  return <Picture picture={picture} />;
}
