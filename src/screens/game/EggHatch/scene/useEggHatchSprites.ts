/**
 * Bakes every egg-hatch atom once into a GPU texture: the static parallax
 * layers, and each moving piece drawn around its own origin. The paper look
 * is built from drop shadows and blurs, far too costly to replay every frame;
 * baked, a frame only places finished images, so the scene holds 60/120 fps.
 *
 * The cracks are baked from the hit plan, so each one is shaped around the
 * exact point where its ghost strikes.
 */

import { useMemo } from 'react';
import { PixelRatio } from 'react-native';
import {
  BlendMode,
  Skia,
  TileMode,
  type SkCanvas,
  type SkFont,
  type SkImage,
  type SkPath,
  type SkRect,
} from 'react-native-skia';

import {
  BIRDS,
  DESIGN_SIZE,
  FERNS,
  GHOST_LETTERS,
  GHOST_ORBIT,
  JUNGLE_SPRAYS,
  MUSHROOMS,
  OWLS,
  SCENE,
} from '../eggHatchDesign';
import { drawBirdBody, drawBirdWing } from '../entities/Bird/drawBird';
import { BOKEH_LOOK } from '../entities/Bokeh/bokehLook';
import { drawBokeh } from '../entities/Bokeh/drawBokeh';
import { drawChickBody, drawChickWing } from '../entities/Chick/drawChick';
import { CONFETTI_LOOK } from '../entities/Confetti/confettiLook';
import { CONFETTI_SHAPES, drawConfettiPiece } from '../entities/Confetti/drawConfetti';
import { drawShellChip, drawSpark, SHELL_CHIP_VARIANTS } from '../entities/Debris/drawDebris';
import { drawEggLightPool } from '../entities/EggLight/drawEggLight';
import { drawFallingLeaf } from '../entities/FallingLeaf/drawFallingLeaf';
import { FALLING_LEAF_LOOK } from '../entities/FallingLeaf/fallingLeafLook';
import { drawFernPlant } from '../entities/Fern/drawFernPlant';
import { FIREFLY_LOOK } from '../entities/Firefly/fireflyLook';
import {
  drawGhostBody,
  drawGhostFace,
  drawGhostHalo,
  drawGhostShadow,
  drawGhostStreak,
} from '../entities/Ghost/drawGhost';
import { drawGodRays, drawLightBloom } from '../entities/GodLight/drawGodLight';
import { drawJungleLeafSpray } from '../entities/JungleLeaf/drawJungleLeaf';
import { drawLotusBack, drawLotusFront } from '../entities/Lotus/drawLotus';
import {
  drawEggCrack,
  drawEggCrackLight,
  generateEggCrack,
  type EggCrack,
} from '../entities/MagicEgg/eggCracks';
import {
  drawEggAura,
  drawEggGold,
  drawMagicEgg,
  drawShimmerBand,
  EGG_SHARD_COUNT,
  eggPartCentre,
} from '../entities/MagicEgg/drawMagicEgg';
import { drawMist } from '../entities/Mist/drawMist';
import { drawMoonHalo } from '../entities/Moon/drawMoon';
import { drawMoonShafts } from '../entities/MoonShafts/drawMoonShafts';
import { drawMushroomCluster, drawMushroomGlow } from '../entities/Mushroom/drawMushroom';
import { drawOwl, drawOwlEyelids } from '../entities/Owl/drawOwl';
import { drawPaperFinish } from '../entities/PaperFinish/drawPaperFinish';
import { drawMoonGlint, drawPondRipple, pondWaterPath } from '../entities/Pond/drawPond';
import { blurred, fill, type Point } from '../shared/paperKit';
import { sparklePath } from '../shared/paperShapes';
import type { HitPlan } from './eggHatchHits';
import { LAYER_BOUNDS, STATIC_LAYERS } from './eggHatchLayers';

/** A baked texture, its whole-image source rect, and the design-point rect it covers. */
export type Sprite = { image: SkImage; src: SkRect; rect: SkRect };

type Draw = (canvas: SkCanvas) => void;

/** Tail-ripple frames baked per tail side. */
export const GHOST_TAIL_FRAMES = 6;

/**
 * Paints `draw` over `rect` (design points) into an offscreen GPU surface at
 * `density` pixels per point; `blur` (points) bakes in a depth-of-field blur.
 */
function bake(rect: SkRect, density: number, draw: Draw, blur = 0): Sprite {
  const w = Math.max(1, Math.ceil(rect.width * density));
  const h = Math.max(1, Math.ceil(rect.height * density));
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.MakeRaster(w, h);
  if (!surface) throw new Error('EggHatch: could not create a texture surface');
  const canvas = surface.getCanvas();
  canvas.scale(density, density);
  canvas.translate(-rect.x, -rect.y);
  if (blur > 0) {
    const layer = Skia.Paint();
    layer.setImageFilter(Skia.ImageFilter.MakeBlur(blur, blur, TileMode.Decal, null));
    canvas.saveLayer(layer);
    draw(canvas);
    canvas.restore();
  } else {
    draw(canvas);
  }
  surface.flush();
  const image = surface.makeImageSnapshot();
  return { image, src: { x: 0, y: 0, width: image.width(), height: image.height() }, rect };
}

/** A square rect of half-size `r` around (cx, cy). */
function around(r: number, cx = 0, cy = 0): SkRect {
  return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
}

function sparkle(c: SkCanvas) {
  const halo = fill('#fff3c8', 0.7);
  halo.setBlendMode(BlendMode.Plus);
  c.drawCircle(0, 0, 4.5, blurred(halo, 2.5));

  const star = fill('#ffffff', 0.98);
  star.setBlendMode(BlendMode.Plus);
  c.drawPath(sparklePath({ x: 0, y: 0 }, 7.5, 0.2), star);
}

export function buildEggHatchSprites(font: SkFont | null, density: number, plan: HitPlan) {
  // Big soft layers at up to 2x (they move and are soft-edged anyway);
  // glows at 1x; everything with crisp edges at the screen's full density.
  const layerDensity = Math.min(density, 2);
  const soft = Math.min(density, 1);
  const eggDensity = density * SCENE.egg.scale;
  const r = GHOST_ORBIT.ghostRadius;
  const ghostDensity = density * GHOST_ORBIT.nearScale;
  const layer = (draw: Draw) => bake(LAYER_BOUNDS, layerDensity, draw);
  const skyRect = { x: LAYER_BOUNDS.x, y: LAYER_BOUNDS.y, width: LAYER_BOUNDS.width, height: SCENE.horizonY + 40 - LAYER_BOUNDS.y };

  // Cracks from the planned impact points, each joining the earlier ones.
  const cracks: EggCrack[] = [];
  plan.hits.forEach((hit, i) => {
    cracks.push(
      generateEggCrack(
        { x: hit.localX, y: hit.localY, nx: hit.outX, ny: hit.outY, index: i, last: i === plan.hits.length - 1 },
        cracks,
      ),
    );
  });

  const shards = Array.from({ length: EGG_SHARD_COUNT }, (_, j) => ({
    sprite: bake(around(72), eggDensity, c => drawMagicEgg(c, j)),
    centre: eggPartCentre(j),
  }));

  return {
    sky: layer(c => {
      STATIC_LAYERS.sky(c);
      STATIC_LAYERS.moon(c);
    }),
    starsA: bake(skyRect, layerDensity, STATIC_LAYERS.starsA),
    starsB: bake(skyRect, layerDensity, STATIC_LAYERS.starsB),
    moonHalo: bake(around(SCENE.moon.radius * 4.3), soft, c => drawMoonHalo(c, { x: 0, y: 0 }, SCENE.moon.radius)),
    birds: BIRDS.map(b => ({
      body: bake(around(b.size * 1.1), density, c => drawBirdBody(c, b.size)),
      wing: bake(around(b.size * 0.8), density, c => drawBirdWing(c, b.size)),
    })),
    farForest: layer(STATIC_LAYERS.farForest),
    mist: bake(
      { x: -DESIGN_SIZE.width, y: SCENE.horizonY - 125, width: DESIGN_SIZE.width * 3, height: 190 },
      soft,
      c => drawMist(c, DESIGN_SIZE.width, SCENE.horizonY - 30, 3),
    ),
    moonShafts: bake({ x: 160, y: 0, width: 640, height: SCENE.horizonY + 20 }, soft, c => drawMoonShafts(c, SCENE.horizonY)),
    midForest: layer(STATIC_LAYERS.midForest),
    owls: OWLS.map(o => ({
      body: bake(around(o.size * 0.75), density, c => drawOwl(c, o.size)),
      lids: bake(around(o.size * 0.75), density, c => drawOwlEyelids(c, o.size)),
    })),
    frameTrees: layer(STATIC_LAYERS.frameTrees),
    stageBack: layer(STATIC_LAYERS.stageBack),
    water: pondWaterPath(SCENE.pond) as SkPath,
    lotusReflection: bake({ x: SCENE.lotus.x - 130, y: SCENE.lotus.y - 90, width: 260, height: 120 }, soft, c => {
      drawLotusBack(c, SCENE.lotus, SCENE.lotus.size);
      drawLotusFront(c, SCENE.lotus, SCENE.lotus.size);
    }),
    moonGlint: bake({ x: -20, y: -4, width: 40, height: 30 }, density, c => drawMoonGlint(c)),
    ripple: bake(around(104, 0, 0), soft, c => drawPondRipple(c, 100, 22)),
    eggLight: bake({ x: -230, y: -80, width: 460, height: 160 }, soft, c => drawEggLightPool(c, 220, 70)),
    mushrooms: MUSHROOMS.map(m => ({
      cluster: bake({ x: -50 * m.scale, y: -95 * m.scale, width: 105 * m.scale, height: 105 * m.scale }, density, c => drawMushroomCluster(c, m.scale)),
      glow: bake(around(72 * m.scale, 4 * m.scale, -26 * m.scale), soft, c => drawMushroomGlow(c, m.scale)),
    })),

    ghostBodies: ([-1, 1] as const).map(side =>
      Array.from({ length: GHOST_TAIL_FRAMES }, (_, f) =>
        bake(around(r * 2.8, side * r * 0.25, r * 0.3), ghostDensity, c =>
          drawGhostBody(c, r, side, (f / GHOST_TAIL_FRAMES) * Math.PI * 2),
        ),
      ),
    ),
    ghostFaces: GHOST_LETTERS.map(letter =>
      bake(around(r * 1.3, 0, r * 0.25), ghostDensity, c => drawGhostFace(c, r, letter, font)),
    ),
    ghostShadow: bake(around(r * 1.4), soft, c => drawGhostShadow(c, r)),
    ghostHalo: bake(around(r * 2.1, r * 0.1, r * 0.3), soft, c => drawGhostHalo(c, r)),
    ghostStreak: bake({ x: -r * 4.4, y: -r, width: r * 4.6, height: r * 2 }, soft, c => drawGhostStreak(c, r, r * 4)),

    eggAura: bake(around(140, 0, -6), soft, c => drawEggAura(c)),
    egg: bake(around(72), eggDensity, c => drawMagicEgg(c)),
    eggGold: bake(around(72), eggDensity, c => drawEggGold(c)),
    shimmer: bake(around(72), eggDensity, c => drawShimmerBand(c)),
    cracks: cracks.map(crack => ({
      shell: bake(around(72), eggDensity, c => drawEggCrack(c, crack)),
      light: bake(around(72), eggDensity, c => drawEggCrackLight(c, crack)),
      at: crack.at as Point,
    })),
    cup: bake(around(72), eggDensity, c => drawMagicEgg(c, 'cup')),
    shards,
    godRaysA: bake(around(520), soft * 0.6, c => drawGodRays(c, 520, 16, 11)),
    godRaysB: bake(around(440), soft * 0.6, c => drawGodRays(c, 440, 11, 29)),
    bloom: bake(around(170), soft, c => drawLightBloom(c, 70)),
    chickBody: bake(around(42, 0, -6), density * SCENE.egg.scale * 1.1, c => drawChickBody(c, 26)),
    chickWings: ([-1, 1] as const).map(side =>
      bake(around(22), density * SCENE.egg.scale * 1.1, c => drawChickWing(c, 26, side)),
    ),
    sparkle: bake(around(9), density, sparkle),
    stageFront: bake({ x: SCENE.lotus.x - 120, y: SCENE.lotus.y - 80, width: 240, height: 105 }, density, STATIC_LAYERS.stageFront),
    chips: Array.from({ length: SHELL_CHIP_VARIANTS }, (_, v) => bake(around(7), eggDensity, c => drawShellChip(c, 4.5, v))),
    spark: bake({ x: -14, y: -4, width: 20, height: 8 }, density, c => drawSpark(c, 11)),
    confetti: CONFETTI_LOOK.colors.map(color =>
      Array.from({ length: CONFETTI_SHAPES }, (_, shape) => bake(around(7), density, c => drawConfettiPiece(c, color, shape, 4.2))),
    ),
    fallingLeaves: FALLING_LEAF_LOOK.leaves.map((_, v) => bake(around(12), density, c => drawFallingLeaf(c, 18, v))),
    bokeh: [BOKEH_LOOK.warm, BOKEH_LOOK.cool].map(color => bake(around(30), soft, c => drawBokeh(c, 26, color))),
    // Depth of field: the nearest plants are baked slightly out of focus.
    ferns: FERNS.map(f => bake({ x: -170, y: -180, width: 340, height: 200 }, layerDensity, c => drawFernPlant(c, f.fronds), 0.6)),
    jungle: JUNGLE_SPRAYS.map(s => bake({ x: -220, y: -220, width: 440, height: 260 }, layerDensity, c => drawJungleLeafSpray(c, s.leaves), 1.8)),
    fireflyWarm: bake(around(8), density, c => {
      const halo = fill(FIREFLY_LOOK.warm, FIREFLY_LOOK.glowAlpha * 0.9);
      halo.setBlendMode(BlendMode.Plus);
      c.drawCircle(0, 0, 6, blurred(halo, 2.4));
      const core = fill('#ffffff', 0.95);
      core.setBlendMode(BlendMode.Plus);
      c.drawCircle(0, 0, 1.4, core);
    }),
    fireflyCool: bake(around(8), density, c => {
      const halo = fill(FIREFLY_LOOK.cool, FIREFLY_LOOK.glowAlpha * 0.9);
      halo.setBlendMode(BlendMode.Plus);
      c.drawCircle(0, 0, 6, blurred(halo, 2.4));
      const core = fill('#ffffff', 0.95);
      core.setBlendMode(BlendMode.Plus);
      c.drawCircle(0, 0, 1.4, core);
    }),
    finish: layer(c => drawPaperFinish(c, LAYER_BOUNDS, { x: SCENE.egg.x, y: SCENE.egg.y })),
  };
}

export type EggHatchSprites = ReturnType<typeof buildEggHatchSprites>;

/** The rounded bold system font for the ghost letters (falls back to System bold). */
function ghostLetterFont(): SkFont | null {
  try {
    const mgr = Skia.FontMgr.System();
    const face =
      mgr.matchFamilyStyle('Arial Rounded MT Bold', { weight: 700 }) ??
      mgr.matchFamilyStyle('System', { weight: 700 });
    return Skia.Font(face, 22);
  } catch {
    return null;
  }
}

/** All sprites, baked once for the screen's pixel density at this scene scale. */
export function useEggHatchSprites(sceneScale: number, plan: HitPlan) {
  const density = PixelRatio.get() * sceneScale;
  return useMemo(() => buildEggHatchSprites(ghostLetterFont(), density, plan), [density, plan]);
}
