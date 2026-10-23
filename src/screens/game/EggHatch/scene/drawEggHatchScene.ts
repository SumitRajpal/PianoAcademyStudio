/**
 * Draws one whole frame of the egg-hatch scene at real time `t` (seconds)
 * from the baked sprites. This single worklet is the whole scene: the phone
 * records it into a picture on the UI thread every frame (Skia immediate
 * mode), and the headless design render calls it directly, so both show
 * exactly the same frame.
 *
 * Only finished textures are placed here (linearly filtered, so rotated and
 * scaled sprites stay smooth): no paths, blurs or shadows are built per
 * frame, and the only per-frame objects are a few plain rects.
 *
 * Order, back to front: sky, birds, far forest, mist and moonlight, middle
 * forest and owls, frame trees, the stage (ground, pond reflections and
 * ripples, egg light, mushrooms, ghosts behind, the egg, chick and shards,
 * lotus front, ghosts in front, impact effects, fireflies), ferns, the big
 * near leaves, bokeh and drifting leaves, confetti, the hatch flash, paper finish.
 */

import { BlendMode, ClipOp, FilterMode, MipmapMode, type SkCanvas, type SkPaint } from 'react-native-skia';

import {
  BIRDS,
  DEPTH,
  DESIGN_SIZE,
  FERNS,
  GHOST_LETTERS,
  JUNGLE_SPRAYS,
  MUSHROOMS,
  OWLS,
  SCENE,
} from '../eggHatchDesign';
import { CHICK_SHOULDER } from '../entities/Chick/drawChick';
import { FIREFLY_HOMES, fireflyPose } from '../entities/Firefly/fireflyMotion';
import { EGG_PIVOT_Y } from '../entities/MagicEgg/eggGeometry';
import { EGG_GEM } from '../entities/MagicEgg/drawMagicEgg';
import { OWL_EYES } from '../entities/Owl/drawOwl';
import type { HitPlan } from './eggHatchHits';
import { LAYER_BOUNDS } from './eggHatchLayers';
import {
  birdPose,
  bokehPose,
  cameraOffset,
  cameraShake,
  chipPose,
  CHIPS_PER_HIT,
  confettiPose,
  CONFETTI_COUNT,
  crackLight,
  crackReach,
  eggAura,
  eggKnock,
  eggLightPool,
  fallingLeafPose,
  gameTime,
  gemGlint,
  ghostPose,
  ghostTailFrame,
  HATCH_CHIPS,
  hatchChipPose,
  hatchPose,
  impactFlash,
  latestHit,
  nextGhost,
  owlBlink,
  ripplePose,
  shardPose,
  shimmerAt,
  sparkPose,
  SPARKS_PER_HIT,
  starTwinkle,
  swayAngle,
  type GhostPose,
} from './eggHatchMotion';
import { GHOST_TAIL_FRAMES, type EggHatchSprites, type Sprite } from './useEggHatchSprites';

/** Paints reused every frame (made once by the caller). */
export type ScenePaints = { image: SkPaint; flash: SkPaint };

const DEG = 180 / Math.PI;
const BACK_LEAVES = 4;
const FRONT_LEAVES = 3;
const BOKEH_COUNT = 4;

function draw(canvas: SkCanvas, s: Sprite, paint: SkPaint, alpha = 1, add = false) {
  'worklet';
  if (alpha <= 0.004) return;
  paint.setAlphaf(alpha > 1 ? 1 : alpha);
  if (add) paint.setBlendMode(BlendMode.Plus);
  canvas.drawImageRectOptions(s.image, s.src, s.rect, FilterMode.Linear, MipmapMode.None, paint);
  if (add) paint.setBlendMode(BlendMode.SrcOver);
}

/** Draws a sprite centred design-rect at (x, y), scaled by `k` (no transform). */
function drawAt(canvas: SkCanvas, s: Sprite, paint: SkPaint, x: number, y: number, k: number, alpha: number, add = false) {
  'worklet';
  if (alpha <= 0.004 || k <= 0) return;
  const r = s.rect;
  paint.setAlphaf(alpha > 1 ? 1 : alpha);
  if (add) paint.setBlendMode(BlendMode.Plus);
  canvas.drawImageRectOptions(s.image, s.src, { x: x + r.x * k, y: y + r.y * k, width: r.width * k, height: r.height * k }, FilterMode.Linear, MipmapMode.None, paint);
  if (add) paint.setBlendMode(BlendMode.SrcOver);
}

function drawGhost(
  canvas: SkCanvas,
  sp: EggHatchSprites,
  paint: SkPaint,
  i: number,
  p: GhostPose,
  g: number,
) {
  'worklet';
  if (p.opacity <= 0.004) return;
  const o = p.opacity;
  canvas.save();
  canvas.translate(p.x, p.y);
  canvas.rotate(p.rotate, 0, 0);
  canvas.scale(p.scale, p.scale);
  draw(canvas, sp.ghostHalo, paint, p.halo * o, true);
  const axis = p.axis * DEG;
  if (p.streak > 0) {
    canvas.save();
    canvas.rotate(axis, 0, 0);
    canvas.scale(1 + p.streak * 0.5, 1);
    draw(canvas, sp.ghostStreak, paint, p.streak * 0.85 * o, true);
    canvas.restore();
  }
  // Squash and stretch along the flight line.
  canvas.rotate(axis, 0, 0);
  canvas.scale(p.along, p.across);
  canvas.rotate(-axis, 0, 0);
  const f = ghostTailFrame(i, g, GHOST_TAIL_FRAMES);
  for (let side = 0; side < 2; side++) {
    const w = side === 1 ? p.tailRight : 1 - p.tailRight;
    if (w <= 0.004) continue;
    const frames = sp.ghostBodies[side];
    draw(canvas, frames[f.a], paint, w * o);
    draw(canvas, frames[f.b], paint, w * f.mix * o);
    // Impact: the ghost flares to white light.
    draw(canvas, frames[f.a], paint, w * p.whiten * 0.85 * o, true);
  }
  canvas.translate(p.faceShift, 0);
  draw(canvas, sp.ghostFaces[i], paint, o * (1 - p.whiten));
  canvas.restore();
}

export function drawEggHatchScene(
  canvas: SkCanvas,
  sp: EggHatchSprites,
  plan: HitPlan,
  t: number,
  paints: ScenePaints,
) {
  'worklet';
  const paint = paints.image;
  const g = gameTime(t, plan);
  const shake = cameraShake(t, plan);
  const beginLayer = (depth: number) => {
    const o = cameraOffset(t, depth);
    const k = 0.5 + depth * 0.6;
    canvas.save();
    canvas.translate(o.x + shake.x * k, o.y + shake.y * k);
  };
  const count = GHOST_LETTERS.length;
  const next = nextGhost(g, plan);
  const hatch = hatchPose(g, plan);
  const eggScale = SCENE.egg.scale;

  // ---- Sky, moon, birds.
  beginLayer(DEPTH.sky);
  draw(canvas, sp.sky, paint);
  draw(canvas, sp.starsA, paint, starTwinkle(t, 0));
  draw(canvas, sp.starsB, paint, starTwinkle(t, 1));
  drawAt(canvas, sp.moonHalo, paint, SCENE.moon.x, SCENE.moon.y, 1, 0.8 + 0.2 * Math.sin(t * 0.8));
  for (let b = 0; b < BIRDS.length; b++) {
    const bird = BIRDS[b];
    const pose = birdPose(t, bird.offset, bird.y);
    canvas.save();
    canvas.translate(pose.x, pose.y);
    canvas.save();
    canvas.rotate(-pose.wing * 0.6, 0, 0);
    draw(canvas, sp.birds[b].wing, paint);
    canvas.restore();
    draw(canvas, sp.birds[b].body, paint);
    canvas.rotate(pose.wing, 0, 0);
    draw(canvas, sp.birds[b].wing, paint);
    canvas.restore();
  }
  canvas.restore();

  // ---- Far forest, mist and moonlight shafts.
  beginLayer(DEPTH.farForest);
  draw(canvas, sp.farForest, paint);
  canvas.restore();
  beginLayer(DEPTH.mist);
  canvas.save();
  canvas.translate((t * 7) % DESIGN_SIZE.width, 0);
  draw(canvas, sp.mist, paint);
  canvas.restore();
  canvas.save();
  canvas.translate(Math.sin(t * 0.1) * 12, 0);
  draw(canvas, sp.moonShafts, paint, 0.7 + 0.3 * Math.sin(t * 0.3), true);
  canvas.restore();
  canvas.restore();

  // ---- Middle forest with owls; far drifting leaves.
  beginLayer(DEPTH.midForest);
  draw(canvas, sp.midForest, paint);
  for (let k = 0; k < OWLS.length; k++) {
    const owl = OWLS[k];
    canvas.save();
    canvas.translate(owl.x, owl.y);
    canvas.rotate(Math.sin(t * 0.7 + owl.blink) * 4, 0, owl.size * 0.5);
    draw(canvas, sp.owls[k].body, paint);
    const shut = owlBlink(t, owl.blink);
    if (shut > 0.01) {
      const eyeY = owl.size * OWL_EYES.y;
      canvas.translate(0, eyeY);
      canvas.scale(1, shut);
      canvas.translate(0, -eyeY);
      draw(canvas, sp.owls[k].lids, paint);
    }
    canvas.restore();
  }
  for (let j = 0; j < BACK_LEAVES; j++) {
    const leaf = fallingLeafPose(j, t);
    canvas.save();
    canvas.translate(leaf.x, leaf.y);
    canvas.rotate(leaf.rotate, 0, 0);
    canvas.scale(0.7 * leaf.turn, 0.7);
    draw(canvas, sp.fallingLeaves[j % sp.fallingLeaves.length], paint, leaf.alpha * 0.85);
    canvas.restore();
  }
  canvas.restore();
  beginLayer(DEPTH.frameTrees);
  draw(canvas, sp.frameTrees, paint);
  canvas.restore();

  // ---- The stage: ground, pond, egg, ghosts.
  beginLayer(DEPTH.stage);
  draw(canvas, sp.stageBack, paint);
  const last = latestHit(g, plan);

  // Reflections and ripples, inside the water only.
  canvas.save();
  canvas.clipPath(sp.water, ClipOp.Intersect, true);
  const waterLine = SCENE.lotus.y + 8;
  const strip = 9;
  for (let k = 0; k < 6; k++) {
    canvas.save();
    canvas.clipRect({ x: SCENE.pond.x - 260, y: waterLine + k * strip, width: 520, height: strip }, ClipOp.Intersect, false);
    canvas.translate(Math.sin(t * 2.2 + k * 0.9) * (1 + k * 0.6), 0);
    canvas.translate(0, waterLine);
    canvas.scale(1, -0.55);
    canvas.translate(0, -waterLine);
    draw(canvas, sp.lotusReflection, paint, 0.3);
    canvas.save();
    canvas.translate(SCENE.egg.x, SCENE.egg.y);
    canvas.scale(eggScale, eggScale);
    draw(canvas, hatch.wholeEgg ? sp.egg : sp.cup, paint, 0.26);
    canvas.restore();
    canvas.restore();
  }
  drawAt(canvas, sp.moonGlint, paint, SCENE.moon.x + Math.sin(t * 1.3) * 3, SCENE.pond.y - 6, 1, 0.6 + 0.3 * Math.sin(t * 2.7), true);
  if (last) {
    for (let k = 0; k < 2; k++) {
      const rp = ripplePose(last.since, k);
      if (rp) {
        canvas.save();
        canvas.translate(SCENE.lotus.x, SCENE.lotus.y + 10);
        const sc = 0.5 + rp.p * 1.6;
        canvas.scale(sc, sc);
        draw(canvas, sp.ripple, paint, rp.alpha, true);
        canvas.restore();
      }
    }
  }
  canvas.restore();

  // The egg's warm light on the lotus and water.
  drawAt(canvas, sp.eggLight, paint, SCENE.egg.x, SCENE.lotus.y + 6, 1, eggLightPool(g, plan) * (1 - hatch.progress * 0.5) + hatch.bloom * 0.5, true);
  for (let m = 0; m < MUSHROOMS.length; m++) {
    const mush = MUSHROOMS[m];
    drawAt(canvas, sp.mushrooms[m].glow, paint, mush.x, mush.y, 1, 0.7 + 0.3 * Math.sin(t * 1.5 + mush.x));
    drawAt(canvas, sp.mushrooms[m].cluster, paint, mush.x, mush.y, 1, 1);
  }

  // Ghost poses once per frame; shadows, then the ghosts behind the egg.
  const poses: GhostPose[] = [];
  for (let i = 0; i < count; i++) poses.push(ghostPose(i, count, g, plan.hits[i], i === next));
  for (let i = 0; i < count; i++) {
    const p = poses[i];
    drawAt(canvas, sp.ghostShadow, paint, p.shadowX, p.shadowY, p.shadowScale, p.shadowAlpha);
  }
  for (let i = 0; i < count; i++) if (!poses[i].front) drawGhost(canvas, sp, paint, i, poses[i], g);

  // The egg: aura, god rays, then the shell (knocked, cracked, shimmering).
  canvas.save();
  canvas.translate(SCENE.egg.x, SCENE.egg.y);
  if (hatch.rays > 0) {
    canvas.save();
    canvas.rotate(hatch.raysTurnA, 0, 0);
    canvas.scale(hatch.raysScale, hatch.raysScale);
    draw(canvas, sp.godRaysA, paint, hatch.rays * 0.95, true);
    canvas.restore();
    canvas.save();
    canvas.rotate(hatch.raysTurnB, 0, 0);
    canvas.scale(hatch.raysScale * 0.92, hatch.raysScale * 0.92);
    draw(canvas, sp.godRaysB, paint, hatch.rays * 0.7, true);
    canvas.restore();
  }
  canvas.save();
  canvas.scale(eggScale, eggScale);
  draw(canvas, sp.eggAura, paint, eggAura(g, plan) * (1 - hatch.progress));
  if (hatch.wholeEgg) {
    const knock = eggKnock(g, plan);
    canvas.translate(knock.dx / eggScale, knock.dy / eggScale);
    canvas.translate(0, EGG_PIVOT_Y);
    canvas.rotate(knock.rotate, 0, 0);
    canvas.translate(0, -EGG_PIVOT_Y);
    const ax = knock.axis * DEG;
    canvas.rotate(ax, 0, 0);
    canvas.scale(1 - knock.squash, 1 + knock.squash * 0.6);
    canvas.rotate(-ax, 0, 0);
    draw(canvas, sp.egg, paint);
    // Each crack runs out from its impact point, then glows.
    const light = crackLight(g, plan);
    for (let i = 0; i < plan.hits.length; i++) {
      const reach = crackReach(g, plan.hits[i]);
      if (reach <= 0) continue;
      const c = sp.cracks[i];
      canvas.save();
      if (reach < 149) {
        canvas.clipRRect({ rect: { x: c.at.x - reach, y: c.at.y - reach, width: reach * 2, height: reach * 2 }, rx: reach, ry: reach }, ClipOp.Intersect, true);
      }
      draw(canvas, c.shell, paint);
      draw(canvas, c.light, paint, light * 0.8, true);
      canvas.restore();
    }
    // The light sweeping across the gold, and the ruby's glint.
    const sweep = shimmerAt(g);
    if (sweep !== null) {
      canvas.saveLayer(null, sp.eggGold.rect);
      draw(canvas, sp.eggGold, paint);
      paint.setBlendMode(BlendMode.SrcIn);
      canvas.save();
      canvas.translate(sweep, 0);
      paint.setAlphaf(0.9);
      canvas.drawImageRectOptions(sp.shimmer.image, sp.shimmer.src, sp.shimmer.rect, FilterMode.Linear, MipmapMode.None, paint);
      canvas.restore();
      paint.setBlendMode(BlendMode.SrcOver);
      canvas.restore();
    }
    const glint = gemGlint(g);
    if (glint > 0) {
      canvas.save();
      canvas.translate(EGG_GEM.x - 4, EGG_GEM.y - 7);
      canvas.rotate(glint * 45, 0, 0);
      canvas.scale(0.5 + glint * 0.7, 0.5 + glint * 0.7);
      draw(canvas, sp.sparkle, paint, glint, true);
      canvas.restore();
    }
  }
  canvas.restore();
  if (hatch.bloom > 0) {
    canvas.save();
    canvas.translate(0, -10);
    canvas.scale(hatch.bloomScale, hatch.bloomScale);
    draw(canvas, sp.bloom, paint, hatch.bloom);
    canvas.restore();
  }
  canvas.restore();

  // The chick rises out of the cup and hops, flapping.
  if (hatch.chickOpacity > 0) {
    canvas.save();
    canvas.translate(hatch.chickX, hatch.chickY);
    canvas.scale(hatch.chickScale * hatch.chickScaleX, hatch.chickScale * hatch.chickScaleY);
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1;
      canvas.save();
      canvas.translate(sx * CHICK_SHOULDER.x * 26, CHICK_SHOULDER.y * 26);
      canvas.rotate(-sx * hatch.wing, 0, 0);
      draw(canvas, sp.chickWings[side], paint);
      canvas.restore();
    }
    draw(canvas, sp.chickBody, paint);
    canvas.restore();
    // Twinkling stars circling the chick.
    for (let k = 0; k < 5; k++) {
      const a = g * 1.4 + k * 1.2566;
      const tw = 0.5 + 0.5 * Math.sin(g * 6 + k * 2);
      drawAt(canvas, sp.sparkle, paint, hatch.chickX + Math.cos(a) * 46 * eggScale, hatch.chickY - 6 + Math.sin(a) * 26 * eggScale, 0.6 + tw * 0.6, tw, true);
    }
  }
  if (!hatch.wholeEgg) {
    // The cup stays in the lotus; the shards fly.
    canvas.save();
    canvas.translate(SCENE.egg.x, SCENE.egg.y);
    canvas.scale(eggScale, eggScale);
    draw(canvas, sp.cup, paint);
    for (let j = 0; j < sp.shards.length; j++) {
      const sh = shardPose(j, sp.shards.length, hatch.sinceBurst);
      if (!sh) continue;
      const c = sp.shards[j].centre;
      canvas.save();
      canvas.translate(c.x + sh.dx / eggScale, c.y + sh.dy / eggScale);
      canvas.rotate(sh.rotate, 0, 0);
      canvas.translate(-c.x, -c.y);
      draw(canvas, sp.shards[j].sprite, paint, sh.alpha);
      canvas.restore();
    }
    canvas.restore();
  }
  draw(canvas, sp.stageFront, paint);
  for (let i = 0; i < count; i++) if (poses[i].front) drawGhost(canvas, sp, paint, i, poses[i], g);

  // Impact: flash, sparks and shell chips from the contact point.
  if (last) {
    const h = last.hit;
    const fl = impactFlash(last.since);
    if (fl) drawAt(canvas, sp.bloom, paint, h.contactX, h.contactY, fl.scale * 0.32, fl.alpha, true);
    for (let j = 0; j < SPARKS_PER_HIT; j++) {
      const s = sparkPose(h, j, last.since);
      if (!s) continue;
      canvas.save();
      canvas.translate(s.x, s.y);
      canvas.rotate(s.rotate, 0, 0);
      canvas.scale(s.scale, s.scale);
      draw(canvas, sp.spark, paint, s.alpha, true);
      canvas.restore();
    }
    for (let j = 0; j < CHIPS_PER_HIT; j++) {
      const c = chipPose(h, j, last.since);
      if (!c) continue;
      canvas.save();
      canvas.translate(c.x, c.y);
      canvas.rotate(c.rotate, 0, 0);
      canvas.scale(c.scale, c.scale);
      draw(canvas, sp.chips[c.variant], paint, c.alpha);
      canvas.restore();
    }
  }
  for (let j = 0; j < HATCH_CHIPS; j++) {
    const c = hatchChipPose(j, hatch.sinceBurst);
    if (!c) continue;
    canvas.save();
    canvas.translate(c.x, c.y);
    canvas.rotate(c.rotate, 0, 0);
    canvas.scale(c.scale, c.scale);
    draw(canvas, sp.chips[c.variant], paint, c.alpha);
    canvas.restore();
  }
  for (let i = 0; i < FIREFLY_HOMES.length; i++) {
    const f = fireflyPose(i, t);
    drawAt(canvas, f.warm ? sp.fireflyWarm : sp.fireflyCool, paint, f.x, f.y, 0.55 + f.glow * 0.6, 1);
  }
  canvas.restore();

  // ---- Ferns, the big near leaves (slightly out of focus), bokeh and leaves.
  beginLayer(DEPTH.ferns);
  for (let k = 0; k < FERNS.length; k++) {
    const fern = FERNS[k];
    canvas.save();
    canvas.translate(fern.x, fern.y);
    canvas.rotate(swayAngle(t, fern.sway, 2.5), 0, 0);
    draw(canvas, sp.ferns[k], paint);
    canvas.restore();
  }
  canvas.restore();
  beginLayer(DEPTH.foreground);
  for (let k = 0; k < JUNGLE_SPRAYS.length; k++) {
    const spray = JUNGLE_SPRAYS[k];
    canvas.save();
    canvas.translate(spray.x, spray.y);
    canvas.rotate(swayAngle(t, spray.sway, 1.6), 0, 0);
    draw(canvas, sp.jungle[k], paint);
    canvas.restore();
  }
  for (let j = 0; j < BOKEH_COUNT; j++) {
    const b = bokehPose(j, t);
    drawAt(canvas, sp.bokeh[j % 2], paint, b.x, b.y, 0.7 + (j % 3) * 0.25, b.alpha, true);
  }
  for (let j = BACK_LEAVES; j < BACK_LEAVES + FRONT_LEAVES; j++) {
    const leaf = fallingLeafPose(j, t);
    canvas.save();
    canvas.translate(leaf.x, leaf.y);
    canvas.rotate(leaf.rotate, 0, 0);
    canvas.scale(1.3 * leaf.turn, 1.3);
    draw(canvas, sp.fallingLeaves[j % sp.fallingLeaves.length], paint, leaf.alpha);
    canvas.restore();
  }
  canvas.restore();

  // ---- Confetti over everything, then the flash and the paper finish.
  if (hatch.sinceBurst >= 0) {
    beginLayer(DEPTH.stage);
    for (let j = 0; j < CONFETTI_COUNT; j++) {
      const c = confettiPose(j, hatch.sinceBurst);
      if (!c) continue;
      canvas.save();
      canvas.translate(c.x, c.y);
      canvas.rotate(c.rotate, 0, 0);
      canvas.scale(c.turn, 1);
      draw(canvas, sp.confetti[c.color][c.shape], paint, c.alpha);
      canvas.restore();
    }
    canvas.restore();
  }
  if (hatch.flash > 0) {
    paints.flash.setAlphaf(hatch.flash);
    canvas.drawRect(LAYER_BOUNDS, paints.flash);
  }
  draw(canvas, sp.finish, paint);
  paint.setAlphaf(1);
}
