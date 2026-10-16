import { pt } from '../../shared';

/**
 * A dot under a marked key, such as middle C. Sizes are shares of the white
 * key pitch; `bottom` is from the key bottom to the dot centre.
 */
export type PianoKeyMarkerLook = {
  color: string;
  radius: number;
  bottom: number;
};

export const LESSON_PIANO_KEY_MARKER_LOOK: PianoKeyMarkerLook = {
  color: '#7F7F7F',
  radius: pt(3),
  bottom: pt(31.7 / 3),
};
