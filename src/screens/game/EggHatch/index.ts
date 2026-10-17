/**
 * @purpose The egg-hatch screen: a paper-cut night forest where seven note
 * ghosts (C D E F G A B) orbit an enchanted egg, crack it right where they
 * strike, and a chick hatches in a burst of god light. Every scene element is
 * its own atom under entities/; drawn with React Native Skia v3 + Reanimated 4.
 */

export { EggHatch } from './EggHatch';
export {
  DESIGN_SIZE,
  GHOST_LETTERS,
  CRACK_STAGES,
  GHOST_ORBIT,
  DEPTH,
  TIMING,
  type GhostLetter,
  type EggHatchProps,
} from './eggHatchDesign';
export { drawEggHatchScene, type ScenePaints } from './scene/drawEggHatchScene';
export { planHits, defaultDiveTimes, type HitPlan } from './scene/eggHatchHits';
export { buildEggHatchSprites } from './scene/useEggHatchSprites';
