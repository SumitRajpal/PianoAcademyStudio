#!/usr/bin/env node
/**
 * Compares a render of a screen with a reference screenshot of the same size.
 *
 *   DESIGN_OUT=/tmp/lesson.png npx jest scripts/design
 *   node scripts/design/compare.mjs --reference shot.jpeg --render /tmp/lesson.png \
 *     [--region x0,y0,x1,y1] [--diff out.png]
 *
 * Prints three scores per region, in levels out of 255 (lower is closer):
 * - pixel: the plain average difference;
 * - per point: 3 x 3 pixel blocks (one point on a 3x screen) compared, so
 *   sub-pixel edge placement hardly counts;
 * - shift-tolerant: each pixel's best match within 2 pixels sideways, so it
 *   measures colour and shading, not placement.
 * --diff writes the reference, the render and a 4x amplified difference
 * (red where the render is darker, cyan where it is lighter), stacked.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
const CK = await CanvasKitInit({
  locateFile: file => require.resolve(`canvaskit-wasm/bin/full/${file}`),
});

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) =>
        index % 2 === 0
          ? [...pairs, [value.replace(/^--/, ''), all[index + 1]]]
          : pairs,
      [],
    ),
);
if (!args.reference || !args.render) {
  console.error(
    'Usage: compare.mjs --reference shot.jpeg --render render.png [--region x0,y0,x1,y1] [--diff out.png]',
  );
  process.exit(1);
}

function pixels(file) {
  const image = CK.MakeImageFromEncoded(readFileSync(file));
  const width = image.width();
  const height = image.height();
  const data = image.readPixels(0, 0, {
    width,
    height,
    colorType: CK.ColorType.RGBA_8888,
    alphaType: CK.AlphaType.Unpremul,
    colorSpace: CK.ColorSpace.SRGB,
  });
  return { image, width, height, data };
}

const reference = pixels(args.reference);
const render = pixels(args.render);
if (reference.width !== render.width || reference.height !== render.height) {
  console.error(
    `Sizes differ: reference ${reference.width}x${reference.height}, render ${render.width}x${render.height}`,
  );
  process.exit(1);
}
const { width: W, height: H } = reference;
const [x0, y0, x1, y1] = (args.region ?? `0,0,${W - 1},${H - 1}`)
  .split(',')
  .map(Number);

const at = (data, x, y) => (y * W + x) * 4;
const difference = (x, y, dx = 0) => {
  const a = at(reference.data, x + dx, y);
  const b = at(render.data, x, y);
  return (
    (Math.abs(reference.data[a] - render.data[b]) +
      Math.abs(reference.data[a + 1] - render.data[b + 1]) +
      Math.abs(reference.data[a + 2] - render.data[b + 2])) /
    3
  );
};

let pixelSum = 0;
let shiftSum = 0;
let count = 0;
for (let y = y0; y <= y1; y++) {
  for (let x = x0; x <= x1; x++) {
    pixelSum += difference(x, y);
    let best = Infinity;
    for (let dx = -2; dx <= 2; dx++) {
      if (x + dx >= 0 && x + dx < W) {
        best = Math.min(best, difference(x, y, dx));
      }
    }
    shiftSum += best;
    count++;
  }
}

let pointSum = 0;
let points = 0;
for (let y = y0; y + 2 <= y1; y += 3) {
  for (let x = x0; x + 2 <= x1; x += 3) {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const p = at(reference.data, x + i, y + j);
        for (let k = 0; k < 3; k++) {
          a[k] += reference.data[p + k] / 9;
          b[k] += render.data[p + k] / 9;
        }
      }
    }
    pointSum +=
      (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) /
      3;
    points++;
  }
}

console.log(
  `region ${x0},${y0}..${x1},${y1}: pixel ${(pixelSum / count).toFixed(2)}, ` +
    `per point ${(pointSum / points).toFixed(2)}, ` +
    `shift-tolerant ${(shiftSum / count).toFixed(2)} (out of 255)`,
);

if (args.diff) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const diff = new Uint8Array(w * h * 4);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const a = at(reference.data, x, y);
      const level = Math.min(255, difference(x, y) * 4);
      const darker =
        render.data[a] + render.data[a + 1] + render.data[a + 2] <
        reference.data[a] + reference.data[a + 1] + reference.data[a + 2];
      const i = ((y - y0) * w + (x - x0)) * 4;
      diff.set(
        [darker ? level : 0, darker ? 0 : level, darker ? 0 : level, 255],
        i,
      );
    }
  }
  const diffImage = CK.MakeImage(
    {
      width: w,
      height: h,
      alphaType: CK.AlphaType.Unpremul,
      colorType: CK.ColorType.RGBA_8888,
      colorSpace: CK.ColorSpace.SRGB,
    },
    diff,
    w * 4,
  );
  const surface = CK.MakeSurface(w, h * 3);
  const canvas = surface.getCanvas();
  const source = CK.XYWHRect(x0, y0, w, h);
  canvas.drawImageRect(reference.image, source, CK.XYWHRect(0, 0, w, h), null);
  canvas.drawImageRect(render.image, source, CK.XYWHRect(0, h, w, h), null);
  canvas.drawImageRect(
    diffImage,
    CK.XYWHRect(0, 0, w, h),
    CK.XYWHRect(0, 2 * h, w, h),
    null,
  );
  writeFileSync(args.diff, surface.makeImageSnapshot().encodeToBytes());
}
