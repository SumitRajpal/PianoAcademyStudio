/**
 * The piano keyboard, drawn with React Native Skia.
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
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import {
  Canvas,
  ClipOp,
  Picture,
  Skia,
  useCanvasSize,
} from 'react-native-skia';

import {
  buildKeyboard,
  DEFAULT_RANGE,
  layoutKeyboard,
  parseNote,
  type KeyboardProportions,
  type KeyRect,
  type NoteInput,
} from '../../../shared/piano';
import { ROUNDED_FAMILY, textTop } from '../../../shared/typography';
import {
  drawBlackLayer,
  drawWhiteLayer,
  pitchOf,
  recordPicture,
  type Size,
} from './drawKeyboard';
import { LESSON_LOOK, type KeyboardLook } from './keyboardLook';
import { keyLabels, type PianoLabels } from './labels';
import { KeyRole, type PianoState } from './pianoState';
import { DEFAULT_ROLE_COLORS, roleColors, type RoleColors } from './theme';

export type PianoMasterProps = {
  /** Key state from usePianoState(). Several keyboards can share one state. */
  state: PianoState;
  /** Lowest note, as a name ("C2") or a MIDI number (36). Defaults to C2. */
  from?: NoteInput;
  /** Highest note. Defaults to B5: with C2, the four-octave lesson keyboard. */
  to?: NoteInput;
  /**
   * Note names to show. Defaults to "white". Names hide themselves when the
   * keys are too narrow to read them.
   */
  labels?: PianoLabels;
  /** Keys with a dot under their name, such as middle C. */
  markers?: readonly NoteInput[];
  /** Pass a stable object: a new one on every render rebuilds the layout. */
  proportions?: Partial<KeyboardProportions>;
  look?: KeyboardLook;
  /** Pass a stable object: a new one on every render rebuilds the colours. */
  roles?: Partial<RoleColors>;
  style?: StyleProp<ViewStyle>;
};

const NO_MARKERS: readonly NoteInput[] = [];

export function PianoMaster({
  state,
  from = DEFAULT_RANGE.from,
  to = DEFAULT_RANGE.to,
  labels = 'white',
  markers = NO_MARKERS,
  proportions,
  look = LESSON_LOOK,
  roles,
  style,
}: PianoMasterProps) {
  const { size, onLayout } = useCanvasSize();
  const keys = useMemo(() => buildKeyboard({ from, to }), [from, to]);
  const rects = useMemo(
    () => layoutKeyboard(keys, size, proportions, PixelRatio.get()),
    [keys, size, proportions],
  );
  const whites = useMemo(() => rects.filter(key => !key.isBlack), [rects]);
  const blacks = useMemo(() => rects.filter(key => key.isBlack), [rects]);
  const pitch = pitchOf(rects, size.width);
  const marked = useMemo(
    () => new Set(markers.map(note => parseNote(note))),
    [markers],
  );

  const whiteKeys = useMemo(
    () =>
      recordPicture(size, canvas =>
        drawWhiteLayer(canvas, rects, size, look, marked),
      ),
    [rects, size, look, marked],
  );
  const blackKeys = useMemo(
    () =>
      recordPicture(size, canvas => drawBlackLayer(canvas, rects, size, look)),
    [rects, size, look],
  );

  const colors = useMemo(
    () => roleColors({ ...DEFAULT_ROLE_COLORS, ...roles }),
    [roles],
  );
  const whiteLights = useLitKeys(
    state,
    whites,
    colors,
    look.white.cornerRadius * pitch,
    size,
  );
  const blackLights = useLitKeys(
    state,
    blacks,
    colors,
    look.black.cornerRadius * pitch,
    size,
  );

  const names = useMemo(
    () => keyLabels(rects, labels, look, pitch),
    [rects, labels, look, pitch],
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
        <Picture picture={whiteKeys} />
        <Picture picture={whiteLights} />
        <Picture picture={blackKeys} />
        <Picture picture={blackLights} />
      </Canvas>
      {names.map(name => (
        <Text
          key={name.midi}
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.name,
            {
              left: name.centerX - pitch,
              width: 2 * pitch,
              top: textTop(name.baseline, name.size),
              fontSize: name.size,
              color: name.color,
            },
          ]}
        >
          {name.text}
        </Text>
      ))}
    </View>
  );
}

type LitKey = Pick<KeyRect, 'midi' | 'x' | 'y' | 'width' | 'height'>;

/**
 * Records the lit keys among `rects` into a picture, on the UI thread, every
 * time the key state changes. On native, Reanimated finds the values this
 * depends on from what the worklet uses, so it takes no dependency list.
 */
function useLitKeys(
  state: PianoState,
  rects: KeyRect[],
  colors: string[],
  radius: number,
  size: Size,
) {
  const tools = useMemo(() => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    return { recorder: Skia.PictureRecorder(), paint };
  }, []);
  const litKeys = useMemo<LitKey[]>(
    () =>
      rects.map(({ midi, x, y, width, height }) => ({
        midi,
        x,
        y,
        width,
        height,
      })),
    [rects],
  );
  const { width, height } = size;

  return useDerivedValue(() => {
    const { recorder, paint } = tools;
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const lights = state.value;
    for (let i = 0; i < litKeys.length; i++) {
      const key = litKeys[i];
      const level = lights.levels[key.midi];
      if (level > 0) {
        const color = Skia.Color(
          colors[lights.roles[key.midi]] ?? colors[KeyRole.Pressed],
        );
        color[3] *= level;
        paint.setColor(color);
        canvas.save();
        canvas.clipRect(
          Skia.XYWHRect(key.x, key.y, key.width, key.height),
          ClipOp.Intersect,
          true,
        );
        canvas.drawRRect(
          Skia.RRectXY(
            Skia.XYWHRect(
              key.x,
              key.y - radius,
              key.width,
              key.height + radius,
            ),
            radius,
            radius,
          ),
          paint,
        );
        canvas.restore();
      }
    }
    return recorder.finishRecordingAsPicture();
  });
}

const styles = StyleSheet.create({
  name: {
    position: 'absolute',
    textAlign: 'center',
    fontFamily: ROUNDED_FAMILY,
    fontWeight: '700',
  },
});
