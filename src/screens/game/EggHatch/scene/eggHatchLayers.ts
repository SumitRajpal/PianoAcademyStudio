/**
 * Which atoms make up each static parallax layer, back to front. The app
 * records each layer once as a picture and slides it by its DEPTH; the
 * headless design render draws the same functions, so both always match.
 */

import type { SkCanvas } from 'react-native-skia';

import { DESIGN_SIZE, OVERSCAN, SCENE } from '../eggHatchDesign';
import type { Bounds } from '../shared/paperKit';
import { drawNightSky } from '../entities/NightSky/drawNightSky';
import { drawStars } from '../entities/Stars/drawStars';
import { drawMoon } from '../entities/Moon/drawMoon';
import { drawFarForest } from '../entities/FarForest/drawFarForest';
import { drawMidForest } from '../entities/MidForest/drawMidForest';
import { drawFrameTree } from '../entities/FrameTree/drawFrameTree';
import { drawForestGround } from '../entities/ForestGround/drawForestGround';
import { drawPond } from '../entities/Pond/drawPond';
import { drawLotusBack, drawLotusFront } from '../entities/Lotus/drawLotus';

/** Every layer paints this area: the design canvas plus the overscan. */
export const LAYER_BOUNDS: Bounds = {
  x: -OVERSCAN,
  y: -OVERSCAN,
  width: DESIGN_SIZE.width + OVERSCAN * 2,
  height: DESIGN_SIZE.height + OVERSCAN * 2,
};

export const STATIC_LAYERS = {
  sky(canvas: SkCanvas) {
    drawNightSky(canvas, LAYER_BOUNDS, SCENE.horizonY + 40, {
      x: SCENE.egg.x,
      y: SCENE.horizonY - 40,
    });
  },
  starsA(canvas: SkCanvas) {
    drawStars(canvas, LAYER_BOUNDS, SCENE.horizonY - 60, 0);
  },
  starsB(canvas: SkCanvas) {
    drawStars(canvas, LAYER_BOUNDS, SCENE.horizonY - 60, 1);
  },
  moon(canvas: SkCanvas) {
    drawMoon(canvas, SCENE.moon, SCENE.moon.radius);
  },
  farForest(canvas: SkCanvas) {
    drawFarForest(canvas, LAYER_BOUNDS, SCENE.horizonY);
  },
  midForest(canvas: SkCanvas) {
    drawMidForest(canvas, LAYER_BOUNDS, SCENE.horizonY);
  },
  frameTrees(canvas: SkCanvas) {
    drawFrameTree(canvas, -1, DESIGN_SIZE.width, SCENE.horizonY);
    drawFrameTree(canvas, 1, DESIGN_SIZE.width, SCENE.horizonY);
  },
  /** The ground, the pond and the back of the lotus: the stage behind the egg. */
  stageBack(canvas: SkCanvas) {
    drawForestGround(canvas, LAYER_BOUNDS, SCENE.horizonY);
    drawPond(canvas, SCENE.pond);
    drawLotusBack(canvas, SCENE.lotus, SCENE.lotus.size);
  },
  /** The front lotus petals, in front of the egg. */
  stageFront(canvas: SkCanvas) {
    drawLotusFront(canvas, SCENE.lotus, SCENE.lotus.size);
  },
} as const;

export type StaticLayerName = keyof typeof STATIC_LAYERS;
