/**
 * Cinematic post-finish over the whole scene:
 * Soft optical vignette pulling the eye to the enchanted egg and chick.
 * Stylized 3D CGI cartoon aesthetic (The Incredibles 2 / Pixar standard).
 */
export const PAPER_FINISH_LOOK = {
  grainAlpha: 0.0, // Remove paper grain for clean CGI finish
  vignette: '#01040a',
  vignetteAlpha: 0.68,
};

export type PaperFinishLook = typeof PAPER_FINISH_LOOK;
