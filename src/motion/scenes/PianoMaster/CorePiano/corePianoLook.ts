/**
 * The look of the whole keyboard: the look of each of its parts. Each part's
 * values live in its own folder, measured pixel by pixel from the reference
 * lesson screen; this file only puts them together.
 */

import {
  LESSON_BLACK_PIANO_KEY_LOOK,
  type BlackPianoKeyLook,
} from './BlackPianoKey';
import {
  LESSON_BLACK_PIANO_KEY_SHADOWS_LOOK,
  type BlackPianoKeyShadowsLook,
} from './BlackPianoKeyShadows';
import {
  LESSON_PIANO_FRAME_SHADOW_LOOK,
  type PianoFrameShadowLook,
} from './PianoFrameShadow';
import { LESSON_PIANO_KEYBED_LOOK, type PianoKeybedLook } from './PianoKeybed';
import {
  LESSON_PIANO_KEY_LABEL_LOOK,
  type PianoKeyLabelLook,
} from './PianoKeyLabel';
import {
  LESSON_PIANO_KEY_MARKER_LOOK,
  type PianoKeyMarkerLook,
} from './PianoKeyMarker';
import {
  LESSON_WHITE_PIANO_KEY_LOOK,
  type WhitePianoKeyLook,
} from './WhitePianoKey';

export type CorePianoLook = {
  keybed: PianoKeybedLook;
  whiteKey: WhitePianoKeyLook;
  frameShadow: PianoFrameShadowLook;
  marker: PianoKeyMarkerLook;
  blackKeyShadows: BlackPianoKeyShadowsLook;
  blackKey: BlackPianoKeyLook;
  label: PianoKeyLabelLook;
};

/** The lesson screen keyboard. */
export const LESSON_PIANO_LOOK: CorePianoLook = {
  keybed: LESSON_PIANO_KEYBED_LOOK,
  whiteKey: LESSON_WHITE_PIANO_KEY_LOOK,
  frameShadow: LESSON_PIANO_FRAME_SHADOW_LOOK,
  marker: LESSON_PIANO_KEY_MARKER_LOOK,
  blackKeyShadows: LESSON_BLACK_PIANO_KEY_SHADOWS_LOOK,
  blackKey: LESSON_BLACK_PIANO_KEY_LOOK,
  label: LESSON_PIANO_KEY_LABEL_LOOK,
};
