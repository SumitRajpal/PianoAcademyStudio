import {
  buildKeyboard,
  countWhiteKeys,
  DEFAULT_PROPORTIONS,
  DEFAULT_RANGE,
  layoutKeyboard,
  PIANO_RANGES,
} from '../keyboard';

describe('buildKeyboard', () => {
  it.each([
    ['extended108', 108, 63],
    ['standard88', 88, 52],
    ['keyboard76', 76, 45],
    ['keyboard61', 61, 36],
    ['keyboard49', 49, 29],
    ['keyboard48', 48, 28],
    ['keyboard25', 25, 15],
  ] as const)('builds %s with %i keys, %i white', (preset, total, white) => {
    const keys = buildKeyboard(PIANO_RANGES[preset]);
    expect(keys).toHaveLength(total);
    expect(countWhiteKeys(keys)).toBe(white);
  });

  it('defaults to four octaves, C2 to B5', () => {
    const keys = buildKeyboard(DEFAULT_RANGE);
    expect(keys[0].name).toBe('C2');
    expect(keys[keys.length - 1].name).toBe('B5');
  });

  it('runs from the lowest to the highest note', () => {
    const keys = buildKeyboard(PIANO_RANGES.standard88);
    expect(keys[0]).toMatchObject({ midi: 21, name: 'A0', isBlack: false });
    expect(keys[keys.length - 1]).toMatchObject({ midi: 108, name: 'C8' });
  });

  it('accepts MIDI numbers as well as names', () => {
    expect(buildKeyboard({ from: 60, to: 72 })).toEqual(
      buildKeyboard({ from: 'C4', to: 'C5' }),
    );
  });

  it('widens a range that starts or ends on a black key', () => {
    const keys = buildKeyboard({ from: 'C#4', to: 'D#4' });
    expect(keys.map(key => key.name)).toEqual(['C4', 'C#4', 'D4', 'D#4', 'E4']);
  });

  it('numbers white keys and puts each black key after its white key', () => {
    const keys = buildKeyboard({ from: 'C4', to: 'E4' });
    expect(keys.map(key => [key.name, key.whiteIndex])).toEqual([
      ['C4', 0],
      ['C#4', 0],
      ['D4', 1],
      ['D#4', 1],
      ['E4', 2],
    ]);
  });

  it('builds a single key', () => {
    expect(buildKeyboard({ from: 'C4', to: 'C4' })).toHaveLength(1);
  });

  it('rejects a reversed range', () => {
    expect(() => buildKeyboard({ from: 'C5', to: 'C4' })).toThrow(RangeError);
  });
});

describe('layoutKeyboard', () => {
  const size = { width: 700, height: 200 };

  it('waits for a size', () => {
    const keys = buildKeyboard(PIANO_RANGES.keyboard25);
    expect(layoutKeyboard(keys, { width: 0, height: 0 })).toEqual([]);
  });

  it('shares the width equally between white keys, inside a frame', () => {
    const keys = buildKeyboard({ from: 'C4', to: 'B4' });
    const whites = layoutKeyboard(keys, size).filter(key => !key.isBlack);
    const pitch = size.width / 7;
    const gap = pitch * DEFAULT_PROPORTIONS.gap;
    const frame = pitch * DEFAULT_PROPORTIONS.frame;
    whites.forEach((key, index) => {
      expect(key.x).toBeCloseTo(index * pitch + gap / 2);
      expect(key.width).toBeCloseTo(pitch - gap);
      expect(key.y).toBeCloseTo(frame);
      expect(key.height).toBeCloseTo(size.height - 2 * frame);
    });
  });

  it('centres black keys on the line between white keys by default', () => {
    const keys = buildKeyboard({ from: 'C4', to: 'B4' });
    const rects = layoutKeyboard(keys, size);
    const pitch = size.width / 7;
    const centreOf = (name: string) => {
      const key = rects.find(rect => rect.name === name)!;
      return key.x + key.width / 2;
    };
    expect(centreOf('C#4')).toBeCloseTo(pitch);
    expect(centreOf('D#4')).toBeCloseTo(pitch * 2);
    expect(centreOf('F#4')).toBeCloseTo(pitch * 4);
    expect(centreOf('G#4')).toBeCloseTo(pitch * 5);
    expect(centreOf('A#4')).toBeCloseTo(pitch * 6);

    const black = rects.find(rect => rect.name === 'C#4')!;
    expect(black.y).toBe(0);
    expect(black.width).toBeCloseTo(pitch * DEFAULT_PROPORTIONS.blackWidth);
    expect(black.height).toBeCloseTo(
      size.height * DEFAULT_PROPORTIONS.blackHeight,
    );
  });

  it('can offset black keys the way a real piano does', () => {
    const keys = buildKeyboard({ from: 'C4', to: 'B4' });
    const rects = layoutKeyboard(keys, size, {
      blackKeyPlacement: 'realistic',
    });
    const pitch = size.width / 7;
    const centreOf = (name: string) => {
      const key = rects.find(rect => rect.name === name)!;
      return key.x + key.width / 2;
    };
    expect(centreOf('C#4')).toBeCloseTo(pitch * (1 - 1 / 10));
    expect(centreOf('D#4')).toBeCloseTo(pitch * (2 + 1 / 10));
    expect(centreOf('F#4')).toBeCloseTo(pitch * (4 - 1 / 7));
    expect(centreOf('G#4')).toBeCloseTo(pitch * 5);
    expect(centreOf('A#4')).toBeCloseTo(pitch * (6 + 1 / 7));
  });

  it('matches the reference keyboard on an iPhone 15 Plus, in pixels', () => {
    // 932 x 121.67 points at 3x; measured from the reference screenshot.
    const rects = layoutKeyboard(buildKeyboard(DEFAULT_RANGE), {
      width: 932,
      height: 365 / 3,
    });
    const px = (points: number) => points * 3;
    const cSharp2 = rects.find(rect => rect.name === 'C#2')!;
    expect(px(cSharp2.x)).toBeCloseTo(71.9, 0); // dark run 72..127
    expect(px(cSharp2.width)).toBeCloseTo(56, 0);
    expect(px(cSharp2.height)).toBeCloseTo(209.5, 0);
    const d2 = rects.find(rect => rect.name === 'D2')!;
    expect(px(d2.x)).toBeCloseTo(103.5, 0); // gap 96..103
    expect(px(d2.y)).toBeCloseTo(4.8, 0); // frame 862..866.8
  });

  it('keeps every key inside the keyboard', () => {
    for (const range of Object.values(PIANO_RANGES)) {
      for (const blackKeyPlacement of ['centered', 'realistic'] as const) {
        const rects = layoutKeyboard(buildKeyboard(range), size, {
          blackKeyPlacement,
        });
        for (const rect of rects) {
          expect(rect.x).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
        }
      }
    }
  });

  it('accepts custom proportions', () => {
    const keys = buildKeyboard({ from: 'C4', to: 'D4' });
    const rects = layoutKeyboard(keys, size, {
      blackHeight: 0.5,
      gap: 0,
      frame: 0,
    });
    expect(rects.find(rect => rect.isBlack)!.height).toBe(100);
    expect(rects[0].width).toBe(size.width / 2);
    expect(rects[0].height).toBe(size.height);
  });
});
