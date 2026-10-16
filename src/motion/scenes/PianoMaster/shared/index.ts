/**
 * @purpose What more than one part of PianoMaster uses: the key state (which keys are lit, in which role), the lit-key colours, the key shape, gradients, picture recording and the look units.
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
export { recordPicture, type Size } from './recordPicture';
export { pt, REFERENCE_PITCH } from './pianoLookUnits';
