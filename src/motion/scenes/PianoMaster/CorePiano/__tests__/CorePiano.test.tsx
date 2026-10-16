import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CorePiano, PIANO_RANGES, usePianoState } from '../..';

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
});
