import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { makeMutable } from 'react-native-reanimated';
import {
  act,
  create as createRenderer,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

import { mockAudioEngine, noteEventBus } from '@pianoacademy/core-engine';
import {
  createKeyLights,
  isKeyPressed,
} from '../../../motion/scenes/PianoMaster';
import { EngineDiagnostics, STATUS_MESSAGES } from '..';

// Every renderer is unmounted after its test: the overlay polls timing stats on an interval.
const mounted: ReactTestRenderer[] = [];
function create(element: React.ReactElement): ReactTestRenderer {
  const renderer = createRenderer(element);
  mounted.push(renderer);
  return renderer;
}

function textOf(node: ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    )
    .join(' | ');
}

function pressText(root: ReactTestInstance, label: string) {
  const button = root
    .findAllByType(TouchableOpacity)
    .find(b => textOf(b).includes(label));
  if (!button) throw new Error(`No button "${label}"`);
  act(() => {
    button.props.onPress();
  });
}

describe('EngineDiagnostics', () => {
  beforeEach(() => {
    noteEventBus.clear();
    mockAudioEngine.stopDetector();
  });

  afterEach(() => {
    act(() => {
      while (mounted.length > 0) mounted.pop()?.unmount();
    });
    noteEventBus.clear();
    mockAudioEngine.stopDetector();
  });

  it('renders diagnostic HUD overlay when showDiagnostics is true', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<EngineDiagnostics showDiagnostics={true} />);
    });

    expect(renderer.toJSON()).not.toBeNull();

    // When NoteOn occurs, HUD reflects detected note name
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOn',
        midi: 69,
        cents: 3.0,
        velocity: 0.8,
        tMs: 100,
      });
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('A4');
  });

  it("lights the lesson keyboard it is given, through PianoMaster's key sink", async () => {
    const piano = makeMutable(createKeyLights());
    await act(async () => {
      create(<EngineDiagnostics pianoState={piano} />);
    });
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOn',
        midi: 64,
        cents: -1.2,
        velocity: 0.9,
        tMs: 150,
      });
    });
    expect(isKeyPressed(piano, 64)).toBe(true);
    expect(piano.value.pressed[64]).toBe(0.9);
    await act(async () => {
      noteEventBus.publishNote({
        type: 'noteOff',
        midi: 64,
        cents: 0,
        velocity: 0,
        tMs: 400,
      });
    });
    expect(isKeyPressed(piano, 64)).toBe(false);
  });

  it('offers Calibrate only when the app can open the calibration screen', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<EngineDiagnostics showDiagnostics />);
    });
    expect(renderer.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    const onCalibrate = jest.fn();
    await act(async () => {
      renderer.update(
        <EngineDiagnostics showDiagnostics onCalibrate={onCalibrate} />,
      );
    });
    pressText(renderer.root, 'Calibrate');
    expect(onCalibrate).toHaveBeenCalledTimes(1);
  });

  it('offers Record takes only when the app can open the take recorder', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<EngineDiagnostics showDiagnostics />);
    });
    expect(textOf(renderer.root)).not.toContain('Record takes');
    const onRecordTakes = jest.fn();
    await act(async () => {
      renderer.update(
        <EngineDiagnostics showDiagnostics onRecordTakes={onRecordTakes} />,
      );
    });
    pressText(renderer.root, 'Record takes');
    expect(onRecordTakes).toHaveBeenCalledTimes(1);
  });

  it('shows microphone problems the user can fix', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<EngineDiagnostics showDiagnostics />);
    });
    await act(async () => {
      noteEventBus.publishStatus({ state: 'permissionDenied', message: '' });
    });
    expect(JSON.stringify(renderer.toJSON())).toContain(
      'Microphone access is off',
    );
    await act(async () => {
      noteEventBus.publishStatus({ state: 'running', message: '' });
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain(
      'Microphone access is off',
    );
  });

  it('keeps the microphone messages word for word', () => {
    expect(STATUS_MESSAGES).toEqual({
      permissionPending: 'Waiting for microphone permission…',
      permissionDenied: 'Microphone access is off. Turn it on in Settings.',
      interrupted: 'Listening paused by another app or a call.',
      error: 'The microphone could not start.',
    });
  });
});
