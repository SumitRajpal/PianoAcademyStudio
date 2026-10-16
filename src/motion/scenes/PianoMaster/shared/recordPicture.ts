import { Skia, type SkCanvas, type SkPicture } from 'react-native-skia';

export type Size = { width: number; height: number };

/** Records drawing commands into a picture of the given size. */
export function recordPicture(
  size: Size,
  draw: (canvas: SkCanvas) => void,
): SkPicture {
  const recorder = Skia.PictureRecorder();
  draw(recorder.beginRecording(Skia.XYWHRect(0, 0, size.width, size.height)));
  return recorder.finishRecordingAsPicture();
}
