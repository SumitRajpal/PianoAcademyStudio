/**
 * The lesson screen: a full-screen Skia canvas (background, top bar, staff and
 * notes), the keyboard, and the system text on top. Laid out in design points
 * (an iPhone 15 Plus in landscape) and scaled to the screen width.
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Canvas, Group, Picture } from 'react-native-skia';

import {
  CorePiano,
  drawPlayhead,
  drawStaff,
  LESSON_STAFF,
  QuarterNotes,
  recordPicture,
  useNotationTypefaces,
  usePianoState,
} from '../../motion/scenes/PianoMaster';
import {
  lineHeight,
  ROUNDED_FAMILY,
  ROUNDED_METRICS,
  SYSTEM_FAMILY,
  textTop,
} from '../../shared/typography';
import { drawLessonBackground } from './drawLessonBackground';
import {
  DESIGN_SIZE,
  LESSON_DESIGN,
  type RotatedTextRun,
  type TextRun,
} from './lessonDesign';

/** Width of the box a text run is laid out in; wider than any run. */
const TEXT_BOX = 600;

export function LessonScreen() {
  const { width, height } = useWindowDimensions();
  const scale = width / DESIGN_SIZE.width;
  const typefaces = useNotationTypefaces();
  const piano = usePianoState();
  const design = LESSON_DESIGN;

  useEffect(() => {
    // The lesson logic will light keys; nothing is lit in the design yet.
  }, [piano]);

  // The background and the staff, then the notes, then the playhead over
  // them. The notes and the playhead are drawn in design points.
  const staff = useMemo(
    () =>
      typefaces
        ? recordPicture({ width, height }, canvas => {
            canvas.scale(scale, scale);
            drawLessonBackground(canvas, height / scale);
            drawStaff(
              canvas,
              design.staff,
              design.score,
              LESSON_STAFF,
              typefaces,
            );
          })
        : null,
    [typefaces, width, height, scale, design],
  );
  const playhead = useMemo(
    () =>
      recordPicture(DESIGN_SIZE, canvas =>
        drawPlayhead(canvas, design.playhead, LESSON_STAFF),
      ),
    [design],
  );

  return (
    <View style={styles.screen}>
      <Canvas style={StyleSheet.absoluteFill} opaque>
        {staff ? (
          <>
            <Picture picture={staff} />
            <Group transform={[{ scale }]}>
              <QuarterNotes
                layout={design.staff}
                score={design.score}
                look={LESSON_STAFF}
              />
              <Picture picture={playhead} />
            </Group>
          </>
        ) : null}
      </Canvas>
      <DesignText run={design.title} scale={scale} />
      <DesignText run={design.timer} scale={scale} />
      <DesignText run={design.measureNumber} scale={scale} />
      <RotatedDesignText run={design.hand} scale={scale} />
      <CorePiano
        state={piano}
        from={design.keyboard.range.from}
        to={design.keyboard.range.to}
        labels={design.keyboard.labels}
        markers={design.keyboard.markers}
        style={[
          styles.keyboard,
          {
            top: design.keyboard.top * scale,
            width,
            height: design.keyboard.height * scale,
          },
        ]}
      />
    </View>
  );
}

function DesignText({ run, scale }: { run: TextRun; scale: number }) {
  const size = run.size * scale;
  const x = run.x * scale;
  const left =
    run.align === 'left'
      ? x
      : run.align === 'center'
      ? x - TEXT_BOX / 2
      : x - TEXT_BOX;
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        styles.text,
        {
          left,
          width: TEXT_BOX,
          top: textTop(run.baseline * scale, size),
          fontFamily: run.font === 'rounded' ? ROUNDED_FAMILY : SYSTEM_FAMILY,
          fontSize: size,
          color: run.color,
          textAlign: run.align,
        },
      ]}
    >
      {run.text}
    </Text>
  );
}

/**
 * Text turned around its centre. The box is placed so that the middle of the
 * capitals, not the middle of the line box, lands on the run's centre.
 */
function RotatedDesignText({
  run,
  scale,
}: {
  run: RotatedTextRun;
  scale: number;
}) {
  const size = run.size * scale;
  const boxHeight = lineHeight(size);
  const { ascender, descender, capHeight } = ROUNDED_METRICS;
  // How far the middle of the capitals sits below the middle of the line box.
  const inkOffset = ((ascender - descender - capHeight) / 2) * size;
  const radians = (run.rotate * Math.PI) / 180;
  const centerX = run.centerX * scale + inkOffset * Math.sin(radians);
  const centerY = run.centerY * scale - inkOffset * Math.cos(radians);
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        styles.text,
        styles.centered,
        {
          left: centerX - TEXT_BOX / 2,
          width: TEXT_BOX,
          top: centerY - boxHeight / 2,
          height: boxHeight,
          fontFamily: run.font === 'rounded' ? ROUNDED_FAMILY : SYSTEM_FAMILY,
          fontSize: size,
          color: run.color,
          transform: [{ rotate: `${run.rotate}deg` }],
        },
      ]}
    >
      {run.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: LESSON_DESIGN.bottomStrip,
  },
  keyboard: {
    position: 'absolute',
    left: 0,
  },
  centered: {
    textAlign: 'center',
  },
  text: {
    position: 'absolute',
    fontWeight: '700',
  },
});
