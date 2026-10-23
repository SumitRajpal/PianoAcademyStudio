/**
 * Colours of the lotus the egg rests in, back petals to front.
 * Stylized 3D CGI cartoon aesthetic (The Incredibles 2 / Pixar standard).
 */
export const LOTUS_LOOK = {
  pad: '#164a40',
  padRim: '#359682',
  padHighlight: '#55c9b2',
  sepal: ['#1d5c56', '#298072'],
  // Volumetric 3D Petal Gradients: Deep Base -> Saturated Mid -> Translucent Tip
  back: ['#420e26', '#6e1c3e', '#9c2d58'],
  mid: ['#78183c', '#b8325e', '#e85882'],
  front: ['#991e48', '#d63c6c', '#ff789c'],
  edge: '#ffd4e0',
  vein: '#ffe3ec',
  // Subsurface Scattering translucency
  sss: '#ff2865',
  sssAlpha: 0.55,
  // Crevice ambient occlusion
  ao: '#17030c',
  aoAlpha: 0.6,
};

export type LotusLook = typeof LOTUS_LOOK;
