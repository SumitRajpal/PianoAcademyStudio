/**
 * Lit keys, recorded into a picture on the UI thread every time the key
 * state changes, so lighting keys costs no React render and no work on the
 * JS thread. CorePiano uses one picture for white keys and one for black.
 *
 * Each key's look in each role colour (its gradient shaders) is made once per
 * layout and colours, on the JS thread. A redraw only issues draw calls: no
 * colour parsing and no shader creation, however often the state changes.
 */

import { useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import {
  Skia,
  type SkCanvas,
  type SkColor,
  type SkPaint,
} from 'react-native-skia';

import {
  KeyRole,
  type Box,
  type KeyBand,
  type PianoKeyLights,
  type PianoState,
  type Size,
} from '../shared';

/** Makes the light of one key colour in one role colour. Runs on JS. */
export type MakePianoKeyLight<Look, Light> = (
  band: KeyBand,
  look: Look,
  pitch: number,
  color: SkColor,
) => Light;

/** Draws one lit key, as strong as `level`. Must be a worklet. */
export type DrawPianoKeyLight<Look, Light> = (
  canvas: SkCanvas,
  key: Box,
  look: Look,
  pitch: number,
  light: Light,
  level: number,
  paint: SkPaint,
) => void;

type LitKey = Box & { midi: number };

/** The keys of one layer, and how a lit key of that layer is drawn. */
export type PianoKeyLightLayer<Look, Light> = {
  /** Keys of one colour: they all share one top and height. */
  keys: readonly LitKey[];
  look: Look;
  pitch: number;
  drawLight: DrawPianoKeyLight<Look, Light>;
};

/** A layer and how its light is made; makeLight never reaches the UI thread. */
export type PianoKeyLightSource<Look, Light> = PianoKeyLightLayer<
  Look,
  Light
> & { makeLight: MakePianoKeyLight<Look, Light> };

/**
 * The light of `layer` in every role, indexed by KeyRole like `colors`.
 * Empty until the layer has keys.
 */
export function makePianoKeyLights<Look, Light>(
  layer: PianoKeyLightSource<Look, Light>,
  colors: readonly string[],
): Light[] {
  const first = layer.keys[0];
  if (!first) {
    return [];
  }
  const band = { y: first.y, height: first.height };
  return colors.map(color =>
    layer.makeLight(band, layer.look, layer.pitch, Skia.Color(color)),
  );
}

/**
 * Draws the lit keys of `layer`. `lights` comes from makePianoKeyLights.
 * What a key shows, first match wins:
 * 1. correct/wrong feedback, so the player sees it on the key they hold;
 * 2. held down, as strong as it is pressed;
 * 3. any other lesson role (such as a target), back again once released.
 * Runs once per frame however many keys changed in it. A worklet.
 */
export function drawPianoKeyLights<Look, Light>(
  canvas: SkCanvas,
  layer: PianoKeyLightLayer<Look, Light>,
  state: PianoKeyLights,
  lights: readonly Light[],
  paint: SkPaint,
) {
  'worklet';
  const { keys, look, pitch, drawLight } = layer;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const role = state.roles[key.midi];
    const level = state.levels[key.midi];
    const held = state.pressed[key.midi];
    const feedback = role === KeyRole.Correct || role === KeyRole.Wrong;
    if (level > 0 && (feedback || held <= 0)) {
      const light = lights[role] ?? lights[KeyRole.Pressed];
      drawLight(canvas, key, look, pitch, light, level, paint);
    } else if (held > 0) {
      drawLight(canvas, key, look, pitch, lights[KeyRole.Pressed], held, paint);
    }
  }
}

/**
 * A picture of the lit keys of `layer`. On native, Reanimated finds the
 * values this depends on from what the worklet uses, so it takes no
 * dependency list.
 */
export function usePianoKeyLights<Look, Light>(
  state: PianoState,
  layer: PianoKeyLightSource<Look, Light>,
  colors: readonly string[],
  size: Size,
) {
  const tools = useMemo(() => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    return { recorder: Skia.PictureRecorder(), paint };
  }, []);
  const { keys, look, pitch, makeLight, drawLight } = layer;
  // Only what the worklet needs, so less is copied to the UI thread.
  const litKeys = useMemo<LitKey[]>(
    () =>
      keys.map(({ midi, x, y, width, height }) => ({
        midi,
        x,
        y,
        width,
        height,
      })),
    [keys],
  );
  const lights = useMemo(
    () =>
      makePianoKeyLights(
        { keys: litKeys, look, pitch, makeLight, drawLight },
        colors,
      ),
    [litKeys, look, pitch, makeLight, drawLight, colors],
  );
  const { width, height } = size;

  return useDerivedValue(() => {
    const { recorder, paint } = tools;
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    drawPianoKeyLights(
      canvas,
      { keys: litKeys, look, pitch, drawLight },
      state.value,
      lights,
      paint,
    );
    return recorder.finishRecordingAsPicture();
  });
}
