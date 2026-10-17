/**
 * The egg-hatch screen: a paper-cut night forest where seven note ghosts
 * (C D E F G A B) orbit an enchanted egg on a lotus. One by one each ghost
 * charges, dashes and bursts against the shell, cracking it right where it
 * strikes; when the last one is gone the shell shatters, god rays flood the
 * clearing and a chick hops out in a shower of confetti.
 *
 * Every piece is its own atom under entities/. Each is baked once into a GPU
 * texture (useEggHatchSprites); every frame, one UI-thread worklet
 * (drawEggHatchScene) places the textures into a picture (Skia immediate
 * mode), driven by the motion maths in scene/eggHatchMotion.ts and the hit
 * plan in scene/eggHatchHits.ts.
 *
 * The headless render (scripts/design/__tests__/eggHatchRender.test.ts) calls
 * the same drawEggHatchScene, so a rendered frame matches the phone exactly.
 */

import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Picture, Skia } from 'react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { DESIGN_SIZE, GHOST_LETTERS, type EggHatchProps } from './eggHatchDesign';
import { NIGHT_SKY_LOOK } from './entities/NightSky/nightSkyLook';
import { drawEggHatchScene, type ScenePaints } from './scene/drawEggHatchScene';
import { planHits } from './scene/eggHatchHits';
import { useEggHatchSprites } from './scene/useEggHatchSprites';

export function EggHatch({ onNoteHit, onHatchComplete }: EggHatchProps = {}) {
  const { width, height } = useWindowDimensions();
  // Cover the screen with the design canvas, centred.
  const scale = Math.max(width / DESIGN_SIZE.width, height / DESIGN_SIZE.height);
  const offsetX = (width - DESIGN_SIZE.width * scale) / 2;
  const offsetY = (height - DESIGN_SIZE.height * scale) / 2;

  const plan = useMemo(() => planHits(), []);
  const sprites = useEggHatchSprites(scale, plan);
  const paints = useMemo<ScenePaints>(() => {
    const image = Skia.Paint();
    image.setAntiAlias(true);
    const flash = Skia.Paint();
    flash.setColor(Skia.Color('#fff8e0'));
    return { image, flash };
  }, []);
  const recorder = useMemo(() => Skia.PictureRecorder(), []);
  const bounds = useMemo(() => Skia.XYWHRect(0, 0, width, height), [width, height]);

  // The one clock every movement reads, in seconds (UI thread).
  const time = useSharedValue(0);
  useFrameCallback(({ timeSinceFirstFrame }) => {
    'worklet';
    time.value = timeSinceFirstFrame / 1000;
  });

  // Each frame: place the baked sprites for this moment (immediate mode).
  const picture = useDerivedValue(() => {
    const canvas = recorder.beginRecording(bounds);
    canvas.translate(offsetX, offsetY);
    canvas.scale(scale, scale);
    drawEggHatchScene(canvas, sprites, plan, time.value, paints);
    return recorder.finishRecordingAsPicture();
  });

  // Tell the parent about each hit and the hatch, on the JS thread.
  const onNoteHitRef = useRef(onNoteHit);
  const onHatchCompleteRef = useRef(onHatchComplete);
  onNoteHitRef.current = onNoteHit;
  onHatchCompleteRef.current = onHatchComplete;
  useEffect(() => {
    const timers = plan.hits.map((hit, i) =>
      setTimeout(() => onNoteHitRef.current?.(GHOST_LETTERS[i]), hit.impactReal * 1000),
    );
    timers.push(setTimeout(() => onHatchCompleteRef.current?.(), plan.hatchEndReal * 1000));
    return () => timers.forEach(clearTimeout);
  }, [plan]);

  return (
    <View style={styles.screen}>
      <Canvas style={StyleSheet.absoluteFill} opaque>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: NIGHT_SKY_LOOK.gradient[0],
  },
});
