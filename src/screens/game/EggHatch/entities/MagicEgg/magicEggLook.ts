/** Colours of the enchanted egg, its ornaments, its cracks and its aura. */
export const MAGIC_EGG_LOOK = {
  shell: ['#a1365e', '#6e1c42', '#3c0c25'],
  gold: '#efbd62',
  goldDeep: '#b8823a',
  teal: '#3fb2a2',
  tealDeep: '#1f6f68',
  gem: '#e2344f',
  gemLight: '#ff8e98',
  highlight: '#ffffff',
  crack: '#16030b',
  /** The lit broken edge of a crack, and the darkened shell around it. */
  crackEdge: '#c9668c',
  crackBruise: '#2a0716',
  crackGlow: '#ffe7a3',
  aura: '#ffcf7a',
  auraAlpha: 0.38,
  inside: '#fff3c8',
  /** The light sweeping across the gold ornaments. */
  shimmer: '#fff8e0',
};

export type MagicEggLook = typeof MAGIC_EGG_LOOK;
