/// <reference types="node" />
/**
 * Renders the egg-hatch scene headless with the app's own drawing code: the
 * same baked sprites and the same per-frame worklet (drawEggHatchScene), at
 * the iPhone 15 Plus size (932 x 430 points). EGG_TIME (seconds, comma
 * separated for several frames) chooses the moments; EGG_OUT the file, with
 * `{t}` replaced by the time when several frames are rendered.
 */

import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Skia } from 'react-native-skia';

import {
  buildEggHatchSprites,
  DESIGN_SIZE,
  drawEggHatchScene,
  planHits,
} from '../../../src/screens/game/EggHatch';

const SCALE = Number(process.env.EGG_SCALE ?? 2);
const ROUNDED_FONT = '/System/Library/Fonts/SFNSRounded.ttf';

/** The ghost letters use SF Pro Rounded Bold, like the app on iOS. */
function ghostFont() {
  const face = Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(new Uint8Array(readFileSync(ROUNDED_FONT))),
  );
  const font = Skia.Font(face ?? undefined, 22);
  font.setEmbolden(true);
  return font;
}

test('renders the egg-hatch scene', () => {
  const { width, height } = DESIGN_SIZE;
  const plan = planHits();
  const sprites = buildEggHatchSprites(ghostFont(), SCALE, plan);
  const image = Skia.Paint();
  image.setAntiAlias(true);
  const flash = Skia.Paint();
  flash.setColor(Skia.Color('#fff8e0'));
  const times = (process.env.EGG_TIME ?? '4').split(',').map(Number);
  for (const t of times) {
    const surface = Skia.Surface.MakeRaster(width * SCALE, height * SCALE)!;
    const canvas = surface.getCanvas();
    canvas.scale(SCALE, SCALE);
    drawEggHatchScene(canvas, sprites, plan, t, { image, flash });
    surface.flush();
    const png = surface.makeImageSnapshot().encodeToBytes();
    const out = (process.env.EGG_OUT ?? join(tmpdir(), 'eggHatch-{t}.png')).replace('{t}', String(t));
    writeFileSync(out, png);
    expect(png.length).toBeGreaterThan(1000);
  }
});
