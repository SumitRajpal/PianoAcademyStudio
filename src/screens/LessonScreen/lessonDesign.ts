/**
 * The lesson screen, in points on its design canvas: an iPhone 15 Plus in
 * landscape, 932 x 430. Every value was measured from the reference screen.
 * On other phones the canvas scales with the screen width.
 */

import type {
  GradientStop,
  Playhead,
  Score,
  StaffLayout,
} from '../../motion/scenes/PianoMaster';
import { DEFAULT_RANGE, type NoteInput } from '../../shared/piano';

export const DESIGN_SIZE = { width: 932, height: 430 };

/** A line of text, placed by its baseline and one horizontal edge or centre. */
export type TextRun = {
  text: string;
  /** "rounded" is SF Pro Rounded; "system" is SF Pro, the default iOS font. */
  font: 'rounded' | 'system';
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  x: number;
  baseline: number;
};

/** A line of text turned by `rotate` degrees, placed by its centre. */
export type RotatedTextRun = Omit<TextRun, 'align' | 'x' | 'baseline'> & {
  centerX: number;
  centerY: number;
  rotate: number;
};

/** The keyboard's top edge; the background gradient ends here. */
const KEYBOARD_TOP = 862 / 3;

export const LESSON_DESIGN = {
  background: {
    end: KEYBOARD_TOP,
    stops: [
      [0, '#3E427F'],
      [100 / KEYBOARD_TOP, '#8187FB'],
      [1, '#8D93FF'],
    ] as readonly GradientStop[],
  },
  pause: {
    centerX: 110.5 / 3,
    centerY: 98.5 / 3,
    radius: 19,
    fill: 'rgba(0, 0, 0, 0.2)',
    bars: { left: [30, 39], top: 23, width: 5, height: 20, color: '#FFFFFF' },
  },
  progress: {
    x: 71,
    y: 137 / 3,
    width: 790,
    height: 6,
    value: 605 / 2370,
    track: 'rgba(0, 0, 0, 0.25)',
    fill: '#FFFFFF',
  },
  title: {
    text: 'Five Notes - Exercise',
    font: 'rounded',
    size: 17,
    color: '#FFFFFF',
    align: 'center',
    x: 1399 / 3,
    baseline: 94 / 3,
  } satisfies TextRun,
  timer: {
    text: '30:55',
    font: 'system',
    size: 15,
    color: '#FFFFFF',
    align: 'right',
    x: 2742 / 3,
    baseline: 115 / 3,
  } satisfies TextRun,
  measureNumber: {
    text: '5',
    font: 'rounded',
    size: 13.5,
    color: '#000000',
    align: 'left',
    x: 2743.5 / 3,
    baseline: 307 / 3,
  } satisfies TextRun,
  hand: {
    text: 'RIGHT HAND',
    font: 'rounded',
    size: 10.75,
    color: 'rgba(0, 0, 0, 0.27)',
    centerX: 164 / 3,
    centerY: 502 / 3,
    rotate: -90,
  } satisfies RotatedTextRun,
  staff: {
    top: 382.5 / 3,
    left: 70,
    right: 1000,
    measureStarts: [299.22 / 3, 1104.07 / 3, 1908.91 / 3, 2713.76 / 3],
    barlines: [1104.07 / 3, 1908.91 / 3, 2713.76 / 3],
    firstBeat: 79 / 3,
    beat: 67,
    restOffset: 36.1 / 3,
    clef: { x: 244.5 / 3 },
    timeSignature: { x: 446.79 / 3, beats: 4 },
  } satisfies StaffLayout,
  score: {
    items: [
      {
        kind: 'note',
        pitch: 'G4',
        measure: 0,
        beat: 2,
        beats: 1,
        state: 'attention',
      },
      { kind: 'rest', measure: 0, beat: 3, beats: 1 },
      { kind: 'note', pitch: 'C4', measure: 1, beat: 0, beats: 1 },
      { kind: 'note', pitch: 'D4', measure: 1, beat: 1, beats: 1 },
      { kind: 'note', pitch: 'E4', measure: 1, beat: 2, beats: 1 },
      { kind: 'note', pitch: 'F4', measure: 1, beat: 3, beats: 1 },
      { kind: 'note', pitch: 'G4', measure: 2, beat: 0, beats: 1 },
      { kind: 'rest', measure: 2, beat: 1, beats: 1 },
      { kind: 'rest', measure: 2, beat: 2, beats: 1 },
      { kind: 'rest', measure: 2, beat: 3, beats: 1 },
      { kind: 'note', pitch: 'G4', measure: 3, beat: 0, beats: 1 },
    ],
  } satisfies Score,
  playhead: { x: 1148 / 3, top: 67, bottom: 803.5 / 3 } satisfies Playhead,
  keyboard: {
    top: KEYBOARD_TOP,
    height: 365 / 3,
    range: DEFAULT_RANGE,
    labels: ['C4', 'D4', 'E4', 'F4', 'G4'] as readonly NoteInput[],
    markers: ['C4'] as readonly NoteInput[],
  },
  /** Fills the home indicator area under the keyboard. */
  bottomStrip: '#323232',
};
