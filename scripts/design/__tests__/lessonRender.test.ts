/// <reference types="node" />
/**
 * Renders the lesson screen design with the app's own drawing code, at the
 * iPhone 15 Plus resolution (932 x 430 points at 3x), and writes a PNG.
 * System text is drawn with SF Pro Rounded from macOS at the same baselines
 * the app uses; without that font the text is left out.
 * Set DESIGN_OUT to choose the file; scripts in scripts/design compare it
 * with a reference screenshot.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Skia, type SkCanvas, type SkTypeface } from 'react-native-skia';

import { buildKeyboard, parseNote } from '../../../src/shared/piano';
import {
  drawCoreNotesNoteLayer,
  drawCoreNotesStaffLayer,
  drawPlayhead,
  LESSON_NOTES_LOOK,
} from '../../../src/motion/scenes/PianoMaster';
import {
  drawCorePianoBlackLayer,
  drawCorePianoWhiteLayer,
  drawBlackPianoKeyLight,
  drawPianoKeyLights,
  drawWhitePianoKeyLight,
  layoutCorePiano,
  makeBlackPianoKeyLight,
  makePianoKeyLights,
  makeWhitePianoKeyLight,
  layoutPianoKeyLabels,
  LESSON_PIANO_LOOK,
} from '../../../src/motion/scenes/PianoMaster/CorePiano';
import {
  createKeyLights,
  DEFAULT_ROLE_COLORS,
  roleColors,
  setPressedKeys,
  type PianoKeyLights,
  type PianoState,
} from '../../../src/motion/scenes/PianoMaster/shared';
import {
  DESIGN_SIZE,
  drawLessonBackground,
  LESSON_DESIGN,
  type RotatedTextRun,
  type TextRun,
} from '../../../src/screens/LessonScreen';
import { ROUNDED_METRICS } from '../../../src/shared/typography';

const SCALE = 3;
const ROUNDED_FONT = '/System/Library/Fonts/SFNSRounded.ttf';
const SYSTEM_FONT = '/System/Library/Fonts/SFNS.ttf';

function typeface(file: string): SkTypeface {
  return Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(new Uint8Array(readFileSync(file))),
  )!;
}

function textDrawer(rounded: SkTypeface, system: SkTypeface) {
  const provider = Skia.TypefaceFontProvider.Make();
  provider.registerFont(rounded, 'rounded');
  provider.registerFont(system, 'system');
  const paragraph = (
    text: string,
    size: number,
    color: string,
    font: TextRun['font'],
  ) => {
    // iOS picks SF Pro's optical size from the point size (17 at least).
    const opticalSize = Math.min(96, Math.max(17, size));
    const builder = Skia.ParagraphBuilder.Make(
      {
        textStyle: {
          fontFamilies: [font],
          fontSize: size,
          color: Skia.Color(color),
          fontVariations:
            font === 'system'
              ? [
                  { axis: 'wght', value: 700 },
                  { axis: 'opsz', value: opticalSize },
                ]
              : [{ axis: 'wght', value: 700 }],
        },
      },
      provider,
    );
    builder.addText(text);
    const built = builder.build();
    built.layout(10000);
    return built;
  };
  return {
    run(canvas: SkCanvas, run: TextRun) {
      const p = paragraph(run.text, run.size, run.color, run.font);
      const width = p.getLongestLine();
      const left =
        run.align === 'left'
          ? run.x
          : run.align === 'center'
          ? run.x - width / 2
          : run.x - width;
      p.paint(canvas, left, run.baseline - ROUNDED_METRICS.ascender * run.size);
    },
    rotated(canvas: SkCanvas, run: RotatedTextRun) {
      const p = paragraph(run.text, run.size, run.color, run.font);
      const width = p.getLongestLine();
      const { ascender, capHeight } = ROUNDED_METRICS;
      canvas.save();
      canvas.translate(run.centerX, run.centerY);
      canvas.rotate(run.rotate, 0, 0);
      p.paint(canvas, -width / 2, -(ascender - capHeight / 2) * run.size);
      canvas.restore();
    },
  };
}

test('renders the lesson screen', () => {
  const { width, height } = DESIGN_SIZE;
  const surface = Skia.Surface.MakeRaster(width * SCALE, height * SCALE)!;
  const canvas = surface.getCanvas();
  const design = LESSON_DESIGN;
  canvas.save();
  canvas.scale(SCALE, SCALE);

  drawLessonBackground(canvas, height);
  // In the app's order: the staff layer, the notes, then the playhead.
  drawCoreNotesStaffLayer(
    canvas,
    design.staff,
    design.score,
    LESSON_NOTES_LOOK,
    {
      bravura: typeface('assets/fonts/Bravura.otf'),
      leland: typeface('assets/fonts/Leland.otf'),
    },
  );
  drawCoreNotesNoteLayer(canvas, design.staff, design.score, LESSON_NOTES_LOOK);
  drawPlayhead(canvas, design.playhead, LESSON_NOTES_LOOK.playhead);

  const keyboard = { width, height: design.keyboard.height };
  const layout = layoutCorePiano(
    buildKeyboard(design.keyboard.range),
    keyboard,
    {},
    SCALE,
  );
  canvas.save();
  canvas.translate(0, design.keyboard.top);
  const markers = new Set(design.keyboard.markers.map(note => parseNote(note)));
  // Optional headless preview only; the app never hardcodes active notes.
  const piano = {
    value: createKeyLights(),
    modify(modifier: (value: PianoKeyLights) => PianoKeyLights) {
      piano.value = modifier(piano.value);
    },
  };
  setPressedKeys(
    piano as unknown as PianoState,
    (process.env.DESIGN_PRESSED_KEYS ?? '').split(',').filter(Boolean),
  );
  const lights = piano.value;
  const colors = roleColors(DEFAULT_ROLE_COLORS);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const whites = {
    keys: layout.whites,
    look: LESSON_PIANO_LOOK.whiteKey,
    pitch: layout.pitch,
    makeLight: makeWhitePianoKeyLight,
    drawLight: drawWhitePianoKeyLight,
  };
  const blacks = {
    keys: layout.blacks,
    look: LESSON_PIANO_LOOK.blackKey,
    pitch: layout.pitch,
    makeLight: makeBlackPianoKeyLight,
    drawLight: drawBlackPianoKeyLight,
  };
  drawCorePianoWhiteLayer(canvas, layout, keyboard, LESSON_PIANO_LOOK, markers);
  drawPianoKeyLights(
    canvas,
    whites,
    lights,
    makePianoKeyLights(whites, colors),
    paint,
  );
  drawCorePianoBlackLayer(canvas, layout, keyboard, LESSON_PIANO_LOOK);
  drawPianoKeyLights(
    canvas,
    blacks,
    lights,
    makePianoKeyLights(blacks, colors),
    paint,
  );
  canvas.restore();

  if (existsSync(ROUNDED_FONT) && existsSync(SYSTEM_FONT)) {
    const text = textDrawer(typeface(ROUNDED_FONT), typeface(SYSTEM_FONT));
    text.run(canvas, design.title);
    text.run(canvas, design.timer);
    text.run(canvas, design.measureNumber);
    text.rotated(canvas, design.hand);
    for (const label of layoutPianoKeyLabels(
      layout.rects,
      design.keyboard.labels,
      LESSON_PIANO_LOOK.label,
      layout.pitch,
    )) {
      text.run(canvas, {
        text: label.text,
        font: 'rounded',
        size: label.size,
        color: label.color,
        align: 'center',
        x: label.centerX,
        baseline: design.keyboard.top + label.baseline,
      });
    }
  }
  canvas.restore();

  const image = surface.makeImageSnapshot();
  const out = process.env.DESIGN_OUT ?? join(tmpdir(), 'lesson-render.png');
  writeFileSync(out, image.encodeToBytes());
  expect(image.width()).toBe(2796);
  expect(image.height()).toBe(1290);
});
