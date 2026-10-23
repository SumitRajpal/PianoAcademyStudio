/**
 * Colours of the enchanted egg, its ornaments, its cracks and its aura.
 * Stylized 3D CGI cartoon aesthetic (The Incredibles 2 / Pixar standard).
 */
export const MAGIC_EGG_LOOK = {
  // 3D Spherical Shell Gradient: Highlight -> Mid -> Deep Core -> Shadow
  shell: ['#d14777', '#a12b59', '#631336', '#310619'],
  // Subsurface scattering translucency glow
  sss: '#ff3b68',
  sssAlpha: 0.55,
  // 3D Metallic Gold Filigree: Highlight -> Midtone -> Shadow
  goldHighlight: '#fff8d6',
  gold: '#f5c662',
  goldDeep: '#9c6c21',
  goldStroke: '#c99335',
  // Teal Enamel Inlays: Highlight -> Mid -> Deep
  tealLight: '#5ce2d2',
  teal: '#2da898',
  tealDeep: '#16574f',
  // Faceted 3D Ruby Gem
  gemFacetLight: '#ff6685',
  gem: '#e62447',
  gemDeep: '#870c22',
  gemShadow: '#4a0310',
  // Crisp Specular Highlights
  highlight: '#ffffff',
  highlightRim: 'rgba(255, 230, 240, 0.75)',
  // Volumetric Ambient Occlusion & Core Shadows
  coreShadow: '#1c030d',
  // Ambient bounce light from lotus petals below
  bounceLotus: '#e84882',
  bounceAlpha: 0.35,
  // Cracks and Internal Light
  crack: '#16030b',
  crackEdge: '#ff8fb5',
  crackBruise: '#260412',
  crackGlow: '#ffe699',
  inside: '#fff9e0',
  // Aura & Shimmer
  aura: '#ffcf7a',
  auraAlpha: 0.42,
  shimmer: '#fffbe8',
};

export type MagicEggLook = typeof MAGIC_EGG_LOOK;
