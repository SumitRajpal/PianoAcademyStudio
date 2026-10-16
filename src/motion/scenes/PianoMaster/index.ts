/**
 * @purpose The piano's single source of truth on screen, in two parts: CorePiano (the keyboard, any range: 48 keys by default, 88, 108 or any other) and CoreNotes (the sheet music above it). Also owns the key state (which keys are lit, in which role) that lessons and the mic write to on the UI thread.
 */

export {
  CorePiano,
  LESSON_PIANO_LOOK,
  type CorePianoLook,
  type CorePianoProps,
  type PianoKeyLabels,
} from './CorePiano'; // Its drawing functions, for headless rendering, come from ./CorePiano.
export {
  beatX,
  diatonicStep,
  drawCoreNotesNoteLayer,
  drawCoreNotesStaffLayer,
  drawPlayhead,
  ledgerLines,
  LESSON_NOTES_LOOK,
  QuarterNotes,
  trebleY,
  useNotationTypefaces,
  type CoreNotesLook,
  type NoteState,
  type PlayheadPosition,
  type QuarterNotesProps,
  type Score,
  type ScoreItem,
  type StaffLayout,
} from './CoreNotes'; // Each music symbol, to reuse on its own, comes from ./CoreNotes/symbols.
export {
  createKeyLights,
  DEFAULT_ROLE_COLORS,
  KeyRole,
  lightKey,
  recordPicture,
  unlightAllKeys,
  unlightKey,
  usePianoState,
  type GlyphFit,
  type GradientStop,
  type MusicFont,
  type NotationTypefaces,
  type PianoKeyLights,
  type PianoState,
  type RoleColors,
} from './shared';

// The key model lives in src/shared/piano so audio code can use it too.
// It is re-exported here so screens get everything piano from one place.
export {
  DEFAULT_RANGE,
  PIANO_RANGES,
  type KeyboardProportions,
  type KeyboardRange,
  type NoteInput,
} from '../../../shared/piano';
