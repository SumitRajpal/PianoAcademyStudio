/**
 * Keyboards of any size, and where each key sits on screen.
 *
 * A keyboard is declared by its lowest and highest note, so 25, 88 or 108 keys
 * are all the same code path. Positions are computed for any width and height.
 */

import {
  isBlackKey,
  noteName,
  parseNote,
  pitchClass,
  type NoteInput,
} from './notes';

export type KeyboardRange = { from: NoteInput; to: NoteInput };

/** Common keyboard sizes, declared by their lowest and highest notes. */
export const PIANO_RANGES = {
  /** Extended concert grand (Stuart & Sons): 108 keys. */
  extended108: { from: 'C0', to: 'B8' },
  /** Standard acoustic piano: 88 keys. */
  standard88: { from: 'A0', to: 'C8' },
  keyboard76: { from: 'E1', to: 'G7' },
  keyboard61: { from: 'C2', to: 'C7' },
  keyboard49: { from: 'C2', to: 'C6' },
  /** Four octaves, C2 to B5: the lesson keyboard. */
  keyboard48: { from: 'C2', to: 'B5' },
  /** Two octaves around middle C. */
  keyboard25: { from: 'C3', to: 'C5' },
} as const satisfies Record<string, KeyboardRange>;

/** The keyboard shown when no range is given. */
export const DEFAULT_RANGE: KeyboardRange = PIANO_RANGES.keyboard48;

export type PianoKey = {
  midi: number;
  /** Name with sharps, for example "C#4". */
  name: string;
  isBlack: boolean;
  /**
   * Index among the white keys of this keyboard. For a black key, the index
   * of the white key just below it.
   */
  whiteIndex: number;
};

/**
 * The keys from `from` to `to`, lowest first.
 * A keyboard always starts and ends on a white key: a range that starts or
 * ends on a black key is widened by one semitone at that end.
 */
export function buildKeyboard(range: KeyboardRange): PianoKey[] {
  let low = parseNote(range.from);
  let high = parseNote(range.to);
  if (low > high) {
    throw new RangeError(
      `Keyboard range is reversed: ${range.from} is above ${range.to}`,
    );
  }
  // Black keys are never next to each other, and C-1 (0) and G9 (127) are
  // white, so widening by one semitone always lands on a white key in range.
  if (isBlackKey(low)) {
    low -= 1;
  }
  if (isBlackKey(high)) {
    high += 1;
  }

  const keys: PianoKey[] = [];
  let whiteIndex = -1;
  for (let midi = low; midi <= high; midi++) {
    const isBlack = isBlackKey(midi);
    if (!isBlack) {
      whiteIndex += 1;
    }
    keys.push({ midi, name: noteName(midi), isBlack, whiteIndex });
  }
  return keys;
}

/** Where black keys sit between their white keys. */
export type BlackKeyPlacement = 'centered' | 'realistic';

/**
 * The shape of a keyboard. Widths are shares of the white key pitch (the
 * keyboard width divided by the number of white keys) and lengths are shares
 * of the keyboard height, so a keyboard keeps its look at any size and range.
 */
export type KeyboardProportions = {
  /** Width of a black key, as a share of the white key pitch. */
  blackWidth: number;
  /** Length of a black key, as a share of the keyboard height. */
  blackHeight: number;
  /** Gap between neighbouring white keys, as a share of the white key pitch. */
  gap: number;
  /** Frame above and below the white keys, as a share of the white key pitch. */
  frame: number;
  /**
   * "centered" puts every black key on the line between its white keys.
   * "realistic" offsets them the way a real piano does.
   */
  blackKeyPlacement: BlackKeyPlacement;
};

/**
 * The lesson keyboard design, measured from the reference screen
 * (iPhone 15 Plus, 28 white keys across 932 points).
 */
export const DEFAULT_PROPORTIONS: KeyboardProportions = {
  blackWidth: 0.5608,
  blackHeight: 0.574,
  gap: 0.0713,
  frame: 0.0481,
  blackKeyPlacement: 'centered',
};

/**
 * Where the centre of each black key sits, measured from the line between
 * the two white keys around it, as a share of a white key's width.
 * At the back of a real keyboard the keys are evenly spaced: C to E splits
 * into 5 equal parts and F to B into 7, so the black keys are off-centre.
 */
const BLACK_KEY_OFFSETS: Record<number, number> = {
  1: -1 / 10, // C#
  3: 1 / 10, // D#
  6: -1 / 7, // F#
  8: 0, // G#
  10: 1 / 7, // A#
};

export type KeyRect = PianoKey & {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Number of white keys in a list of keys. */
export function countWhiteKeys(keys: readonly PianoKey[]): number {
  return keys.reduce((count, key) => (key.isBlack ? count : count + 1), 0);
}

/**
 * Positions of every key when the keyboard fills `size`.
 * White keys share the width equally, inside a frame at the top and bottom;
 * black keys start at the top edge and sit on top of them.
 * With `pixelRatio`, every edge lands on a device pixel, so keys stay sharp.
 * Returns an empty list until the size is known.
 */
export function layoutKeyboard(
  keys: readonly PianoKey[],
  size: { width: number; height: number },
  proportions: Partial<KeyboardProportions> = {},
  pixelRatio?: number,
): KeyRect[] {
  const rects = layoutUnsnapped(keys, size, proportions);
  if (!pixelRatio) {
    return rects;
  }
  const snap = (value: number) => Math.round(value * pixelRatio) / pixelRatio;
  return rects.map(rect => {
    const x = snap(rect.x);
    const y = snap(rect.y);
    return {
      ...rect,
      x,
      y,
      width: snap(rect.x + rect.width) - x,
      height: snap(rect.y + rect.height) - y,
    };
  });
}

function layoutUnsnapped(
  keys: readonly PianoKey[],
  size: { width: number; height: number },
  proportions: Partial<KeyboardProportions>,
): KeyRect[] {
  const { blackWidth, blackHeight, gap, frame, blackKeyPlacement } = {
    ...DEFAULT_PROPORTIONS,
    ...proportions,
  };
  const whiteCount = countWhiteKeys(keys);
  if (whiteCount === 0 || size.width <= 0 || size.height <= 0) {
    return [];
  }
  const pitch = size.width / whiteCount;
  const gapWidth = pitch * gap;
  const frameHeight = pitch * frame;
  const blackKeyWidth = pitch * blackWidth;
  const blackKeyHeight = size.height * blackHeight;

  return keys.map(key => {
    if (!key.isBlack) {
      return {
        ...key,
        x: key.whiteIndex * pitch + gapWidth / 2,
        y: frameHeight,
        width: Math.max(0, pitch - gapWidth),
        height: Math.max(0, size.height - 2 * frameHeight),
      };
    }
    const boundary = (key.whiteIndex + 1) * pitch;
    const offset =
      blackKeyPlacement === 'realistic'
        ? BLACK_KEY_OFFSETS[pitchClass(key.midi)] * pitch
        : 0;
    return {
      ...key,
      x: boundary + offset - blackKeyWidth / 2,
      y: 0,
      width: blackKeyWidth,
      height: blackKeyHeight,
    };
  });
}
