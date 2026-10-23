/**
 * The calibration screen, in points on the lesson screen's design canvas
 * (932 x 430, an iPhone 15 Plus in landscape), scaled to the screen width.
 * It keeps the lesson's background, top bar and keyboard; the white paper
 * where the lesson prints its staff holds the calibration's questions.
 */

import type { GradientStop } from '../../motion/scenes/PianoMaster';
import { LESSON_DESIGN, type TextRun } from '../LessonScreen';

/** A box on the design canvas. */
export type DesignBox = { x: number; y: number; width: number; height: number };

/** A line of text placed like a TextRun, with its weight. */
export type CalibrationText = Omit<TextRun, 'text'> & {
  weight: '400' | '600' | '700';
};

const INK = '#1C1C1E';
const MUTED = '#6E6E73';
const ACCENT = '#5F64E8';

/** Left edge of everything written on the paper. */
const MARGIN = 98;

export const CALIBRATION_DESIGN = {
  background: {
    end: LESSON_DESIGN.background.end,
    stops: LESSON_DESIGN.background.stops as readonly GradientStop[],
  },
  bottomStrip: LESSON_DESIGN.bottomStrip,
  title: { ...LESSON_DESIGN.title, weight: '700' } satisfies CalibrationText,
  /** Top right, where the lesson shows its timer: whether the mic is on. */
  listening: {
    ...LESSON_DESIGN.timer,
    font: 'rounded',
    size: 13,
    weight: '600',
  } satisfies CalibrationText,
  listeningDot: { radius: 4, gap: 6, on: '#7CF2A7', off: '#FFB4B4' },
  progress: LESSON_DESIGN.progress,
  /** The white paper, like the lesson's staff paper: it runs off the right edge. */
  paper: {
    box: { x: 70, y: 72, width: 930, height: 176 } satisfies DesignBox,
    color: '#FFFFFF',
    shadow: { sigma: 15, color: 'rgba(0, 0, 0, 0.19)' },
  },
  /** "STEP 1 OF 3" */
  eyebrow: {
    font: 'rounded',
    size: 12,
    color: '#8E8E93',
    align: 'left',
    x: MARGIN,
    baseline: 98,
    weight: '700',
  } satisfies CalibrationText,
  eyebrowSpacing: 0.8,
  /** "Back" or "Start over", across from the eyebrow. */
  link: {
    font: 'rounded',
    size: 15,
    color: ACCENT,
    align: 'right',
    x: 932 - MARGIN,
    baseline: 98,
    weight: '600',
  } satisfies CalibrationText,
  question: {
    font: 'rounded',
    size: 28,
    color: INK,
    align: 'left',
    x: MARGIN,
    baseline: 134,
    weight: '700',
  } satisfies CalibrationText,
  detail: {
    font: 'rounded',
    size: 16,
    color: MUTED,
    align: 'left',
    x: MARGIN,
    baseline: 160,
    weight: '400',
  } satisfies CalibrationText,
  /** How the last strike went, while listening (where the choices are otherwise). */
  feedback: {
    font: 'rounded',
    size: 18,
    color: '#1F9D55',
    align: 'left',
    x: MARGIN,
    baseline: 204,
    weight: '700',
  } satisfies CalibrationText,
  feedbackProblem: '#D93F49',
  /** When saving fails: beside the Save button. */
  saveFeedback: {
    font: 'rounded',
    size: 16,
    color: '#D93F49',
    align: 'left',
    x: MARGIN + 160 + 20,
    baseline: 212,
    weight: '600',
  } satisfies CalibrationText,
  /** How long the key just measured, or the wrong key, stays green or red (ms). */
  feedbackFlashMs: 700,
  /** Answers: a row of buttons, each a label over a caption. */
  choices: {
    x: MARGIN,
    y: 180,
    height: 52,
    gap: 12,
    radius: 14,
    keyboardWidth: 136,
    modeWidth: 236,
    saveWidth: 160,
    fill: '#F2F2F7',
    chosenFill: ACCENT,
    label: { size: 17, color: INK, chosenColor: '#FFFFFF' },
    caption: {
      size: 12,
      color: MUTED,
      chosenColor: 'rgba(255, 255, 255, 0.82)',
    },
  },
  /** The note name over the key to play, pointing down at it. */
  callout: {
    width: 44,
    height: 22,
    radius: 6,
    pointer: { width: 10, height: 5 },
    /** Between the pointer's tip and the keys. */
    gap: 1,
    color: '#3E427F',
    text: { size: 13, color: '#FFFFFF' },
  },
  keyboard: {
    top: LESSON_DESIGN.keyboard.top,
    height: LESSON_DESIGN.keyboard.height,
  },
};

/** The box of choice `index` in a row of buttons `width` wide. */
export function choiceBox(index: number, width: number): DesignBox {
  const { x, y, height, gap } = CALIBRATION_DESIGN.choices;
  return { x: x + index * (width + gap), y, width, height };
}

/**
 * The callout over a key centred at `keyCenterX`, kept on screen: its box,
 * and the pointer's tip (which always points at the key).
 */
export function calloutPlacement(
  keyCenterX: number,
  screenWidth: number = 932,
) {
  const { width, height, pointer, gap } = CALIBRATION_DESIGN.callout;
  const tipY = CALIBRATION_DESIGN.keyboard.top - gap;
  const boxBottom = tipY - pointer.height;
  const x = Math.min(
    screenWidth - width - 2,
    Math.max(2, keyCenterX - width / 2),
  );
  return {
    box: { x, y: boxBottom - height, width, height } satisfies DesignBox,
    tip: { x: keyCenterX, y: tipY },
  };
}
