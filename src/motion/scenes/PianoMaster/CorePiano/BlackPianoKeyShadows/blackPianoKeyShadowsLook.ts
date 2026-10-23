import { pt } from '../../shared';

/**
 * The shadow each black key casts on the white keys, blurred more downwards
 * than sideways. Sizes are shares of the white key pitch.
 */
export type BlackPianoKeyShadowsLook = {
  dy: number;
  sigmaX: number;
  sigmaY: number;
  color: string;
};

export const LESSON_BLACK_PIANO_KEY_SHADOWS_LOOK: BlackPianoKeyShadowsLook = {
  dy: pt(4.47),
  sigmaX: pt(8.5 / 3),
  sigmaY: pt(4.47),
  color: 'rgba(0, 0, 0, 0.5)',
};
