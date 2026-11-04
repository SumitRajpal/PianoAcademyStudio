/**
 * @purpose The lesson screen: background, top bar, staff and keyboard laid out exactly as the reference design, full screen in landscape; and the lesson's connection to the note engine, with its diagnostics overlay and the microphone messages.
 */

export {
  EngineDiagnostics,
  type EngineDiagnosticsProps,
} from './EngineDiagnostics';
export {
  ENGINE_DIAGNOSTICS_LOOK,
  type EngineDiagnosticsLook,
} from './engineDiagnosticsLook';
export { LessonScreen, type LessonScreenProps } from './LessonScreen';
export { drawLessonBackground } from './drawLessonBackground';
export {
  DESIGN_SIZE,
  LESSON_DESIGN,
  type RotatedTextRun,
  type TextRun,
} from './lessonDesign';
export { STATUS_MESSAGES } from './micStatusMessages';
