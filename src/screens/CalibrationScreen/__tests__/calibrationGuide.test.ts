import {
  CALIBRATION_STATE,
  type CalibrationProgressEvent,
  type PianoProfile,
} from '../../../motion/scenes/PianoMaster/CorePianoNotesDetection';
import {
  calibrationKeys,
  calibrationPrompt,
  describeKey,
  describeProfile,
  KEYBOARD_CHOICES,
  keyboardChoiceFor,
} from '../calibrationGuide';

function calEvent(
  e: Partial<CalibrationProgressEvent>,
): CalibrationProgressEvent {
  return {
    state: 1,
    currentMidi: 24,
    keyIndex: 0,
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

function calibrated(lowestMidi: number, highestMidi: number): PianoProfile {
  return {
    isCalibrated: true,
    lowestMidi,
    highestMidi,
    a4ReferenceHz: 441.5,
    ambientNoiseDb: -60,
    calibratedGateDb: -54,
    minVelocityDb: -40,
    maxVelocityDb: -10,
    meanInharmonicityB: 0.0003,
    measuredKeys: [24, 36, 48, 60, 69, 72, 84],
  };
}

describe('calibration guide', () => {
  it('asks for the same keys as the engine', () => {
    expect(
      calibrationKeys({ fullMode: false, lowestMidi: 21, highestMidi: 108 }),
    ).toEqual([24, 36, 48, 60, 69, 72, 84]);
    expect(
      calibrationKeys({ fullMode: false, lowestMidi: 36, highestMidi: 96 }),
    ).toEqual([36, 48, 60, 69, 72, 84]);
    expect(
      calibrationKeys({ fullMode: true, lowestMidi: 21, highestMidi: 108 }),
    ).toHaveLength(17);
  });

  it('starts from the keyboard calibrated last time', () => {
    expect(keyboardChoiceFor(null).id).toBe('88');
    expect(keyboardChoiceFor(calibrated(36, 96)).id).toBe('61');
    expect(KEYBOARD_CHOICES.map(k => k.id)).toEqual(['88', '76', '61', '49']);
  });

  it('asks for quiet first, then the key to play', () => {
    expect(calibrationPrompt(null).title).toBe('Stay quiet for a moment');
    const first = calibrationPrompt(
      calEvent({ state: CALIBRATION_STATE.waitStrike1, currentMidi: 24 }),
    );
    expect(first.title).toBe('Play C1 softly');
    expect(first.target).toBe(24);
    expect(first.step).toBe('Key 1 of 7');
    expect(first.feedback).toBeNull();
  });

  it('confirms a good strike on the key and asks for the next', () => {
    const second = calibrationPrompt(
      calEvent({
        state: CALIBRATION_STATE.waitStrike2,
        currentMidi: 24,
        strikeNumber: 2,
        measuredMidi: 24,
      }),
    );
    expect(second.title).toBe('Now play C1 again, firmly');
    expect(second.flash).toEqual({ midi: 24, role: 'correct' });
    expect(second.progress).toBeCloseTo(0.5 / 7);
    // "Key done" names the NEXT key.
    const next = calibrationPrompt(
      calEvent({
        state: CALIBRATION_STATE.keyDone,
        currentMidi: 36,
        keyIndex: 1,
        measuredMidi: 24,
      }),
    );
    expect(next.title).toBe('Play C2 softly');
    expect(next.target).toBe(36);
    expect(next.feedback).toEqual({ tone: 'good', text: 'C1 measured.' });
    expect(next.flash).toEqual({ midi: 24, role: 'correct' });
    expect(next.step).toBe('Key 2 of 7');
  });

  it('names the wrong key and shows it red', () => {
    const wrong = calibrationPrompt(
      calEvent({
        state: CALIBRATION_STATE.wrongKey,
        currentMidi: 60,
        detectedMidi: 62,
      }),
    );
    expect(wrong.feedback).toEqual({
      tone: 'problem',
      text: 'That was D4. Play C4.',
    });
    expect(wrong.flash).toEqual({ midi: 62, role: 'wrong' });
    expect(wrong.target).toBe(60);
    expect(
      calibrationPrompt(calEvent({ state: CALIBRATION_STATE.notPiano }))
        .feedback?.tone,
    ).toBe('problem');
    expect(
      calibrationPrompt(calEvent({ state: CALIBRATION_STATE.tooShort }))
        .feedback?.text,
    ).toBe('Hold the key down a little longer.');
  });

  it('describes keys and the finished piano in plain words', () => {
    expect(describeKey(60)).toBe('Middle C');
    expect(describeKey(36)).toBe('Two octaves below middle C');
    expect(describeKey(84)).toBe('Two octaves above middle C');
    expect(describeKey(69)).toBe('The A above middle C');
    expect(describeProfile(calibrated(21, 108))).toBe(
      '7 keys measured · tuned 6 cents sharp (A = 441.5 Hz) · Grand or large upright piano',
    );
  });
});
