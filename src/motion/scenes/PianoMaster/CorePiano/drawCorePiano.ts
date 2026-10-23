/**
 * Draws the keyboard from its parts with the imperative Skia API, so the same
 * code renders in the app (recorded into pictures) and in tests (rendered to
 * an image).
 *
 * Two layers, so lit keys can go in between:
 * 1. the keybed, the white keys, the frame shadow and the marker dots;
 * 2. the shadows of the black keys, then the black keys.
 */

import type { SkCanvas } from 'react-native-skia';

import type { Size } from '../shared';
import { drawBlackPianoKey } from './BlackPianoKey';
import { drawBlackPianoKeyShadows } from './BlackPianoKeyShadows';
import type { CorePianoLook } from './corePianoLook';
import type { CorePianoLayout } from './layoutCorePiano';
import { drawPianoFrameShadow } from './PianoFrameShadow';
import { drawPianoKeybed } from './PianoKeybed';
import { drawPianoKeyMarker } from './PianoKeyMarker';
import { drawWhitePianoKey } from './WhitePianoKey';

export function drawCorePianoWhiteLayer(
  canvas: SkCanvas,
  layout: CorePianoLayout,
  size: Size,
  look: CorePianoLook,
  markers: ReadonlySet<number>,
) {
  const { whites, pitch } = layout;
  drawPianoKeybed(canvas, size, look.keybed);
  for (const key of whites) {
    drawWhitePianoKey(canvas, key, look.whiteKey, pitch);
  }
  drawPianoFrameShadow(canvas, whites[0]?.y ?? 0, size, look.frameShadow);
  for (const key of whites) {
    if (markers.has(key.midi)) {
      drawPianoKeyMarker(canvas, key, look.marker, pitch);
    }
  }
}

export function drawCorePianoBlackLayer(
  canvas: SkCanvas,
  layout: CorePianoLayout,
  size: Size,
  look: CorePianoLook,
) {
  const { blacks, pitch } = layout;
  drawBlackPianoKeyShadows(
    canvas,
    blacks,
    size,
    look.blackKeyShadows,
    pitch,
    look.blackKey.cornerRadius * pitch,
  );
  for (const key of blacks) {
    drawBlackPianoKey(canvas, key, look.blackKey, pitch);
  }
}
