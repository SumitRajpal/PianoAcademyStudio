/**
 * Colours of the friendly note ghosts:
 * Soft volumetric 3D marshmallow form with high-contrast, crystal-clear note letters.
 */
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
  // Enhanced high-contrast enameled letter badge for razor-sharp legibility
  badgePlate: '#ffffff',
  badgeGoldRim: '#d4af37',
  badgeGoldBevel: '#ffdf66',
  badgeShadow: 'rgba(30, 15, 8, 0.28)',
  letter: '#4a140b', // Deep rich burgundy with 100% contrast against white
  /** The puff of sparkles a ghost leaves when it hits the egg. */
  poof: '#fff4cc',
};

export type GhostLook = typeof GHOST_LOOK;
