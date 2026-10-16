/**
 * @purpose What more than one part of PianoMaster uses: the key state (which keys are lit, in which role), the lit-key colours, the key shape, gradients, paint helpers, picture recording and the look units; and for the music symbols, SMuFL glyph drawing, staff line positions and the notation ink.
 */

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
export {
  DEFAULT_ROLE_COLORS,
  roleColors,
  type RoleColors,
} from './keyRoleColors';
export { clipToBox, pianoKeyShape, type Box } from './pianoKeyShape';
export { setLinearGradient, type GradientStop } from './linearGradient';
export { fillPaint, fillRect } from './paint';
export { recordPicture, type Size } from './recordPicture';
export { pt, REFERENCE_PITCH } from './pianoLookUnits';
export {
  drawMusicGlyph,
  type GlyphFit,
  type MusicFont,
  type NotationTypefaces,
} from './musicGlyph';
export { staffLineY, type StaffPosition } from './staffPosition';
export { LESSON_NOTATION_INK } from './notationInk';
