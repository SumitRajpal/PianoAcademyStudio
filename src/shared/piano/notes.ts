/**
 * Note names, MIDI note numbers and frequencies.
 *
 * MIDI numbering follows scientific pitch notation: middle C is C4 = 60,
 * the lowest MIDI note is C-1 = 0 and the highest is G9 = 127.
 */

/** A note given as a MIDI number (60) or a name ("C4", "C#4", "Db4"). */
export type NoteInput = number | string;

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

/** MIDI number of middle C. */
export const MIDDLE_C = 60;

/** Concert pitch: A4 (MIDI 69) is tuned to this frequency, in hertz. */
export const A4_FREQUENCY = 440;
const A4_MIDI = 69;

const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_PITCH_CLASS = [0, 2, 4, 5, 7, 9, 11];
const SHARP_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];
const BLACK_PITCH_CLASSES = [
  false,
  true,
  false,
  true,
  false,
  false,
  true,
  false,
  true,
  false,
  true,
  false,
];

const NOTE_PATTERN = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/;

/** Position of a note within its octave: C = 0 … B = 11. */
export function pitchClass(midi: number): number {
  'worklet';
  return ((midi % 12) + 12) % 12;
}

/** Octave number in scientific pitch notation (middle C is in octave 4). */
export function octaveOf(midi: number): number {
  'worklet';
  return Math.floor(midi / 12) - 1;
}

export function isBlackKey(midi: number): boolean {
  'worklet';
  return BLACK_PITCH_CLASSES[pitchClass(midi)];
}

/** Name of a note with sharps, for example 61 → "C#4". */
export function noteName(midi: number): string {
  'worklet';
  return `${SHARP_NAMES[pitchClass(midi)]}${octaveOf(midi)}`;
}

/** The note's letter without accidental or octave, for example 61 → "C". */
export function noteLetter(midi: number): string {
  'worklet';
  return SHARP_NAMES[pitchClass(midi)].charAt(0);
}

/**
 * Turns a note name or MIDI number into a MIDI number.
 * Accepts sharps (`#`, `♯`) and flats (`b`, `♭`) and negative octaves ("C-1").
 * Throws a RangeError for anything that is not a note between C-1 and G9.
 */
export function parseNote(note: NoteInput): number {
  if (typeof note === 'number') {
    if (!Number.isInteger(note) || note < MIDI_MIN || note > MIDI_MAX) {
      throw new RangeError(
        `MIDI note must be a whole number from ${MIDI_MIN} to ${MIDI_MAX}, got ${note}`,
      );
    }
    return note;
  }
  const match = NOTE_PATTERN.exec(note.trim());
  if (!match) {
    throw new RangeError(
      `Not a note name: "${note}". Use a letter, an optional # or b, and an octave, such as "C#4".`,
    );
  }
  const [, letter, accidental, octave] = match;
  const letterIndex = NOTE_LETTERS.indexOf(
    letter.toUpperCase() as (typeof NOTE_LETTERS)[number],
  );
  const shift =
    accidental === '#' || accidental === '♯'
      ? 1
      : accidental === 'b' || accidental === '♭'
      ? -1
      : 0;
  const midi =
    (Number(octave) + 1) * 12 + LETTER_PITCH_CLASS[letterIndex] + shift;
  if (midi < MIDI_MIN || midi > MIDI_MAX) {
    throw new RangeError(`"${note}" is outside the MIDI range C-1 to G9`);
  }
  return midi;
}

/** Frequency of a note in hertz, in equal temperament. */
export function frequencyOf(midi: number, a4: number = A4_FREQUENCY): number {
  'worklet';
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** The note closest to a frequency, for example 440 Hz → 69 (A4). */
export function nearestNote(
  frequency: number,
  a4: number = A4_FREQUENCY,
): number {
  'worklet';
  return Math.round(A4_MIDI + 12 * Math.log2(frequency / a4));
}
