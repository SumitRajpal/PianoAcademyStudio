/**
 * Plans every hit before the scene starts: when each ghost attacks, where it
 * is when it starts, the exact point and normal where it meets the shell, the
 * spot it pulls back to before the dash, and when the impact lands on both
 * clocks (game time and real time, which differ by the hit-stop freezes).
 *
 * The cracks are generated from these same contact points (useEggHatchSprites),
 * so every crack opens exactly where its ghost struck. The plan is plain data,
 * safe to hand to UI-thread worklets.
 */

import { GHOST_LETTERS, GHOST_ORBIT, SCENE, TIMING } from '../eggHatchDesign';
import { eggSurface } from '../entities/MagicEgg/eggGeometry';
import { orbitPose } from './eggHatchMotion';

export type GhostHit = {
  index: number;
  /** Game time the ghost starts its wind-up, and when it meets the shell. */
  diveAt: number;
  impactAt: number;
  /** Real time of the impact (game time plus the freezes before it). */
  impactReal: number;
  /** Where the ghost is when it starts, and its size there. */
  startX: number;
  startY: number;
  startScale: number;
  /** The shell's outward normal at the contact point. */
  outX: number;
  outY: number;
  /** The contact point on the shell, in scene points... */
  contactX: number;
  contactY: number;
  /** ...and in egg points (unscaled), for the crack generator. */
  localX: number;
  localY: number;
  /** The pulled-back spot before the dash, and the ghost's centre at impact. */
  pullX: number;
  pullY: number;
  hitX: number;
  hitY: number;
  /** Direction of the dash (radians). */
  axis: number;
};

export type HitPlan = {
  hits: GhostHit[];
  /** Game time the hatch starts, and when the shell bursts. */
  hatchAt: number;
  burstAt: number;
  /** Real time of the burst (for the big camera kick). */
  burstReal: number;
  /** Real time the chick has fully emerged. */
  hatchEndReal: number;
};

/** The demo schedule: when each ghost starts its attack (game time). */
export function defaultDiveTimes(count: number = GHOST_LETTERS.length) {
  return Array.from({ length: count }, (_, i) => TIMING.firstHit + i * TIMING.hitInterval);
}

export function planHits(diveTimes: readonly number[] = defaultDiveTimes()): HitPlan {
  const count = diveTimes.length;
  const scale = SCENE.egg.scale;
  const hits = diveTimes.map((diveAt, index): GhostHit => {
    const start = orbitPose(index, count, diveAt);
    // From the egg's centre towards the ghost: where on the shell it lands.
    const toX = start.x - SCENE.egg.x;
    const toY = start.y - SCENE.egg.y;
    // Ghosts from below strike the side of the shell, above the lotus petals.
    const aimX = (toX < 0 ? -1 : 1) * Math.max(Math.abs(toX), 60);
    const aimY = toY > 0 ? -toY * 0.2 : toY;
    const surface = eggSurface(aimX, aimY);
    const contactX = SCENE.egg.x + surface.x * scale;
    const contactY = SCENE.egg.y + surface.y * scale;
    const away = Math.hypot(toX, toY) || 1;
    const pullX = start.x + (toX / away) * 18;
    const pullY = start.y + (toY / away) * 18;
    // At impact the ghost's squashed front touches the shell.
    const reach = GHOST_ORBIT.ghostRadius * 0.62;
    const hitX = contactX + surface.nx * reach;
    const hitY = contactY + surface.ny * reach;
    const impactAt = diveAt + TIMING.windUp + TIMING.dash;
    return {
      index,
      diveAt,
      impactAt,
      impactReal: impactAt + index * TIMING.hitStop,
      startX: start.x,
      startY: start.y,
      startScale: start.scale,
      outX: surface.nx,
      outY: surface.ny,
      contactX,
      contactY,
      localX: surface.x,
      localY: surface.y,
      pullX,
      pullY,
      hitX,
      hitY,
      axis: Math.atan2(hitY - pullY, hitX - pullX),
    };
  });
  const lastImpact = hits.length ? hits[hits.length - 1].impactAt : 0;
  const hatchAt = lastImpact + TIMING.hatchDelay;
  const burstAt = hatchAt + TIMING.hatch * 0.1;
  const freezes = hits.length * TIMING.hitStop;
  return {
    hits,
    hatchAt,
    burstAt,
    burstReal: burstAt + freezes,
    hatchEndReal: hatchAt + TIMING.hatch * 0.4 + freezes,
  };
}
