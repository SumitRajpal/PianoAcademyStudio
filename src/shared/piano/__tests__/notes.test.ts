import {
  frequencyOf,
  isBlackKey,
  MIDDLE_C,
  nearestNote,
  noteLetter,
  noteName,
  octaveOf,
  parseNote,
} from '../notes';

describe('parseNote', () => {
  it.each([
    ['A0', 21],
    ['C4', 60],
    ['c4', 60],
    ['C#4', 61],
    ['C♯4', 61],
    ['Db4', 61],
    ['D♭4', 61],
    ['B3', 59],
    ['Cb4', 59],
    ['C8', 108],
    ['C-1', 0],
    ['G9', 127],
  ])('reads %s as MIDI %i', (name, midi) => {
    expect(parseNote(name)).toBe(midi);
  });

  it('passes MIDI numbers through', () => {
    expect(parseNote(0)).toBe(0);
    expect(parseNote(127)).toBe(127);
  });

  it.each(['H4', 'C', '4', 'C##4', ''])('rejects the name "%s"', name => {
    expect(() => parseNote(name)).toThrow(RangeError);
  });

  it.each(['G#9', 'C10', 'B-2'])('rejects %s, outside MIDI', name => {
    expect(() => parseNote(name)).toThrow(RangeError);
  });

  it.each([-1, 128, 60.5, NaN])('rejects the MIDI number %p', midi => {
    expect(() => parseNote(midi)).toThrow(RangeError);
  });
});

describe('note names', () => {
  it('names notes with sharps and octaves', () => {
    expect(noteName(MIDDLE_C)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(21)).toBe('A0');
    expect(noteName(0)).toBe('C-1');
    expect(noteName(127)).toBe('G9');
  });

  it('round-trips every MIDI note', () => {
    for (let midi = 0; midi <= 127; midi++) {
      expect(parseNote(noteName(midi))).toBe(midi);
    }
  });

  it('gives the letter and octave', () => {
    expect(noteLetter(61)).toBe('C');
    expect(noteLetter(71)).toBe('B');
    expect(octaveOf(59)).toBe(3);
    expect(octaveOf(60)).toBe(4);
  });

  it('knows which keys are black', () => {
    const octave = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];
    expect(octave.map(isBlackKey)).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});

describe('frequencies', () => {
  it('tunes A4 to 440 Hz and middle C to about 261.63 Hz', () => {
    expect(frequencyOf(69)).toBe(440);
    expect(frequencyOf(MIDDLE_C)).toBeCloseTo(261.626, 3);
    expect(frequencyOf(21)).toBeCloseTo(27.5, 6);
  });

  it('follows a different concert pitch', () => {
    expect(frequencyOf(69, 442)).toBe(442);
  });

  it('finds the nearest note to a frequency', () => {
    expect(nearestNote(440)).toBe(69);
    expect(nearestNote(261.63)).toBe(MIDDLE_C);
    expect(nearestNote(450)).toBe(69);
    expect(nearestNote(27.5)).toBe(21);
  });
});
