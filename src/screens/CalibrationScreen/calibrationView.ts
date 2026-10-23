/**
 * Everything the calibration screen shows at one moment, worked out from the
 * step the user is on and the engine's latest report. Pure, so the app and
 * the design render show exactly the same thing.
 */

import {
  CALIBRATION_STATE,
  calibrationKeys,
  calibrationPrompt,
  describeProfile,
  KEYBOARD_CHOICES,
  STATUS_MESSAGES,
  type CalibrationFeedback,
  type CalibrationFlash,
  type CalibrationProgressEvent,
  type EngineStatus,
  type KeyboardChoice,
  type PianoProfile,
} from '../../motion/scenes/PianoMaster';
import { CALIBRATION_DESIGN } from './calibrationDesign';

/** 1: how many keys; 2: quick or thorough; 3: playing the keys (then saving). */
export type CalibrationStep = 'keyboard' | 'thoroughness' | 'listening';

export type CalibrationChoice = {
  id: string;
  label: string;
  caption: string;
  /** Shown as the current answer. */
  chosen: boolean;
};

export type CalibrationView = {
  eyebrow: string;
  link: { id: 'back' | 'startOver'; text: string } | null;
  question: string;
  detail: string;
  feedback: CalibrationFeedback | null;
  choices: CalibrationChoice[];
  choiceWidth: number;
  /** The key to play now, or -1. */
  target: number;
  flash: CalibrationFlash | null;
  progress: number;
  /** Calibrated: the screen offers Save. */
  finished: boolean;
  /** Top right: whether the mic hears the piano. */
  listening: { on: boolean; text: string };
};

export type CalibrationViewInput = {
  step: CalibrationStep;
  keyboard: KeyboardChoice;
  event: CalibrationProgressEvent | null;
  profile: PianoProfile | null;
  status: EngineStatus;
  saveFailed: boolean;
};

const LISTENING_TEXT: Record<EngineStatus['state'], string> = {
  running: 'Listening',
  stopped: 'Not listening',
  permissionPending: 'Waiting for the microphone',
  permissionDenied: 'Microphone off',
  interrupted: 'Paused',
  error: 'Microphone error',
};

function keysText(count: number): string {
  return `${count} ${count === 1 ? 'key' : 'keys'}`;
}

export function calibrationView({
  step,
  keyboard,
  event,
  profile,
  status,
  saveFailed,
}: CalibrationViewInput): CalibrationView {
  const design = CALIBRATION_DESIGN.choices;
  const micProblem = STATUS_MESSAGES[status.state]
    ? status.message || STATUS_MESSAGES[status.state]!
    : null;
  const listening = {
    on: status.state === 'running',
    text: LISTENING_TEXT[status.state],
  };
  const quiet = {
    feedback: null,
    target: -1,
    flash: null,
    finished: false,
    listening,
  };

  if (step === 'keyboard') {
    return {
      ...quiet,
      eyebrow: 'STEP 1 OF 3',
      link: null,
      question: 'How many keys does your piano have?',
      detail:
        micProblem ?? 'Pick the closest. The keyboard below changes to match.',
      choices: KEYBOARD_CHOICES.map(k => ({
        id: k.id,
        label: `${k.id} keys`,
        caption: `${k.from} – ${k.to}`,
        chosen: k.id === keyboard.id,
      })),
      choiceWidth: design.keyboardWidth,
      progress: 0,
    };
  }

  if (step === 'thoroughness') {
    const range = {
      lowestMidi: keyboard.lowestMidi,
      highestMidi: keyboard.highestMidi,
    };
    const quick = calibrationKeys({ ...range, fullMode: false }).length;
    const thorough = calibrationKeys({ ...range, fullMode: true }).length;
    return {
      ...quiet,
      eyebrow: 'STEP 2 OF 3',
      link: { id: 'back', text: 'Back' },
      question: 'Quick check or thorough?',
      detail: micProblem ?? "You'll play each key twice: softly, then firmly.",
      choices: [
        {
          id: 'quick',
          label: 'Quick',
          caption: `${keysText(quick)} · about a minute`,
          chosen: true,
        },
        {
          id: 'thorough',
          label: 'Thorough',
          caption: `${keysText(thorough)} · about 2 minutes`,
          chosen: false,
        },
      ],
      choiceWidth: design.modeWidth,
      progress: 0,
    };
  }

  if (event?.state === CALIBRATION_STATE.allDone) {
    const prompt = calibrationPrompt(event);
    return {
      eyebrow: 'DONE',
      link: { id: 'startOver', text: 'Start over' },
      question: prompt.title,
      detail: profile?.isCalibrated ? describeProfile(profile) : '',
      feedback: saveFailed
        ? { tone: 'problem', text: "Couldn't save. Try again." }
        : null,
      choices: [{ id: 'save', label: 'Save', caption: '', chosen: true }],
      choiceWidth: design.saveWidth,
      target: -1,
      flash: prompt.flash,
      progress: 1,
      finished: true,
      listening,
    };
  }

  const prompt = calibrationPrompt(event);
  return {
    eyebrow: prompt.step
      ? `STEP 3 OF 3 · ${prompt.step.toUpperCase()}`
      : 'STEP 3 OF 3',
    link: { id: 'startOver', text: 'Start over' },
    question: prompt.title,
    detail: micProblem ?? prompt.detail,
    feedback: prompt.feedback,
    choices: [],
    choiceWidth: 0,
    target: prompt.target,
    flash: prompt.flash,
    progress: prompt.progress,
    finished: false,
    listening,
  };
}
