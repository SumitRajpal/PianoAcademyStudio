/// <reference types="node" />
import { readFileSync, writeFileSync } from 'fs';
import { Skia } from 'react-native-skia';
import { drawGhostBody, drawGhostFace, drawGhostShadow } from '../../../src/screens/game/EggHatch/entities/Ghost/drawGhost';
import { GHOST_LOOK } from '../../../src/screens/game/EggHatch/entities/Ghost/ghostLook';

const ROUNDED_FONT = '/System/Library/Fonts/SFNSRounded.ttf';

function ghostFont() {
  const face = Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(new Uint8Array(readFileSync(ROUNDED_FONT))),
  );
  const font = Skia.Font(face ?? undefined, 20);
  font.setEmbolden(true);
  return font;
}

test('renders high-res closeup lineup of clean note ghosts with enhanced badges', () => {
  const notes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const scale = 2;
  const ghostR = 48;
  const cellWidth = 160;
  const cellHeight = 220;
  const totalWidth = cellWidth * notes.length;
  const totalHeight = cellHeight;

  const surface = Skia.Surface.MakeRaster(totalWidth * scale, totalHeight * scale)!;
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);

  // Dark enchanted forest backdrop
  const bgPaint = Skia.Paint();
  bgPaint.setColor(Skia.Color('#0b1420'));
  canvas.drawRect({ x: 0, y: 0, width: totalWidth, height: totalHeight }, bgPaint);

  const font = ghostFont();

  notes.forEach((note, index) => {
    const cx = index * cellWidth + cellWidth / 2;
    const cy = cellHeight / 2 - 10;

    canvas.save();
    canvas.translate(cx, cy);

    // 1. Ghost Shadow
    drawGhostShadow(canvas, ghostR, GHOST_LOOK);

    // 2. Ghost Body
    drawGhostBody(canvas, ghostR, 1, 0, GHOST_LOOK);

    // 3. Ghost Face with Enhanced High-Contrast Badge
    drawGhostFace(canvas, ghostR, note, font, GHOST_LOOK);

    canvas.restore();
  });

  surface.flush();
  const png = surface.makeImageSnapshot().encodeToBytes();
  const outPath = '/Users/mookit/.gemini/antigravity-ide/brain/3476de91-54a7-4c24-8baa-b9d2e7156f80/ghosts_clean_lineup.png';
  writeFileSync(outPath, png);
  expect(png.length).toBeGreaterThan(1000);
});
