/**
 * Every movement in the egg-hatch scene as pure worklet maths. The phone runs
 * these on the UI thread each frame (drawEggHatchScene); the headless render
 * calls the very same functions, so a rendered frame is exactly what the
 * phone shows at that moment.
 *
 * Two clocks:
 * - real time `t`: seconds since the scene started. The camera kick runs on it.
 * - game time `g = gameTime(t)`: real time with a short freeze at every impact
 *   (hit-stop), which gives each hit its weight. Everything else runs on it.
 *
 * The hits themselves are planned up front by `planHits` (eggHatchHits.ts):
 * when each ghost dives, where exactly it meets the shell, and when.
 */

import {
  BIRD_LOOP,
  CAMERA,
  CAMERA_SHAKE,
  DESIGN_SIZE,
  GHOST_ORBIT,
  SCENE,
  TIMING,
} from '../eggHatchDesign';
import type { GhostHit, HitPlan } from './eggHatchHits';

const TAU = Math.PI * 2;

export function clamp01(v: number) {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clampUnit(v: number) {
  'worklet';
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function easeOutCubic(v: number) {
  'worklet';
  const u = 1 - v;
  return 1 - u * u * u;
}

function easeOutBack(v: number) {
  'worklet';
  const c = 1.9;
  const u = v - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function frac(v: number) {
  'worklet';
  return v - Math.floor(v);
}

/** A fixed pseudo-random number 0..1 for (a, b): debris and confetti scatter. */
export function hash01(a: number, b: number) {
  'worklet';
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// ---------------------------------------------------------------- clocks ---

/** Game time: real time minus the hit-stop freezes so far. */
export function gameTime(t: number, plan: HitPlan) {
  'worklet';
  let g = t;
  for (let i = 0; i < plan.hits.length; i++) {
    const at = plan.hits[i].impactAt;
    if (g > at) g = Math.max(at, g - TIMING.hitStop);
  }
  return g;
}

// ---------------------------------------------------------------- camera ---

/** The slow camera drift; each layer moves by this times its DEPTH. */
export function cameraOffset(t: number, depth: number) {
  'worklet';
  return {
    x: -Math.sin((t / CAMERA.periodX) * TAU) * CAMERA.x * depth,
    y: -Math.sin((t / CAMERA.periodY) * TAU) * CAMERA.y * depth,
  };
}

/** The camera kick after each impact, on real time (it runs through the freeze). */
export function cameraShake(t: number, plan: HitPlan) {
  'worklet';
  let x = 0;
  let y = 0;
  const kicks = plan.hits.length + 1;
  for (let i = 0; i < kicks; i++) {
    const at = i < plan.hits.length ? plan.hits[i].impactReal : plan.burstReal;
    const strength = i < plan.hits.length ? 1 : 2.2;
    const since = t - at;
    if (since >= 0 && since < 0.5) {
      const fade = Math.exp(-since * CAMERA_SHAKE.decay) * CAMERA_SHAKE.amplitude * strength;
      x += Math.sin(since * 71 + i) * fade;
      y += Math.cos(since * 53 + i * 2) * fade * 0.7;
    }
  }
  return { x, y };
}

// ------------------------------------------------------------ ambience ---

/** A gentle sway angle (degrees) for plants rooted at their base. */
export function swayAngle(t: number, phase: number, amplitude: number) {
  'worklet';
  return Math.sin(t * 0.9 + phase) * amplitude + Math.sin(t * 2.1 + phase * 1.7) * amplitude * 0.3;
}

/** How shut an owl's eyelids are, 0 open .. 1 closed: a quick blink every few seconds. */
export function owlBlink(t: number, phase: number) {
  'worklet';
  const period = 4.2 + phase * 0.4;
  const local = (t + phase) % period;
  const k = local / 0.22;
  return k < 1 ? Math.sin(k * Math.PI) : 0;
}

/** Star twinkle: opacity of twinkle group `group` (0 or 1). */
export function starTwinkle(t: number, group: number) {
  'worklet';
  return 0.55 + 0.45 * Math.sin(t * 1.3 + group * Math.PI);
}

/** Where a bird is, and its wing angle (degrees). */
export function birdPose(t: number, offset: number, y: number) {
  'worklet';
  const span = DESIGN_SIZE.width + 260;
  const x = DESIGN_SIZE.width + 130 - (((t + offset * 0.04 * BIRD_LOOP) / BIRD_LOOP) % 1) * span - offset;
  return { x, y: y + Math.sin(t * 1.4 + offset) * 6, wing: Math.sin(t * 9 + offset) * 38 };
}

/** A leaf drifting down from the canopy: position, spin (degrees) and turn (scaleX). */
export function fallingLeafPose(j: number, t: number) {
  'worklet';
  const period = 9 + hash01(j, 1) * 6;
  const u = frac(t / period + hash01(j, 2));
  const x0 = 60 + hash01(j, 3) * 812;
  return {
    x: x0 + Math.sin(u * TAU * 1.5 + j) * 34 + u * 40,
    y: -30 + u * (DESIGN_SIZE.height + 60),
    rotate: Math.sin(u * TAU * 2 + j) * 70,
    turn: Math.cos(u * TAU * 3 + j * 1.3),
    alpha: clamp01(u * 8) * clamp01((1 - u) * 6),
  };
}

/** A big out-of-focus firefly drifting close to the viewer. */
export function bokehPose(j: number, t: number) {
  'worklet';
  const s = t * (0.08 + hash01(j, 4) * 0.06) + hash01(j, 5) * TAU;
  // Close to the lens, so they keep to the sides and never cover the egg.
  const side = j % 2 === 0 ? 40 + hash01(j, 6) * 200 : 690 + hash01(j, 6) * 200;
  return {
    x: side + Math.sin(s) * 40,
    y: 110 + hash01(j, 7) * 270 + Math.cos(s * 1.3) * 30,
    alpha: 0.12 + 0.33 * (0.5 + 0.5 * Math.sin(t * (0.7 + hash01(j, 8)) + j * 2)),
  };
}

// -------------------------------------------------------------- ghosts ---

/** Ghost i on its orbit at game time g (before it attacks). */
export function orbitPose(i: number, count: number, g: number) {
  'worklet';
  const o = GHOST_ORBIT;
  const angle = g * o.speed + (i / count) * TAU;
  const s = Math.sin(angle);
  const depth = (s + 1) / 2;
  return {
    x: o.x + Math.cos(angle) * o.rx,
    y: o.y + s * o.ry + Math.sin(g * o.bobSpeed + i * 1.3) * o.bobHeight,
    scale: o.farScale + (o.nearScale - o.farScale) * depth,
    s,
    depth,
  };
}

export type GhostPose = {
  x: number;
  y: number;
  scale: number;
  /** Squash/stretch along `axis` (radians) and across it. */
  axis: number;
  along: number;
  across: number;
  /** 1 = tail trailing right (flying left), 0 = tail left; crossfaded while turning. */
  tailRight: number;
  /** How far the face slides across the head towards the flight direction (points). */
  faceShift: number;
  rotate: number;
  opacity: number;
  /** Drawn in front of the egg (near side, or attacking). */
  front: boolean;
  /** 0..1: the ghost turning to light as it bursts on the shell. */
  whiten: number;
  /** 0..1: the motion streak while dashing. */
  streak: number;
  /** 0..1: the warm glow of the ghost that strikes next. */
  halo: number;
  shadowX: number;
  shadowY: number;
  shadowScale: number;
  shadowAlpha: number;
};

/** Ghost i at game time g, given its planned hit and whether it strikes next. */
export function ghostPose(i: number, count: number, g: number, hit: GhostHit, next: boolean): GhostPose {
  'worklet';
  const o = GHOST_ORBIT;
  const orbit = orbitPose(i, count, Math.min(g, hit.diveAt));
  const rising = Math.cos(g * o.bobSpeed + i * 1.3);
  const tilt = Math.sin(g * 1.7 + i) * 6;
  const groundY = SCENE.horizonY + 14 + orbit.depth * 74;

  let x = orbit.x;
  let y = orbit.y;
  let scale = orbit.scale;
  let along = 1 - 0.035 * rising;
  let across = 1 + 0.05 * rising;
  let axis = -Math.PI / 2;
  let opacity = 1;
  let whiten = 0;
  let streak = 0;
  let front = orbit.s >= 0;
  // On the near half a ghost flies left, so its tail trails right.
  let facing = clampUnit(orbit.s * 2.5);
  let tailRight = 0.5 + 0.5 * clampUnit(orbit.s * 5);
  // The next ghost glows, and glows hardest while it charges.
  let halo = next ? 0.6 + 0.25 * Math.sin(g * 5) : 0;
  if (next && g < hit.diveAt) scale *= 1.06 + 0.03 * Math.sin(g * 5);

  const tw = g - hit.diveAt;
  if (tw >= 0) {
    front = true;
    axis = hit.axis;
    facing = hit.outX > 0 ? 1 : -1;
    tailRight = facing > 0 ? 0 : 1;
    const dashAt = TIMING.windUp;
    const impact = TIMING.windUp + TIMING.dash;
    if (tw < dashAt) {
      // Wind-up: pull back from the egg, crouch, tremble with charge.
      const u = easeOutCubic(tw / dashAt);
      x = hit.startX + (hit.pullX - hit.startX) * u + Math.sin(g * 70) * 1.2 * u;
      y = hit.startY + (hit.pullY - hit.startY) * u;
      along = 1 - 0.16 * u;
      across = 1 + 0.12 * u;
      halo = 1;
    } else if (tw < impact) {
      // Dash: accelerate into the shell, stretched along the flight.
      const v = (tw - dashAt) / TIMING.dash;
      const e = v * v;
      x = hit.pullX + (hit.hitX - hit.pullX) * e;
      y = hit.pullY + (hit.hitY - hit.pullY) * e;
      scale = hit.startScale + (1 - hit.startScale) * e;
      along = 1.34;
      across = 0.8;
      streak = clamp01(v * 3);
      halo = 1 - v;
    } else if (tw < impact + TIMING.splat) {
      // Splat: flattened against the shell, lit white by the impact.
      x = hit.hitX - hit.outX * 2;
      y = hit.hitY - hit.outY * 2;
      scale = 1;
      along = 0.56;
      across = 1.36;
      whiten = 1;
      halo = 0;
    } else {
      // Burst: the ghost turns to light and sinks into the crack.
      const w = clamp01((tw - impact - TIMING.splat) / TIMING.burst);
      x = hit.hitX + (hit.contactX - hit.hitX) * w;
      y = hit.hitY + (hit.contactY - hit.hitY) * w;
      scale = 1 - w * 0.85;
      along = 0.56 + w * 0.5;
      across = 1.36 - w * 0.2;
      whiten = 1;
      opacity = 1 - w;
      halo = 0;
    }
  }
  const lift = Math.max(0, groundY - y);
  return {
    x,
    y,
    scale,
    axis,
    along,
    across,
    tailRight,
    faceShift: -facing * o.ghostRadius * 0.16,
    rotate: tw >= 0 ? 0 : tilt,
    opacity,
    front,
    whiten,
    streak,
    halo,
    shadowX: x,
    shadowY: groundY,
    shadowScale: scale * Math.max(0.35, 1.15 - lift / 320),
    shadowAlpha: opacity * clamp01(1 - lift / 380),
  };
}

/** The ghost that strikes next (the first one that has not hit yet), or -1. */
export function nextGhost(g: number, plan: HitPlan) {
  'worklet';
  for (let i = 0; i < plan.hits.length; i++) if (g < plan.hits[i].impactAt) return i;
  return -1;
}

/** Which tail-ripple frames to blend for ghost i: frame indices and blend 0..1. */
export function ghostTailFrame(i: number, g: number, frames: number) {
  'worklet';
  const p = frac(g * 0.38 + i * 0.17) * frames;
  const k = Math.floor(p);
  return { a: k % frames, b: (k + 1) % frames, mix: p - k };
}

// ----------------------------------------------------------------- egg ---

/** How many cracks have appeared at game time g. */
export function crackStage(g: number, plan: HitPlan) {
  'worklet';
  let n = 0;
  for (let i = 0; i < plan.hits.length; i++) if (g >= plan.hits[i].impactAt) n++;
  return n;
}

/** The latest hit at or before g, and the seconds since it (or null). */
export function latestHit(g: number, plan: HitPlan) {
  'worklet';
  for (let i = plan.hits.length - 1; i >= 0; i--) {
    const since = g - plan.hits[i].impactAt;
    if (since >= 0) return { hit: plan.hits[i], since };
  }
  return null;
}

/** How far crack i has run out from its impact point (egg points). */
export function crackReach(g: number, hit: GhostHit) {
  'worklet';
  const since = g - hit.impactAt;
  return since < 0 ? 0 : 150 * easeOutCubic(clamp01(since / TIMING.crackRun));
}

/**
 * The egg knocked by impacts: pushed away from the ghost and rocked around
 * its base with a springy settle, squashed along the impact line; trembling
 * more and more as it nears hatching.
 */
export function eggKnock(g: number, plan: HitPlan) {
  'worklet';
  let dx = 0;
  let dy = 0;
  let rotate = 0;
  let squash = 0;
  let axis = 0;
  for (let i = 0; i < plan.hits.length; i++) {
    const h = plan.hits[i];
    const since = g - h.impactAt;
    if (since >= 0 && since < 1.2) {
      const d = Math.exp(-6 * since) * Math.sin(19 * since);
      dx -= h.outX * 4.5 * d;
      dy -= h.outY * 2.5 * d;
      rotate -= h.outX * 9 * d;
      const q = 0.085 * Math.exp(-12 * since) * Math.cos(26 * since);
      if (Math.abs(q) > Math.abs(squash)) {
        squash = q;
        axis = Math.atan2(h.outY, h.outX);
      }
    }
  }
  const stage = crackStage(g, plan);
  // Nervous tremble in short bursts, stronger with every crack.
  if (stage >= 3 && frac(g / 1.6) < 0.18) rotate += Math.sin(g * 47) * 0.9 * (stage / plan.hits.length);
  // The big shiver right before it bursts.
  const p = (g - plan.hatchAt) / TIMING.hatch;
  if (p >= 0 && p < 0.1) rotate += Math.sin(g * 64) * 4.5 * (p / 0.1);
  return { dx, dy, rotate, squash, axis };
}

/** Brightness 0..~1.5 of the light leaking from the cracks. */
export function crackLight(g: number, plan: HitPlan) {
  'worklet';
  const stage = crackStage(g, plan);
  const last = latestHit(g, plan);
  const spike = last ? 0.7 * Math.exp(-5 * last.since) : 0;
  const p = (g - plan.hatchAt) / TIMING.hatch;
  const build = p >= 0 && p < 0.1 ? p / 0.1 : 0;
  return (0.5 + 0.5 * (stage / plan.hits.length)) * (0.82 + 0.18 * Math.sin(g * 3.1)) + spike + build * 0.8;
}

/** The egg aura's brightness 0..1, rising with every crack. */
export function eggAura(g: number, plan: HitPlan) {
  'worklet';
  const stage = crackStage(g, plan);
  const last = latestHit(g, plan);
  const spike = last ? 0.4 * Math.exp(-6 * last.since) : 0;
  return 0.4 + 0.08 * Math.sin(g * 2.2) + 0.45 * (stage / plan.hits.length) + spike;
}

/** The warm light pool on the lotus and water, 0..1. */
export function eggLightPool(g: number, plan: HitPlan) {
  'worklet';
  return clamp01(0.25 + 0.55 * (crackStage(g, plan) / plan.hits.length) + 0.06 * Math.sin(g * 2.2));
}

/** The gold shimmer: where the light band is across the egg (egg points), or null. */
export function shimmerAt(g: number) {
  'worklet';
  const u = frac(g / 3.6);
  return u < 0.3 ? -70 + (u / 0.3) * 140 : null;
}

/** The ruby glint: 0..1 sparkle size. */
export function gemGlint(g: number) {
  'worklet';
  const u = frac(g / 2.3 + 0.4);
  return u < 0.18 ? Math.sin((u / 0.18) * Math.PI) : 0;
}

/** The flash of light at the latest contact point. */
export function impactFlash(since: number) {
  'worklet';
  const u = since / TIMING.flash;
  return u < 0 || u > 1 ? null : { scale: 0.3 + 0.9 * easeOutCubic(u), alpha: 1 - u };
}

// -------------------------------------------------------------- debris ---

export const CHIPS_PER_HIT = 8;
export const SPARKS_PER_HIT = 12;

/** Shell chip j of a hit, `since` seconds after it: flies off and falls. */
export function chipPose(hit: GhostHit, j: number, since: number) {
  'worklet';
  const life = TIMING.chips;
  if (since < 0 || since > life) return null;
  const out = Math.atan2(hit.outY, hit.outX) + (hash01(hit.index, j) - 0.5) * 2.4;
  const speed = 90 + hash01(j, hit.index + 9) * 110;
  const vx = Math.cos(out) * speed;
  const vy = Math.sin(out) * speed - 70;
  return {
    x: hit.contactX + vx * since,
    y: hit.contactY + vy * since + 0.5 * 640 * since * since,
    rotate: (hash01(j, 3) - 0.5) * 900 * since,
    scale: 0.6 + hash01(j, 4) * 0.6,
    alpha: since < life - 0.3 ? 1 : (life - since) / 0.3,
    variant: j % 3,
  };
}

/** Spark j of a hit: a fast hot streak that slows and fades. */
export function sparkPose(hit: GhostHit, j: number, since: number) {
  'worklet';
  const life = TIMING.sparks;
  if (since < 0 || since > life) return null;
  const angle = Math.atan2(hit.outY, hit.outX) + (hash01(j, hit.index + 21) - 0.5) * 2.6;
  const speed = 180 + hash01(hit.index, j + 40) * 170;
  const travel = (speed * (1 - Math.exp(-4 * since))) / 4;
  const u = since / life;
  return {
    x: hit.contactX + Math.cos(angle) * travel,
    y: hit.contactY + Math.sin(angle) * travel + 60 * since * since,
    rotate: (angle * 180) / Math.PI,
    scale: 1 - u * 0.7,
    alpha: 1 - u,
  };
}

/** Ripple ring k (0, 1) on the pond after a hit: size 0..1 and alpha. */
export function ripplePose(since: number, k: number) {
  'worklet';
  const p = (since - k * 0.3) / TIMING.ripple;
  return p < 0 || p > 1 ? null : { p, alpha: (1 - p) * 0.75 };
}

// --------------------------------------------------------------- hatch ---

export type HatchPose = {
  /** 0 before the hatch, 1 once the chick has emerged and settled. */
  progress: number;
  /** The whole egg shows until the shell bursts. */
  wholeEgg: boolean;
  /** Seconds since the shell burst (negative before). */
  sinceBurst: number;
  flash: number;
  rays: number;
  raysScale: number;
  raysTurnA: number;
  raysTurnB: number;
  bloom: number;
  bloomScale: number;
  chickX: number;
  chickY: number;
  chickScale: number;
  chickScaleX: number;
  chickScaleY: number;
  chickOpacity: number;
  wing: number;
};

export function hatchPose(g: number, plan: HitPlan): HatchPose {
  'worklet';
  const H = TIMING.hatch;
  const p = clamp01((g - plan.hatchAt) / H);
  const after = Math.max(0, g - plan.hatchAt);
  const sinceBurst = g - plan.burstAt;
  const rise = clamp01((p - 0.14) / 0.22);
  const raysIn = clamp01((p - 0.08) / 0.25);
  // Celebration hops once the chick is out.
  const hopT = g - (plan.hatchAt + 0.36 * H);
  let hopY = 0;
  let squash = 0;
  let wing = rise * 18;
  if (hopT > 0) {
    const u = frac(hopT / 0.72);
    hopY = -Math.sin(Math.PI * u) * 15;
    squash = u < 0.1 ? (0.1 - u) / 0.1 : u > 0.92 ? (u - 0.92) / 0.08 : 0;
    wing = u > 0.08 && u < 0.92 ? 22 + 30 * Math.abs(Math.sin(hopT * 15)) : 8;
  }
  const s = SCENE.egg.scale;
  return {
    progress: p,
    wholeEgg: sinceBurst < 0,
    sinceBurst,
    flash: p > 0.09 && p < 0.26 ? Math.sin(((p - 0.09) / 0.17) * Math.PI) * 0.85 : 0,
    rays: raysIn * (0.8 + 0.2 * Math.sin(after * 2.7)),
    raysScale: (0.35 + 0.65 * raysIn) * s,
    raysTurnA: after * 8,
    raysTurnB: -after * 5,
    bloom: p <= 0 ? 0 : p < 0.1 ? (p / 0.1) * 0.6 : 0.5 + 0.2 * Math.sin(after * 2.4),
    bloomScale: (0.4 + 0.6 * clamp01(p / 0.3)) * s,
    chickX: SCENE.egg.x,
    chickY: SCENE.egg.y + (12 - easeOutBack(rise) * 50) * s + hopY,
    chickScale: (0.2 + 0.8 * easeOutBack(rise)) * s,
    chickScaleX: 1 + squash * 0.09,
    chickScaleY: 1 - squash * 0.11,
    chickOpacity: rise > 0 ? 1 : 0,
    wing,
  };
}

/** Shell shard j after the burst: flies up and out, spins, falls and fades. */
export function shardPose(j: number, count: number, sinceBurst: number) {
  'worklet';
  if (sinceBurst < 0 || sinceBurst > 1.4) return null;
  const side = count > 1 ? (j / (count - 1)) * 2 - 1 : 0;
  const vx = side * (110 + hash01(j, 50) * 60);
  const vy = -(230 + hash01(j, 51) * 80);
  const t = sinceBurst;
  return {
    dx: vx * t,
    dy: vy * t + 0.5 * 720 * t * t,
    rotate: (side >= 0 ? 1 : -1) * (220 + hash01(j, 52) * 260) * t,
    alpha: t < 0.9 ? 1 : 1 - (t - 0.9) / 0.5,
  };
}

export const HATCH_CHIPS = 18;

/** One of the chips sprayed out when the shell bursts. */
export function hatchChipPose(j: number, sinceBurst: number) {
  'worklet';
  const life = 1.1;
  if (sinceBurst < 0 || sinceBurst > life) return null;
  const angle = -Math.PI / 2 + (hash01(j, 60) - 0.5) * 3.4;
  const speed = 140 + hash01(j, 61) * 170;
  const t = sinceBurst;
  return {
    x: SCENE.egg.x + Math.cos(angle) * speed * t,
    y: SCENE.egg.y - 10 + Math.sin(angle) * speed * t + 0.5 * 700 * t * t,
    rotate: (hash01(j, 62) - 0.5) * 1100 * t,
    scale: 0.7 + hash01(j, 63) * 0.7,
    alpha: t < life - 0.3 ? 1 : (life - t) / 0.3,
    variant: j % 3,
  };
}

export const CONFETTI_COUNT = 44;

/** Confetti piece j: bursts up from the egg, then flutters down turning over. */
export function confettiPose(j: number, sinceBurst: number) {
  'worklet';
  const life = 5;
  if (sinceBurst < 0 || sinceBurst > life) return null;
  const t = sinceBurst;
  const k = 1.6;
  const vx = (hash01(j, 70) - 0.5) * 520;
  const vy0 = -(230 + hash01(j, 71) * 220);
  const vt = 55 + hash01(j, 72) * 30;
  const decay = (1 - Math.exp(-k * t)) / k;
  return {
    x: SCENE.egg.x + vx * decay + Math.sin(t * 4 + j) * 10 * clamp01(t),
    y: SCENE.egg.y - 20 + vt * t + (vy0 - vt) * decay,
    rotate: (hash01(j, 73) - 0.5) * 520 * t,
    turn: Math.cos(t * (5 + hash01(j, 74) * 4) + j),
    alpha: t < life - 0.8 ? 1 : (life - t) / 0.8,
    color: j % 6,
    shape: j % 3,
  };
}
