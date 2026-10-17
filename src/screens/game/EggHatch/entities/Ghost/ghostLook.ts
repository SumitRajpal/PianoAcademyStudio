/** Colours of the friendly note ghosts. */
export const GHOST_LOOK = {
  body: ['#ffffff', '#fff6e2', '#f1dfbd'],
  /** Shading for the rounded, lit-from-top-left look. */
  shade: '#c9b48e',
  shadeAlpha: 0.55,
  rim: '#ffd98a',
  rimAlpha: 0.55,
  highlight: '#ffffff',
  /** The soft shadow a ghost casts on the ground below it. */
  groundShadow: '#020608',
  groundShadowAlpha: 0.6,
  /** The glow around the ghost that strikes next. */
  halo: '#ffd77a',
  glow: '#fff1c2',
  glowAlpha: 0.42,
  eye: '#2a1c16',
  blush: '#f59aa0',
  letter: '#7a3b2c',
  letterBadge: '#ffe3a6',
  /** The puff of sparkles a ghost leaves when it hits the egg. */
  poof: '#fff4cc',
};

export type GhostLook = typeof GHOST_LOOK;
