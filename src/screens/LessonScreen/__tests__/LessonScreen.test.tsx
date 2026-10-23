import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';

import {
  CorePiano,
  createKeyLights,
  isKeyPressed,
  setPressedKeys,
} from '../../../motion/scenes/PianoMaster';
import { LessonScreen } from '..';

describe('LessonScreen', () => {
  it('lets an external controller drive the lesson keyboard', async () => {
    const piano = makeMutable(createKeyLights());
    let renderer: ReactTestRenderer | undefined;
    await act(() => {
      renderer = create(<LessonScreen pianoState={piano} />);
    });
    expect(renderer!.root.findByType(CorePiano).props.state).toBe(piano);
    await act(() => setPressedKeys(piano, ['C4', 'C#4']));
    expect(isKeyPressed(piano, 60)).toBe(true);
    expect(isKeyPressed(piano, 61)).toBe(true);
    await act(() => renderer!.unmount());
  });
});
