/**
 * Lit keys, recorded into a picture on the UI thread every time the key
 * state changes, so lighting keys costs no React render and no work on the
 * JS thread. CorePiano uses one picture for white keys and one for black.
 */

import { useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { Skia, type SkCanvas, type SkPaint } from 'react-native-skia';

import {
  KeyRole,
  type Box,
  type PianoKeyLights,
  type PianoState,
  type Size,
} from '../shared';

/** Draws one lit key, filled with `paint`. Must be a worklet. */
export type DrawPianoKeyLight<Look> = (
  canvas: SkCanvas,
  key: Box,
  look: Look,
  pitch: number,
  paint: SkPaint,
) => void;

type LitKey = Box & { midi: number };

/** The keys of one layer, and how a lit key of that layer is drawn. */
export type PianoKeyLightLayer<Look> = {
  keys: readonly LitKey[];
  look: Look;
  pitch: number;
  drawLight: DrawPianoKeyLight<Look>;
};

/**
 * Draws the lit keys of `layer`, each in its role's colour and as strong as
 * its level. `colors` is indexed by KeyRole. A worklet.
 */
export function drawPianoKeyLights<Look>(
  canvas: SkCanvas,
  layer: PianoKeyLightLayer<Look>,
  lights: PianoKeyLights,
  colors: readonly string[],
  paint: SkPaint,
) {
  'worklet';
  const { keys, look, pitch, drawLight } = layer;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const level = lights.levels[key.midi];
    if (level > 0) {
      const color = Skia.Color(
        colors[lights.roles[key.midi]] ?? colors[KeyRole.Pressed],
      );
      color[3] *= level;
      paint.setColor(color);
      drawLight(canvas, key, look, pitch, paint);
    }
  }
}

/**
 * A picture of the lit keys of `layer`. On native, Reanimated finds the
 * values this depends on from what the worklet uses, so it takes no
 * dependency list.
 */
export function usePianoKeyLights<Look>(
  state: PianoState,
  layer: PianoKeyLightLayer<Look>,
  colors: readonly string[],
  size: Size,
) {
  const tools = useMemo(() => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    return { recorder: Skia.PictureRecorder(), paint };
  }, []);
  const { keys, look, pitch, drawLight } = layer;
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
  const { width, height } = size;

  return useDerivedValue(() => {
    const { recorder, paint } = tools;
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    drawPianoKeyLights(
      canvas,
      { keys: litKeys, look, pitch, drawLight },
      state.value,
      colors,
      paint,
    );
    return recorder.finishRecordingAsPicture();
  });
}
