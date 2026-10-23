/**
 * Colours of the chick that hatches from the egg.
 * Stylized 3D CGI cartoon aesthetic (The Incredibles 2 / Pixar standard).
 */
export const CHICK_LOOK = {
  // Volumetric 3D fluffy body: Highlight -> Midtone -> Deep Core -> Shadow
  body: ['#fffde6', '#ffd53d', '#f5a418', '#b56402'],
  // Subsurface scattering translucency (warm amber-orange glow on wings and tufts)
  sss: '#ff6229',
  sssAlpha: 0.52,
  belly: '#fff9d4',
  bellyShadow: '#e8c282',
  wing: '#f7b420',
  wingHighlight: '#ffea75',
  wingShadow: '#b06502',
  // 3D Glossy Beak
  beakHighlight: '#ffe3ad',
  beak: '#ff8619',
  beakShadow: '#ad3f02',
  cheek: '#ff9498',
  // Pixar Eyes
  eyeSclera: '#ffffff',
  eyeShadow: 'rgba(25, 14, 8, 0.35)',
  eyePupil: '#120b06',
  eyeIris: '#3d1e0d',
  eyeIrisLight: '#8a4b22',
  eyeSpecular: '#ffffff',
  tuft: '#f7bd25',
  tuftHighlight: '#ffea75',
  // Ambient Occlusion
  ao: '#2b1404',
  aoAlpha: 0.45,
  rim: '#fff6bd',
};

export type ChickLook = typeof CHICK_LOOK;
