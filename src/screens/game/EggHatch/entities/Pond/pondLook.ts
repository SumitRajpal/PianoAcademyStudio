/**
 * Colours of the pond, its bank, ripples and lily pads.
 * Stylized 3D CGI cartoon aesthetic (The Incredibles 2 / Pixar standard).
 */
export const POND_LOOK = {
  bank: '#19332d',
  bankEdge: '#325c50',
  bankHighlight: '#4e8777',
  // Deep glossy liquid water gradient
  water: ['#040a14', '#0a1a2b', '#122c3d'],
  // Volumetric wave caustics & ripples
  ripple: '#4de8d8',
  rippleTrough: '#02060c',
  reflection: '#e2faf5',
  // Glossy 3D Lily Pads
  lilyPad: ['#174d42', '#216353', '#2a7561'],
  lilyPadHighlight: '#42a38a',
  lilyVein: '#6ec7ab',
  bud: '#e64573',
};

export type PondLook = typeof POND_LOOK;
