/**
 * The egg-hatch scene, in points on its design canvas: landscape 932 x 430
 * (iPhone 15 Plus, same as LessonScreen). On other phones the canvas scales to
 * cover the screen. Every position, depth and timing of the scene lives here;
 * each atom's colours live in its own xLook.ts.
 */

export const DESIGN_SIZE = { width: 932, height: 430 };

/**
 * Extra painted margin on every side, so parallax layers can slide without
 * showing an edge.
 */
export const OVERSCAN = 70;

/** The seven ghosts, one per note, in the order they hit the egg. */
export const GHOST_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type GhostLetter = (typeof GHOST_LETTERS)[number];

/** How many ghost hits fully crack the egg (one stage per ghost). */
export const CRACK_STAGES = GHOST_LETTERS.length;

/** Where the main pieces sit. */
export const SCENE = {
  moon: { x: 466, y: 60, radius: 25 },
  /** The egg, drawn `scale` times its design size (MAGIC_EGG_SIZE) so it sits close to the viewer. */
  egg: { x: 466, y: 228, scale: 1.22 },
  lotus: { x: 466, y: 300, size: 1.2 },
  pond: { x: 466, y: 336, rx: 238, ry: 48 },
  horizonY: 278,
} as const;

/** Owls perched on the middle-forest branches; `blink` offsets their blinks. */
export const OWLS = [
  { x: 198, y: 120, size: 34, blink: 0 },
  { x: 742, y: 146, size: 36, blink: 1.7 },
  { x: 622, y: 84, size: 26, blink: 3.1 },
] as const;

/** Glowing mushroom clusters standing on the ground. */
export const MUSHROOMS = [
  { x: 262, y: 302, scale: 0.75 },
  { x: 702, y: 300, scale: 0.9 },
  { x: 92, y: 360, scale: 1.15 },
  { x: 846, y: 372, scale: 1 },
] as const;

/** Fern plants: where they grow from and their fronds (see Fern atom). */
export const FERNS = [
  {
    x: 150, y: 440, sway: 0,
    fronds: [
      { angle: -100, length: 130, curl: 30 },
      { angle: -70, length: 120, curl: 26 },
      { angle: -130, length: 100, curl: -24, dark: true },
      { angle: -45, length: 95, curl: 22, dark: true },
    ],
  },
  {
    x: 790, y: 440, sway: 1.3,
    fronds: [
      { angle: -80, length: 130, curl: -30 },
      { angle: -110, length: 118, curl: -26 },
      { angle: -50, length: 100, curl: 24, dark: true },
      { angle: -135, length: 96, curl: -22, dark: true },
    ],
  },
  {
    x: 330, y: 446, sway: 2.2,
    fronds: [
      { angle: -105, length: 70, curl: 24 },
      { angle: -75, length: 64, curl: 20, dark: true },
    ],
  },
  {
    x: 612, y: 446, sway: 3.4,
    fronds: [
      { angle: -75, length: 70, curl: -24 },
      { angle: -105, length: 62, curl: -20, dark: true },
    ],
  },
];

/** Big dark leaves framing the bottom corners, closest to the viewer. */
export const JUNGLE_SPRAYS = [
  {
    x: 10, y: 450, sway: 0.6,
    leaves: [
      { angle: -96, length: 150, width: 54, bend: -0.3, color: 4 },
      { angle: -70, length: 170, width: 60, bend: 0.4, color: 1 },
      { angle: -44, length: 160, width: 58, bend: 0.3, color: 2 },
      { angle: -20, length: 140, width: 50, bend: 0.3, color: 0 },
      { angle: -2, length: 110, width: 40, bend: 0.2, color: 3 },
    ],
  },
  {
    x: 922, y: 450, sway: 2.4,
    leaves: [
      { angle: -84, length: 150, width: 54, bend: 0.3, color: 1 },
      { angle: -110, length: 170, width: 60, bend: -0.4, color: 0 },
      { angle: -136, length: 160, width: 58, bend: -0.3, color: 3 },
      { angle: -160, length: 140, width: 50, bend: -0.3, color: 4 },
      { angle: -178, length: 110, width: 40, bend: -0.2, color: 2 },
    ],
  },
];

/** Night birds crossing the sky right to left, in a loose flock. */
export const BIRDS = [
  { offset: 0, y: 44, size: 14 },
  { offset: 26, y: 58, size: 11 },
  { offset: 50, y: 36, size: 10 },
] as const;
/** Seconds for the flock to cross and come round again. */
export const BIRD_LOOP = 24;

/**
 * The ghosts' flight: an ellipse around the egg, tilted towards the viewer.
 * Ghosts on the far side shrink, ghosts on the near side grow, which reads
 * as depth.
 */
export const GHOST_ORBIT = {
  x: 466,
  y: 222,
  rx: 318,
  ry: 120,
  /** Radians per second. */
  speed: 0.32,
  /** Ghost scale on the far (top) and near (bottom) side of the orbit. */
  farScale: 0.74,
  nearScale: 1.08,
  /** Head radius at scale 1, in points. */
  ghostRadius: 23,
  /** Up-and-down float. */
  bobHeight: 7,
  bobSpeed: 2.2,
} as const;

/**
 * How far each layer moves with the slow camera drift, as a fraction of the
 * camera move: far things move little, near things move a lot. This is what
 * makes the flat paper feel deep.
 */
export const DEPTH = {
  sky: 0.06,
  farForest: 0.16,
  mist: 0.24,
  midForest: 0.34,
  frameTrees: 0.48,
  stage: 0.58,
  ferns: 0.82,
  foreground: 1.15,
} as const;

/** The slow camera drift, in points, and its period in seconds. */
export const CAMERA = { x: 26, y: 7, periodX: 21, periodY: 13 } as const;

/** The camera kick on every impact, in points. */
export const CAMERA_SHAKE = { amplitude: 3.2, decay: 13 } as const;

/** Timings, in seconds. */
export const TIMING = {
  /** When the first ghost starts its attack. */
  firstHit: 2.6,
  /** Gap between ghost attacks. */
  hitInterval: 1.7,
  /** The ghost pulls back, charging up. */
  windUp: 0.24,
  /** The dash from the pulled-back spot into the shell. */
  dash: 0.17,
  /** The whole scene freezes for a beat on contact (hit-stop). */
  hitStop: 0.07,
  /** The ghost squashed flat against the shell. */
  splat: 0.07,
  /** The ghost bursting into light after the splat. */
  burst: 0.22,
  /** A crack running out from the impact point. */
  crackRun: 0.13,
  /** The flash of light at the contact point. */
  flash: 0.3,
  /** Shell chips and sparks flying off a hit. */
  chips: 0.9,
  sparks: 0.42,
  /** Ripples running across the pond after a hit. */
  ripple: 1.6,
  /** From the last crack to the shell bursting. */
  hatchDelay: 0.55,
  /** Shell bursting open, light flooding out, chick rising and settling. */
  hatch: 3.0,
} as const;

export type EggHatchProps = {
  /** Fired when a ghost hits the egg, with the ghost's note letter. Wire audio here. */
  onNoteHit?: (letter: GhostLetter) => void;
  /** Fired once the chick has fully emerged. */
  onHatchComplete?: () => void;
};
