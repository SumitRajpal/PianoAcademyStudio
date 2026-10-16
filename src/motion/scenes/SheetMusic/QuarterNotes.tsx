/**
 * Quarter notes on a staff, as a Skia element for a Canvas: each note's
 * head, stem and duration bar, and its ledger lines, with the note to play
 * now in the attention colour. Drawn in the staff's points, under whatever
 * transform its parent group sets, and recorded into a picture only when
 * its props change.
 */

import { useMemo } from 'react';
import { Picture, Skia } from 'react-native-skia';

import { drawQuarterNotes } from './drawQuarterNotes';
import type { Score, StaffLayout } from './score';
import { LESSON_STAFF, type StaffLook } from './staffLook';

export type QuarterNotesProps = {
  /** The staff the notes sit on, and where its beats are. */
  layout: StaffLayout;
  /** The notes to draw; the staff draws the rests. */
  score: Score;
  look?: StaffLook;
};

export function QuarterNotes({
  layout,
  score,
  look = LESSON_STAFF,
}: QuarterNotesProps) {
  const picture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    drawQuarterNotes(recorder.beginRecording(), layout, score, look);
    return recorder.finishRecordingAsPicture();
  }, [layout, score, look]);
  return <Picture picture={picture} />;
}
