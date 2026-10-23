/** Colours of the night sky behind the forest. */
export const NIGHT_SKY_LOOK = {
  /** Top to horizon. */
  gradient: ['#060d1c', '#0b1830', '#123049', '#1a4352'],
  gradientAt: [0, 0.35, 0.7, 1],
  /** The soft teal haze that rises behind the egg. */
  haze: '#3f8f8c',
  hazeAlpha: 0.32,
  /** A faint violet wash high up. */
  wash: '#5a3f86',
  washAlpha: 0.16,
};

export type NightSkyLook = typeof NIGHT_SKY_LOOK;
