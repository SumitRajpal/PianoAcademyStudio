import type { GradientStop } from '../../shared';

/**
 * Shadow under the keyboard frame, across the top of the white keys.
 * `height` is a share of the keyboard height.
 */
export type PianoFrameShadowLook = {
  height: number;
  stops: readonly GradientStop[];
};

export const LESSON_PIANO_FRAME_SHADOW_LOOK: PianoFrameShadowLook = {
  height: 15.23 / 121.667,
  stops: [
    [0, 'rgba(0, 0, 0, 0.5)'],
    [0.07, 'rgba(0, 0, 0, 0.451)'],
    [0.158, 'rgba(0, 0, 0, 0.38)'],
    [0.245, 'rgba(0, 0, 0, 0.337)'],
    [0.376, 'rgba(0, 0, 0, 0.278)'],
    [0.551, 'rgba(0, 0, 0, 0.2)'],
    [0.726, 'rgba(0, 0, 0, 0.122)'],
    [0.902, 'rgba(0, 0, 0, 0.043)'],
    [1, 'rgba(0, 0, 0, 0)'],
  ],
};
