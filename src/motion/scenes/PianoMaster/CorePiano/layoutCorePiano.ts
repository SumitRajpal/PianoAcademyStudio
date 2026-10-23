import {
  layoutKeyboard,
  type KeyboardProportions,
  type KeyRect,
  type PianoKey,
} from '../../../../shared/piano';
import type { Size } from '../shared';

/** Where every key sits, worked out once for all parts of the keyboard. */
export type CorePianoLayout = {
  /** Every key, lowest first. */
  rects: KeyRect[];
  whites: KeyRect[];
  blacks: KeyRect[];
  /** White key pitch: the keyboard width over the number of white keys. */
  pitch: number;
};

/**
 * Lays out `keys` to fill `size`. With `pixelRatio`, every key edge lands on
 * a device pixel. Every list is empty until the size is known.
 */
export function layoutCorePiano(
  keys: readonly PianoKey[],
  size: Size,
  proportions?: Partial<KeyboardProportions>,
  pixelRatio?: number,
): CorePianoLayout {
  const rects = layoutKeyboard(keys, size, proportions, pixelRatio);
  const whites = rects.filter(key => !key.isBlack);
  const blacks = rects.filter(key => key.isBlack);
  const pitch = whites.length > 0 ? size.width / whites.length : 0;
  return { rects, whites, blacks, pitch };
}
