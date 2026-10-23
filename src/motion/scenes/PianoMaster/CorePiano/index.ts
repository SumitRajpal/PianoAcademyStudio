/**
 * @purpose The piano keyboard at the bottom of PianoMaster: draws any range with Skia from one WhitePianoKey and one BlackPianoKey reused at every position, with the keybed, shadows, marker dots, note names and lit keys.
 */

export { CorePiano, type CorePianoProps } from './CorePiano';
export { LESSON_PIANO_LOOK, type CorePianoLook } from './corePianoLook';
export { layoutCorePiano, type CorePianoLayout } from './layoutCorePiano';
export {
  drawCorePianoBlackLayer,
  drawCorePianoWhiteLayer,
} from './drawCorePiano';
export {
  drawPianoKeyLights,
  makePianoKeyLights,
  type DrawPianoKeyLight,
  type MakePianoKeyLight,
  type PianoKeyLightLayer,
  type PianoKeyLightSource,
} from './usePianoKeyLights';
export {
  drawWhitePianoKeyLight,
  makeWhitePianoKeyLight,
  type WhitePianoKeyLight,
  type WhitePianoKeyLook,
} from './WhitePianoKey';
export {
  drawBlackPianoKeyLight,
  makeBlackPianoKeyLight,
  type BlackPianoKeyLight,
  type BlackPianoKeyLook,
} from './BlackPianoKey';
export type { BlackPianoKeyShadowsLook } from './BlackPianoKeyShadows';
export type { PianoFrameShadowLook } from './PianoFrameShadow';
export type { PianoKeybedLook } from './PianoKeybed';
export type { PianoKeyMarkerLook } from './PianoKeyMarker';
export {
  layoutPianoKeyLabels,
  type PianoKeyLabelLayout,
  type PianoKeyLabelLook,
  type PianoKeyLabels,
} from './PianoKeyLabel';
