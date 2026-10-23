/**
 * What the calibration says and shows, in plain words: the keyboards to
 * choose from, the keys it will ask for, and for every progress event from
 * the engine the instruction, the key to light and the feedback on the last
 * strike. Pure functions: no React, no engine.
 */

import { noteName, parseNote, PIANO_RANGES } from '../../../../shared/piano';
import {
  CALIBRATION_STATE,
  type CalibrationOptions,
  type CalibrationProgressEvent,
  type PianoProfile,
} from './types';

export type KeyboardChoice = {
  id: '88' | '76' | '61' | '49';
  /** Lowest and highest note names, for CorePiano. */
  from: string;
  to: string;
  lowestMidi: number;
  highestMidi: number;
};

function choice(
  id: KeyboardChoice['id'],
  range: { from: string; to: string },
): KeyboardChoice {
  return {
    id,
    from: range.from,
    to: range.to,
    lowestMidi: parseNote(range.from),
    highestMidi: parseNote(range.to),
  };
}

/** The keyboards the user picks from, biggest first. */
export const KEYBOARD_CHOICES: readonly KeyboardChoice[] = [
  choice('88', PIANO_RANGES.standard88),
  choice('76', PIANO_RANGES.keyboard76),
  choice('61', PIANO_RANGES.keyboard61),
  choice('49', PIANO_RANGES.keyboard49),
];

/** The keyboard the saved calibration was made on, or a full 88-key piano. */
export function keyboardChoiceFor(
  profile?: PianoProfile | null,
): KeyboardChoice {
  const saved = profile?.isCalibrated
    ? KEYBOARD_CHOICES.find(
        k =>
          k.lowestMidi === profile.lowestMidi &&
          k.highestMidi === profile.highestMidi,
      )
    : undefined;
  return saved ?? KEYBOARD_CHOICES[0];
}

/**
 * The keys the engine will ask for, lowest first. Mirrors
 * PianoCalibrator::buildSequence in shared/Calibration.h: C1 to C6 and A4,
 * plus the middle octave when thorough, within the keyboard.
 */
export function calibrationKeys(options: CalibrationOptions): number[] {
  const lo = Math.min(
    108,
    Math.max(21, Math.min(options.lowestMidi, options.highestMidi)),
  );
  const hi = Math.min(
    108,
    Math.max(21, Math.max(options.lowestMidi, options.highestMidi)),
  );
  const keys = new Set<number>();
  const add = (midi: number) => {
    if (midi >= lo && midi <= hi) keys.add(midi);
  };
  [24, 36, 48, 60, 69, 72, 84].forEach(add);
  if (options.fullMode) {
    for (let midi = 61; midi <= 71; midi++) add(midi);
  }
  if (keys.size < 3) {
    add(lo);
    add(hi);
  }
  return [...keys].sort((a, b) => a - b);
}

const OCTAVE_WORDS = [
  '',
  'One octave',
  'Two octaves',
  'Three octaves',
  'Four octaves',
];

/** Where a key is, in words a beginner can follow. */
export function describeKey(midi: number): string {
  if (midi === 60) return 'Middle C';
  if (midi === 69) return 'The A above middle C';
  if (midi % 12 === 0) {
    const octaves = Math.abs(midi - 60) / 12;
    const words = OCTAVE_WORDS[octaves] ?? `${octaves} octaves`;
    return `${words} ${midi < 60 ? 'below' : 'above'} middle C`;
  }
  const steps = midi - 60;
  return steps > 0
    ? `${steps} keys above middle C, counting black keys`
    : `${-steps} keys below middle C, counting black keys`;
}

/** The kind of piano, from how much its strings stretch the overtones. */
export function classifyPianoType(b: number): string {
  if (b < 0.00012) return 'Digital piano';
  if (b < 0.0005) return 'Grand or large upright piano';
  return 'Small upright piano';
}

/** One line about a finished calibration, for the summary. */
export function describeProfile(profile: PianoProfile): string {
  const cents = 1200 * Math.log2(profile.a4ReferenceHz / 440);
  const tuning =
    Math.abs(cents) < 0.5
      ? 'in tune with A = 440 Hz'
      : `tuned ${Math.abs(cents).toFixed(0)} cents ${
          cents > 0 ? 'sharp' : 'flat'
        } (A = ${profile.a4ReferenceHz.toFixed(1)} Hz)`;
  const keys = profile.measuredKeys.length;
  return `${keys} ${
    keys === 1 ? 'key' : 'keys'
  } measured · ${tuning} · ${classifyPianoType(profile.meanInharmonicityB)}`;
}

export type CalibrationFeedback = { tone: 'good' | 'problem'; text: string };

/** A key to light for a moment: the key just measured, or the one played instead. */
export type CalibrationFlash = { midi: number; role: 'correct' | 'wrong' };

/** What the screen shows for one moment of the calibration. */
export type CalibrationPrompt = {
  /** The instruction, large. */
  title: string;
  /** A line under it. */
  detail: string;
  /** How the last strike went, if this moment follows one. */
  feedback: CalibrationFeedback | null;
  /** The key to play now, or -1. */
  target: number;
  flash: CalibrationFlash | null;
  /** How far along, 0 to 1. */
  progress: number;
  /** "Key 3 of 7", or "" before the first key. */
  step: string;
};

function playTitle(midi: number, strike: number): string {
  return strike === 2
    ? `Now play ${noteName(midi)} again, firmly`
    : `Play ${noteName(midi)} softly`;
}

function progressOf(e: CalibrationProgressEvent): number {
  if (e.totalKeys <= 0) return 0;
  const strikesDone =
    e.state === CALIBRATION_STATE.keyDone ? 0 : e.strikeNumber - 1;
  return Math.min(1, (e.keyIndex + strikesDone / 2) / e.totalKeys);
}

/** What to show for the engine's latest calibration event (null: it has not reported yet). */
export function calibrationPrompt(
  event: CalibrationProgressEvent | null,
): CalibrationPrompt {
  if (!event || event.state === CALIBRATION_STATE.measuringNoise) {
    return {
      title: 'Stay quiet for a moment',
      detail: 'Listening to your room…',
      feedback: null,
      target: -1,
      flash: null,
      progress: 0,
      step: '',
    };
  }
  const target = event.currentMidi;
  const base: CalibrationPrompt = {
    title: playTitle(target, event.strikeNumber),
    detail: `${describeKey(target)}. It's lit on the keyboard below.`,
    feedback: null,
    target,
    flash: null,
    progress: progressOf(event),
    step: `Key ${event.keyIndex + 1} of ${event.totalKeys}`,
  };
  const measured = event.measuredMidi;
  switch (event.state) {
    case CALIBRATION_STATE.waitStrike2:
      return {
        ...base,
        feedback: { tone: 'good', text: 'Got it.' },
        flash: measured >= 0 ? { midi: measured, role: 'correct' } : null,
      };
    case CALIBRATION_STATE.keyDone:
      return {
        ...base,
        feedback:
          measured >= 0
            ? { tone: 'good', text: `${noteName(measured)} measured.` }
            : null,
        flash: measured >= 0 ? { midi: measured, role: 'correct' } : null,
      };
    case CALIBRATION_STATE.wrongKey:
      return {
        ...base,
        feedback: {
          tone: 'problem',
          text:
            event.detectedMidi >= 0
              ? `That was ${noteName(event.detectedMidi)}. Play ${noteName(
                  target,
                )}.`
              : `That wasn't ${noteName(target)}.`,
        },
        flash:
          event.detectedMidi >= 0 && event.detectedMidi !== target
            ? { midi: event.detectedMidi, role: 'wrong' }
            : null,
      };
    case CALIBRATION_STATE.notPiano:
      return {
        ...base,
        feedback: {
          tone: 'problem',
          text: "That didn't sound like a piano key.",
        },
      };
    case CALIBRATION_STATE.tooShort:
      return {
        ...base,
        feedback: {
          tone: 'problem',
          text: 'Hold the key down a little longer.',
        },
      };
    case CALIBRATION_STATE.allDone:
      return {
        title: 'Your piano is calibrated',
        detail: '',
        feedback: null,
        target: -1,
        flash: measured >= 0 ? { midi: measured, role: 'correct' } : null,
        progress: 1,
        step: 'Done',
      };
    default:
      return base;
  }
}
