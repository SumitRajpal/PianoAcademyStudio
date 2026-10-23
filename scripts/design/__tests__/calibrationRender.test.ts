/// <reference types="node" />
/**
 * Renders the calibration screen with the app's own drawing code and the
 * app's own view model, at the iPhone 15 Plus resolution (932 x 430 points
 * at 3x), and writes a PNG. Text is drawn with SF Pro Rounded from macOS at
 * the baselines the app uses; without that font it is left out.
 *
 *   CAL_STEP   keyboard | thoroughness | listening (default) | wrong | done
 *   DESIGN_OUT the PNG to write
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Skia, type SkCanvas, type SkTypeface } from 'react-native-skia';

import { buildKeyboard, noteName } from '../../../src/shared/piano';
import {
  CALIBRATION_STATE,
  KEYBOARD_CHOICES,
  type CalibrationProgressEvent,
  type PianoProfile,
} from '../../../src/motion/scenes/PianoMaster';
import {
  drawBlackPianoKeyLight,
  drawCorePianoBlackLayer,
  drawCorePianoWhiteLayer,
  drawPianoKeyLights,
  drawWhitePianoKeyLight,
  layoutCorePiano,
  layoutPianoKeyLabels,
  LESSON_PIANO_LOOK,
  makeBlackPianoKeyLight,
  makePianoKeyLights,
  makeWhitePianoKeyLight,
} from '../../../src/motion/scenes/PianoMaster/CorePiano';
import {
  createKeyLights,
  DEFAULT_ROLE_COLORS,
  KeyRole,
  roleColors,
} from '../../../src/motion/scenes/PianoMaster/shared';
import {
  CALIBRATION_DESIGN,
  calibrationView,
  calloutPlacement,
  choiceBox,
  drawCalibrationBackground,
  type CalibrationStep,
  type CalibrationText,
  type DesignBox,
} from '../../../src/screens/CalibrationScreen';
import { ROUNDED_METRICS } from '../../../src/shared/typography';

const SCALE = 3;
const WIDTH = 932;
const HEIGHT = 430;
const ROUNDED_FONT = '/System/Library/Fonts/SFNSRounded.ttf';

function event(e: Partial<CalibrationProgressEvent>): CalibrationProgressEvent {
  return {
    state: CALIBRATION_STATE.waitStrike1,
    currentMidi: 36,
    keyIndex: 1,
    totalKeys: 7,
    strikeNumber: 1,
    measuredMidi: -1,
    detectedMidi: -1,
    measuredFreqHz: 0,
    centsOffset: 0,
    strikeRmsDb: -30,
    measuredB: 0,
    ...e,
  };
}

const PROFILE: PianoProfile = {
  isCalibrated: true,
  lowestMidi: 21,
  highestMidi: 108,
  a4ReferenceHz: 441.2,
  ambientNoiseDb: -62,
  calibratedGateDb: -56,
  minVelocityDb: -40,
  maxVelocityDb: -8,
  meanInharmonicityB: 0.00031,
  measuredKeys: [24, 36, 48, 60, 69, 72, 84],
};

/** The moment to render: what the app would be showing, and the keys lit. */
function scene(name: string) {
  const keyboard = KEYBOARD_CHOICES[0];
  const status = { state: 'running', message: '' } as const;
  const base = { keyboard, profile: PROFILE, status, saveFailed: false };
  const lights = createKeyLights();
  const light = (midi: number, role: number) => {
    lights.roles[midi] = role;
    lights.levels[midi] = 1;
  };
  let step: CalibrationStep = 'listening';
  let e: CalibrationProgressEvent | null = null;
  switch (name) {
    case 'keyboard':
      step = 'keyboard';
      break;
    case 'thoroughness':
      step = 'thoroughness';
      break;
    case 'wrong':
      e = event({ state: CALIBRATION_STATE.wrongKey, detectedMidi: 38 });
      light(36, KeyRole.Target);
      light(38, KeyRole.Wrong);
      break;
    case 'done':
      e = event({
        state: CALIBRATION_STATE.allDone,
        keyIndex: 6,
        measuredMidi: 84,
      });
      PROFILE.measuredKeys.forEach(midi => light(midi, KeyRole.Correct));
      break;
    default:
      // Strike 2 of C2: the key to play is lit, and the player is holding it.
      e = event({
        state: CALIBRATION_STATE.waitStrike2,
        strikeNumber: 2,
        measuredMidi: 36,
      });
      light(36, KeyRole.Target);
      lights.pressed[36] = 0.9;
      lights.held.push(36);
      lights.heldSlot[36] = 0;
  }
  return {
    view: calibrationView({ ...base, step, event: e }),
    lights,
    keyboard,
  };
}

function typeface(file: string): SkTypeface {
  return Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(new Uint8Array(readFileSync(file))),
  )!;
}

function textDrawer(rounded: SkTypeface) {
  const provider = Skia.TypefaceFontProvider.Make();
  provider.registerFont(rounded, 'rounded');
  const paragraph = (
    text: string,
    size: number,
    color: string,
    weight: number,
    spacing = 0,
  ) => {
    const builder = Skia.ParagraphBuilder.Make(
      {
        textStyle: {
          fontFamilies: ['rounded'],
          fontSize: size,
          color: Skia.Color(color),
          letterSpacing: spacing,
          fontVariations: [{ axis: 'wght', value: weight }],
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
    run(canvas: SkCanvas, run: CalibrationText, text: string, spacing = 0) {
      const p = paragraph(
        text,
        run.size,
        run.color,
        Number(run.weight),
        spacing,
      );
      const width = p.getLongestLine();
      const left =
        run.align === 'left'
          ? run.x
          : run.align === 'center'
          ? run.x - width / 2
          : run.x - width;
      p.paint(canvas, left, run.baseline - ROUNDED_METRICS.ascender * run.size);
      return { left, width };
    },
    /** Lines centred in a box, one under the other, like the app's buttons. */
    centered(
      canvas: SkCanvas,
      box: DesignBox,
      lines: { text: string; size: number; color: string; weight: number }[],
    ) {
      const built = lines.map(l =>
        paragraph(l.text, l.size, l.color, l.weight),
      );
      const total = built.reduce((sum, p) => sum + p.getHeight(), 0);
      let y = box.y + (box.height - total) / 2;
      for (const p of built) {
        p.paint(canvas, box.x + (box.width - p.getLongestLine()) / 2, y);
        y += p.getHeight();
      }
    },
  };
}

test('renders the calibration screen', () => {
  const name = process.env.CAL_STEP ?? 'listening';
  const { view, lights, keyboard } = scene(name);
  const design = CALIBRATION_DESIGN;
  const surface = Skia.Surface.MakeRaster(WIDTH * SCALE, HEIGHT * SCALE)!;
  const canvas = surface.getCanvas();
  canvas.save();
  canvas.scale(SCALE, SCALE);

  const keys = buildKeyboard({ from: keyboard.from, to: keyboard.to });
  const size = { width: WIDTH, height: design.keyboard.height };
  const layout = layoutCorePiano(keys, size, {}, SCALE);
  const target =
    view.target >= 0
      ? layout.rects.find(r => r.midi === view.target)
      : undefined;
  const calloutX = target ? target.x + target.width / 2 : null;
  drawCalibrationBackground(canvas, HEIGHT, {
    progress: view.progress,
    calloutX,
  });

  // Choice buttons (their text comes with the rest of the text below).
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const look = design.choices;
  view.choices.forEach((choice, i) => {
    const box = choiceBox(i, view.choiceWidth);
    paint.setColor(Skia.Color(choice.chosen ? look.chosenFill : look.fill));
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(box.x, box.y, box.width, box.height),
        look.radius,
        look.radius,
      ),
      paint,
    );
  });

  // The keyboard, with the app's lit-key drawing.
  canvas.save();
  canvas.translate(0, design.keyboard.top);
  const colors = roleColors(DEFAULT_ROLE_COLORS);
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
  drawCorePianoWhiteLayer(
    canvas,
    layout,
    size,
    LESSON_PIANO_LOOK,
    new Set([60]),
  );
  drawPianoKeyLights(
    canvas,
    whites,
    lights,
    makePianoKeyLights(whites, colors),
    paint,
  );
  drawCorePianoBlackLayer(canvas, layout, size, LESSON_PIANO_LOOK);
  drawPianoKeyLights(
    canvas,
    blacks,
    lights,
    makePianoKeyLights(blacks, colors),
    paint,
  );
  canvas.restore();

  if (existsSync(ROUNDED_FONT)) {
    const text = textDrawer(typeface(ROUNDED_FONT));
    text.run(canvas, design.title, 'Calibrate your piano');
    const badge = text.run(canvas, design.listening, view.listening.text);
    const dot = design.listeningDot;
    paint.setColor(Skia.Color(view.listening.on ? dot.on : dot.off));
    canvas.drawCircle(
      badge.left - dot.gap - dot.radius,
      design.listening.baseline -
        ROUNDED_METRICS.capHeight * design.listening.size * 0.5,
      dot.radius,
      paint,
    );
    text.run(canvas, design.eyebrow, view.eyebrow, design.eyebrowSpacing);
    if (view.link) text.run(canvas, design.link, view.link.text);
    text.run(canvas, design.question, view.question);
    if (view.detail) text.run(canvas, design.detail, view.detail);
    if (view.feedback) {
      const run = view.finished
        ? design.saveFeedback
        : {
            ...design.feedback,
            color:
              view.feedback.tone === 'problem'
                ? design.feedbackProblem
                : design.feedback.color,
          };
      text.run(canvas, run, view.feedback.text);
    }
    view.choices.forEach((choice, i) => {
      const lines = [
        {
          text: choice.label,
          size: look.label.size,
          color: choice.chosen ? look.label.chosenColor : look.label.color,
          weight: 700,
        },
      ];
      if (choice.caption) {
        lines.push({
          text: choice.caption,
          size: look.caption.size,
          color: choice.chosen ? look.caption.chosenColor : look.caption.color,
          weight: 400,
        });
      }
      text.centered(canvas, choiceBox(i, view.choiceWidth), lines);
    });
    if (calloutX !== null) {
      const { box } = calloutPlacement(calloutX);
      text.centered(canvas, box, [
        {
          text: noteName(view.target),
          size: design.callout.text.size,
          color: design.callout.text.color,
          weight: 700,
        },
      ]);
    }
    const cLabels = keys.filter(k => k.midi % 12 === 0).map(k => k.midi);
    for (const label of layoutPianoKeyLabels(
      layout.rects,
      cLabels,
      LESSON_PIANO_LOOK.label,
      layout.pitch,
    )) {
      text.run(
        canvas,
        {
          font: 'rounded',
          size: label.size,
          color: label.color,
          align: 'center',
          x: label.centerX,
          baseline: design.keyboard.top + label.baseline,
          weight: '700',
        },
        label.text,
      );
    }
  }
  canvas.restore();

  const image = surface.makeImageSnapshot();
  const out =
    process.env.DESIGN_OUT ?? join(tmpdir(), `calibration-${name}.png`);
  writeFileSync(out, image.encodeToBytes());
  expect(image.width()).toBe(2796);
  expect(image.height()).toBe(1290);
});
