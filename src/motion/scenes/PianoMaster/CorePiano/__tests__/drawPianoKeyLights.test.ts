import { AlphaType, ColorType, Skia } from 'react-native-skia';

import { buildKeyboard, parseNote } from '../../../../../shared/piano';
import {
  createKeyLights,
  DEFAULT_ROLE_COLORS,
  KeyRole,
  roleColors,
  setPressedKeys,
  type Box,
  type PianoKeyLights,
  type PianoState,
} from '../../shared';
import {
  drawBlackPianoKeyLight,
  drawCorePianoBlackLayer,
  drawCorePianoWhiteLayer,
  drawPianoKeyLights,
  drawWhitePianoKeyLight,
  layoutCorePiano,
  makeBlackPianoKeyLight,
  makePianoKeyLights,
  makeWhitePianoKeyLight,
  LESSON_PIANO_LOOK,
} from '..';

const SCALE = 3;
const size = { width: 280, height: 180 };
const layout = layoutCorePiano(
  buildKeyboard({ from: 'C4', to: 'B4' }),
  size,
  {},
  SCALE,
);
const colors = roleColors(DEFAULT_ROLE_COLORS);

/** Actual CanvasKit raster output, not mocked drawing commands. */
function render(state = createKeyLights(), palette = colors) {
  const surface = Skia.Surface.MakeRaster(
    size.width * SCALE,
    size.height * SCALE,
  )!;
  const canvas = surface.getCanvas();
  canvas.scale(SCALE, SCALE);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const { pitch } = layout;
  const whites = {
    keys: layout.whites,
    pitch,
    look: LESSON_PIANO_LOOK.whiteKey,
    makeLight: makeWhitePianoKeyLight,
    drawLight: drawWhitePianoKeyLight,
  };
  const blacks = {
    keys: layout.blacks,
    pitch,
    look: LESSON_PIANO_LOOK.blackKey,
    makeLight: makeBlackPianoKeyLight,
    drawLight: drawBlackPianoKeyLight,
  };
  drawCorePianoWhiteLayer(canvas, layout, size, LESSON_PIANO_LOOK, new Set());
  drawPianoKeyLights(
    canvas,
    whites,
    state,
    makePianoKeyLights(whites, palette),
    paint,
  );
  drawCorePianoBlackLayer(canvas, layout, size, LESSON_PIANO_LOOK);
  drawPianoKeyLights(
    canvas,
    blacks,
    state,
    makePianoKeyLights(blacks, palette),
    paint,
  );
  const image = surface.makeImageSnapshot();
  const pixels = image.readPixels(0, 0, {
    width: size.width * SCALE,
    height: size.height * SCALE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  })!;
  image.dispose();
  surface.dispose();
  return {
    pixels,
    pixel(x: number, y: number) {
      const i =
        (Math.floor(y * SCALE) * size.width * SCALE + Math.floor(x * SCALE)) *
        4;
      return Array.from(pixels.slice(i, i + 3));
    },
  };
}

function light(notes: string[], role: KeyRole = KeyRole.Pressed, level = 1) {
  const lights = createKeyLights();
  for (const note of notes) {
    const midi = parseNote(note);
    lights.roles[midi] = role;
    lights.levels[midi] = level;
  }
  return lights;
}

function key(note: string) {
  return layout.rects.find(rect => rect.midi === parseNote(note))!;
}

function centre(box: Box): [number, number] {
  return [box.x + box.width / 2, box.y + box.height * 0.75];
}

describe('pressed piano key rendering', () => {
  it('makes a mixed white/black chord visibly pastel while neighbours stay inactive', () => {
    const inactive = render();
    const active = render(light(['C4', 'C#4', 'E4', 'F#4']));
    for (const note of ['C4', 'C#4', 'E4', 'F#4']) {
      const point = centre(key(note));
      const [r, g, b] = active.pixel(...point);
      expect(active.pixel(...point)).not.toEqual(inactive.pixel(...point));
      expect(b).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(r);
      expect(r).toBeGreaterThan(160);
    }
    for (const note of ['D4', 'D#4', 'G4', 'G#4', 'A4', 'B4']) {
      const point = centre(key(note));
      expect(active.pixel(...point)).toEqual(inactive.pixel(...point));
    }
  });

  it('adds an inset shadow and a short front lip rather than a flat fill', () => {
    const active = render(light(['C4', 'C#4']));
    for (const note of ['C4', 'C#4']) {
      const rect = key(note);
      const x = rect.x + rect.width / 2;
      const inset = active.pixel(x, rect.y + 0.5);
      const face = active.pixel(x, rect.y + rect.height * 0.6);
      const bottom =
        rect.height *
        (rect.isBlack ? LESSON_PIANO_LOOK.blackKey.pressed.panelBottom : 1);
      const lip = active.pixel(x, rect.y + bottom - 0.5);
      expect(inset[0]).toBeLessThan(face[0]);
      expect(lip[0]).toBeLessThan(face[0]);
      expect(face).not.toEqual(inset);
    }
  });

  it('keeps the black key dark side rails around its coloured face', () => {
    const active = render(light(['C#4']));
    const rect = key('C#4');
    const y = rect.y + rect.height * 0.65;
    const rail = active.pixel(rect.x + 0.5, y);
    const face = active.pixel(rect.x + rect.width / 2, y);
    expect(rail[0]).toBeLessThan(face[0] / 2);
    expect(rail[2]).toBeGreaterThan(rail[0]);
  });

  it('does not paint a pressed white key over an inactive black key', () => {
    const inactive = render();
    const active = render(light(['C4', 'D4']));
    const rect = key('C#4');
    for (const fraction of [0.2, 0.5, 0.9]) {
      const point: [number, number] = [
        rect.x + rect.width / 2,
        rect.y + rect.height * fraction,
      ];
      expect(active.pixel(...point)).toEqual(inactive.pixel(...point));
    }
  });

  it('does not change any pixels outside the active key boxes', () => {
    const inactive = render();
    const active = render(light(['C4', 'C#4']));
    const boxes = [key('C4'), key('C#4')];
    let differencesOutside = 0;
    for (let y = 0; y < size.height * SCALE; y++) {
      for (let x = 0; x < size.width * SCALE; x++) {
        const inside = boxes.some(
          box =>
            x >= Math.floor(box.x * SCALE) &&
            x <= Math.ceil((box.x + box.width) * SCALE) &&
            y >= Math.floor(box.y * SCALE) &&
            y <= Math.ceil((box.y + box.height) * SCALE),
        );
        if (inside) {
          continue;
        }
        const i = (y * size.width * SCALE + x) * 4;
        if (
          active.pixels[i] !== inactive.pixels[i] ||
          active.pixels[i + 1] !== inactive.pixels[i + 1] ||
          active.pixels[i + 2] !== inactive.pixels[i + 2]
        ) {
          differencesOutside++;
        }
      }
    }
    expect(differencesOutside).toBe(0);
  });

  it.each([KeyRole.Pressed, KeyRole.Target, KeyRole.Correct, KeyRole.Wrong])(
    'uses role %p colours on both key types without paint leaking between keys',
    role => {
      const active = render(light(['C4', 'C#4'], role));
      const expected = Skia.Color(colors[role]);
      for (const note of ['C4', 'C#4']) {
        const pixel = active.pixel(...centre(key(note)));
        for (let channel = 0; channel < 3; channel++) {
          expect(
            Math.abs(pixel[channel] - expected[channel] * 255),
          ).toBeLessThan(20);
        }
      }
    },
  );

  it('honours custom role colours and the fallback for an unknown role', () => {
    const custom = roleColors({ ...DEFAULT_ROLE_COLORS, pressed: '#DFC9F3' });
    const lights = light(['C4', 'C#4']);
    lights.roles[60] = 99;
    const active = render(lights, custom);
    for (const note of ['C4', 'C#4']) {
      const [r, g, b] = active.pixel(...centre(key(note)));
      expect(b).toBeGreaterThan(r);
      expect(r).toBeGreaterThan(g);
    }
  });

  it('supports partial light levels and zero returns the exact inactive pixels', () => {
    const inactive = render();
    const full = render(light(['C4', 'C#4']));
    const partial = render(light(['C4', 'C#4'], KeyRole.Pressed, 0.4));
    expect(render(light(['C4', 'C#4'], KeyRole.Pressed, 0)).pixels).toEqual(
      inactive.pixels,
    );
    for (const note of ['C4', 'C#4']) {
      const point = centre(key(note));
      expect(partial.pixel(...point)).not.toEqual(inactive.pixel(...point));
      expect(partial.pixel(...point)).not.toEqual(full.pixel(...point));
    }
  });

  it('restores the entire original keyboard when a chord is released', () => {
    const state = {
      value: createKeyLights(),
      modify(modifier: (lights: PianoKeyLights) => PianoKeyLights) {
        state.value = modifier(state.value);
      },
    };
    const inactive = render();
    setPressedKeys(state as unknown as PianoState, ['C4', 'C#4', 'G4']);
    expect(render(state.value).pixel(...centre(key('C#4')))).not.toEqual(
      inactive.pixel(...centre(key('C#4'))),
    );
    setPressedKeys(state as unknown as PianoState, []);
    expect(render(state.value).pixels).toEqual(inactive.pixels);
  });

  it('creates no shaders and parses no colours when a chord is redrawn', () => {
    const paint = Skia.Paint();
    const canvas = Skia.Surface.MakeRaster(10, 10)!.getCanvas();
    const whites = {
      keys: layout.whites,
      pitch: layout.pitch,
      look: LESSON_PIANO_LOOK.whiteKey,
      makeLight: makeWhitePianoKeyLight,
      drawLight: drawWhitePianoKeyLight,
    };
    const prepared = makePianoKeyLights(whites, colors);
    const shaders = jest.spyOn(Skia.Shader, 'MakeLinearGradient');
    const parse = jest.spyOn(Skia, 'Color');
    drawPianoKeyLights(
      canvas,
      whites,
      light(['C4', 'D4', 'E4', 'F4', 'G4']),
      prepared,
      paint,
    );
    expect(shaders).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    shaders.mockRestore();
    parse.mockRestore();
  });

  it('shows a held key over its target, the target again on release, and feedback over a held key', () => {
    const near = (pixel: number[], role: KeyRole) => {
      const expected = Skia.Color(colors[role]);
      return pixel.every(
        (channel, i) => Math.abs(channel - expected[i] * 255) < 20,
      );
    };
    const state = light(['C4'], KeyRole.Target);
    state.roles[62] = KeyRole.Correct;
    state.levels[62] = 1;
    state.pressed[60] = 1;
    state.pressed[62] = 1;
    const held = render(state);
    expect(near(held.pixel(...centre(key('C4'))), KeyRole.Pressed)).toBe(true);
    expect(near(held.pixel(...centre(key('D4'))), KeyRole.Correct)).toBe(true);
    state.pressed[60] = 0;
    const released = render(state);
    expect(near(released.pixel(...centre(key('C4'))), KeyRole.Target)).toBe(
      true,
    );
  });
});
