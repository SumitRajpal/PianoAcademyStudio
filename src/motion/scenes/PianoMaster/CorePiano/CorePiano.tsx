/**
 * The piano keyboard, drawn with React Native Skia from one WhitePianoKey and
 * one BlackPianoKey, each drawn at every position of its colour.
 *
 * The keys are recorded into two pictures, white keys then black keys, only
 * when the range, size or look changes. Lit keys sit between and above them
 * in two pictures recorded on the UI thread whenever the key state changes,
 * so lighting keys costs no React render and no work on the JS thread.
 * Note names are system text (SF Pro Rounded) laid over the canvas.
 */

import { useMemo } from 'react';
import {
  PixelRatio,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Canvas, Picture, useCanvasSize } from 'react-native-skia';

import {
  buildKeyboard,
  DEFAULT_RANGE,
  parseNote,
  type KeyboardProportions,
  type NoteInput,
} from '../../../../shared/piano';
import {
  DEFAULT_ROLE_COLORS,
  recordPicture,
  roleColors,
  type PianoState,
  type RoleColors,
} from '../shared';
import {
  drawBlackPianoKeyLight,
  makeBlackPianoKeyLight,
} from './BlackPianoKey';
import { LESSON_PIANO_LOOK, type CorePianoLook } from './corePianoLook';
import {
  drawCorePianoBlackLayer,
  drawCorePianoWhiteLayer,
} from './drawCorePiano';
import { layoutCorePiano } from './layoutCorePiano';
import {
  layoutPianoKeyLabels,
  PianoKeyLabel,
  type PianoKeyLabels,
} from './PianoKeyLabel';
import { usePianoKeyLights } from './usePianoKeyLights';
import {
  drawWhitePianoKeyLight,
  makeWhitePianoKeyLight,
} from './WhitePianoKey';

export type CorePianoProps = {
  /**
   * Key state from usePianoState(). Input presses keys with pressKey /
   * releaseKey, or setPressedKeys(state, ['C4', 'C#4', 'E4']) for the whole
   * held set; lessons light keys with lightKey. Several keyboards can share
   * one state.
   */
  state: PianoState;
  /** Lowest note, as a name ("C2") or a MIDI number (36). Defaults to C2. */
  from?: NoteInput;
  /** Highest note. Defaults to B5: with C2, the four-octave lesson keyboard. */
  to?: NoteInput;
  /**
   * Note names to show. Defaults to "white". Names hide themselves when the
   * keys are too narrow to read them.
   */
  labels?: PianoKeyLabels;
  /** Keys with a dot under their name, such as middle C. */
  markers?: readonly NoteInput[];
  /** Pass a stable object: a new one on every render rebuilds the layout. */
  proportions?: Partial<KeyboardProportions>;
  look?: CorePianoLook;
  /** Pass a stable object: a new one on every render rebuilds the colours. */
  roles?: Partial<RoleColors>;
  style?: StyleProp<ViewStyle>;
};

const NO_MARKERS: readonly NoteInput[] = [];

export function CorePiano({
  state,
  from = DEFAULT_RANGE.from,
  to = DEFAULT_RANGE.to,
  labels = 'white',
  markers = NO_MARKERS,
  proportions,
  look = LESSON_PIANO_LOOK,
  roles,
  style,
}: CorePianoProps) {
  const { size, onLayout } = useCanvasSize();
  const keys = useMemo(() => buildKeyboard({ from, to }), [from, to]);
  const layout = useMemo(
    () => layoutCorePiano(keys, size, proportions, PixelRatio.get()),
    [keys, size, proportions],
  );
  const { whites, blacks, pitch } = layout;
  const marked = useMemo(
    () => new Set(markers.map(note => parseNote(note))),
    [markers],
  );

  const whiteLayer = useMemo(
    () =>
      recordPicture(size, canvas =>
        drawCorePianoWhiteLayer(canvas, layout, size, look, marked),
      ),
    [layout, size, look, marked],
  );
  const blackLayer = useMemo(
    () =>
      recordPicture(size, canvas =>
        drawCorePianoBlackLayer(canvas, layout, size, look),
      ),
    [layout, size, look],
  );

  const colors = useMemo(
    () => roleColors({ ...DEFAULT_ROLE_COLORS, ...roles }),
    [roles],
  );
  const whiteLights = usePianoKeyLights(
    state,
    {
      keys: whites,
      look: look.whiteKey,
      pitch,
      makeLight: makeWhitePianoKeyLight,
      drawLight: drawWhitePianoKeyLight,
    },
    colors,
    size,
  );
  const blackLights = usePianoKeyLights(
    state,
    {
      keys: blacks,
      look: look.blackKey,
      pitch,
      makeLight: makeBlackPianoKeyLight,
      drawLight: drawBlackPianoKeyLight,
    },
    colors,
    size,
  );

  const names = useMemo(
    () => layoutPianoKeyLabels(layout.rects, labels, look.label, pitch),
    [layout.rects, labels, look.label, pitch],
  );

  const first = keys[0];
  const last = keys[keys.length - 1];

  return (
    <View
      style={style}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Piano keyboard, ${keys.length} keys from ${first.name} to ${last.name}`}
    >
      <Canvas style={StyleSheet.absoluteFill} opaque>
        <Picture picture={whiteLayer} />
        <Picture picture={whiteLights} />
        <Picture picture={blackLayer} />
        <Picture picture={blackLights} />
      </Canvas>
      {names.map(name => (
        <PianoKeyLabel key={name.midi} label={name} pitch={pitch} />
      ))}
    </View>
  );
}
