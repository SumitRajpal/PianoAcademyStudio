import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';

import {
  CorePiano,
  createKeyLights,
  PIANO_RANGES,
  setPressedKeys,
  usePianoState,
} from '../..';

function Keyboard(props: { from?: string; to?: string }) {
  const piano = usePianoState();
  return <CorePiano state={piano} {...props} />;
}

async function render(element: ReactElement) {
  let renderer: ReactTestRenderer | undefined;
  await act(() => {
    renderer = create(element);
  });
  return renderer!;
}

describe('CorePiano', () => {
  it('describes the default four-octave keyboard to screen readers', async () => {
    const renderer = await render(<Keyboard />);
    expect(
      renderer.root.findByProps({
        accessibilityLabel: 'Piano keyboard, 48 keys from C2 to B5',
      }),
    ).toBeTruthy();
  });

  it('draws any declared range, such as 108 keys', async () => {
    const renderer = await render(<Keyboard {...PIANO_RANGES.extended108} />);
    expect(
      renderer.root.findByProps({
        accessibilityLabel: 'Piano keyboard, 108 keys from C0 to B8',
      }),
    ).toBeTruthy();
  });

  it('accepts external chords without re-rendering the controller', async () => {
    const piano = makeMutable(createKeyLights());
    const rendered = jest.fn();
    function Controller() {
      rendered();
      return <CorePiano state={piano} />;
    }
    const renderer = await render(<Controller />);
    await act(() => {
      setPressedKeys(piano, ['C4', 'C#4', 'E4']);
      setPressedKeys(piano, ['D4', 'F#4']);
      setPressedKeys(piano, []);
    });
    expect(rendered).toHaveBeenCalledTimes(1);
    expect(piano.value).toEqual(createKeyLights());
    await act(() => renderer.unmount());
  });
});
