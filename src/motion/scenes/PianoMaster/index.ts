/**
 * @purpose The piano's single source of truth on screen: draws a keyboard of any range (48 keys by default, 88, 108 or any other) with Skia, and owns the key state (which keys are lit, in which role) that lessons and the mic write to on the UI thread.
 */

export { PianoMaster, type PianoMasterProps } from './PianoMaster';
export {
  createKeyLights,
  KeyRole,
  lightKey,
  unlightAllKeys,
  unlightKey,
  usePianoState,
  type PianoKeyLights,
  type PianoState,
} from './pianoState';
export { DEFAULT_ROLE_COLORS, type RoleColors } from './theme';
export {
  LESSON_LOOK,
  type GradientStop,
  type KeyboardLook,
} from './keyboardLook';
export { keyLabels, type KeyLabel, type PianoLabels } from './labels';
export {
  drawBlackLayer,
  drawWhiteLayer,
  pitchOf,
  recordPicture,
} from './drawKeyboard';

// The key model lives in src/shared/piano so audio code can use it too.
// It is re-exported here so screens get everything piano from one place.
export {
  DEFAULT_RANGE,
  PIANO_RANGES,
  type KeyboardProportions,
  type KeyboardRange,
  type NoteInput,
} from '../../../shared/piano';
