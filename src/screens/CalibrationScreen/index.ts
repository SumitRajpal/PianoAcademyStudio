/**
 * @purpose The calibration screen shown at every launch: the lesson's layout with the questions on its white paper and the user's keyboard below, lighting the key to play and checking each strike; Save goes on to the lesson.
 */

export {
  CalibrationScreen,
  type CalibrationScreenProps,
} from './CalibrationScreen';
export {
  CALIBRATION_DESIGN,
  calloutPlacement,
  choiceBox,
  type CalibrationText,
  type DesignBox,
} from './calibrationDesign';
export {
  calibrationView,
  type CalibrationChoice,
  type CalibrationStep,
  type CalibrationView,
  type CalibrationViewInput,
} from './calibrationView';
export {
  drawCalibrationBackground,
  type CalibrationBackdrop,
} from './drawCalibrationBackground';
