/**
 * The calibration screen, shown when the app starts. It looks like the
 * lesson screen, with the white paper asking the questions where the lesson
 * prints its music. The keyboard below matches the user's piano: it lights
 * the key to play, shows every key the mic hears as it is played, and turns
 * a key green or red as each strike is checked. Saving goes on to the lesson.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Canvas, Picture } from 'react-native-skia';

import {
  CorePiano,
  KEYBOARD_CHOICES,
  keyboardChoiceFor,
  KeyRole,
  lightKey,
  recordPicture,
  unlightAllKeys,
  unlightKey,
  useCorePianoNotesDetection,
  usePianoState,
  type KeyboardChoice,
  type NoteInput,
} from '../../motion/scenes/PianoMaster';
import { layoutCorePiano } from '../../motion/scenes/PianoMaster/CorePiano';
import { buildKeyboard, noteName } from '../../shared/piano';
import { ROUNDED_FAMILY, textTop } from '../../shared/typography';
import { DESIGN_SIZE } from '../LessonScreen';
import {
  CALIBRATION_DESIGN,
  calloutPlacement,
  choiceBox,
  type CalibrationText,
  type DesignBox,
} from './calibrationDesign';
import {
  calibrationView,
  type CalibrationChoice,
  type CalibrationStep,
} from './calibrationView';
import { drawCalibrationBackground } from './drawCalibrationBackground';

/** Width of the box a line on the paper is laid out in, in design points. */
const PAPER_TEXT_WIDTH = 760;
const LINK_WIDTH = 160;
const MARKERS: readonly NoteInput[] = ['C4'];

export type CalibrationScreenProps = {
  /** Called once the user has saved the calibration. */
  onSaved: () => void;
};

export function CalibrationScreen({ onSaved }: CalibrationScreenProps) {
  const { width, height } = useWindowDimensions();
  const scale = width / DESIGN_SIZE.width;
  const design = CALIBRATION_DESIGN;
  const piano = usePianoState();
  const {
    calibrationEvent,
    profile,
    status,
    startCalibration,
    stopCalibration,
    saveCalibration,
  } = useCorePianoNotesDetection({ pianoState: piano });

  const [step, setStep] = useState<CalibrationStep>('keyboard');
  const [keyboard, setKeyboard] = useState<KeyboardChoice>(() =>
    keyboardChoiceFor(profile),
  );
  const [saveFailed, setSaveFailed] = useState(false);

  const event = step === 'listening' ? calibrationEvent : null;
  const view = calibrationView({
    step,
    keyboard,
    event,
    profile,
    status,
    saveFailed,
  });

  // The keys on CorePiano: the one to play, then a moment of green (measured)
  // or red (the key played instead) after each strike; when done, every key
  // that was measured. The keys the mic hears light by themselves.
  const { target, finished } = view;
  const flashMidi = view.flash?.midi ?? -1;
  const flashRole = view.flash?.role;
  const measuredKeys = finished ? profile?.measuredKeys : undefined;
  useEffect(() => {
    unlightAllKeys(piano);
    if (measuredKeys) {
      measuredKeys.forEach(midi => lightKey(piano, midi, KeyRole.Correct));
      return;
    }
    if (target >= 0) {
      lightKey(piano, target, KeyRole.Target);
    }
    if (flashMidi < 0) {
      return;
    }
    lightKey(
      piano,
      flashMidi,
      flashRole === 'correct' ? KeyRole.Correct : KeyRole.Wrong,
    );
    const timer = setTimeout(() => {
      if (flashMidi === target) {
        lightKey(piano, target, KeyRole.Target);
      } else {
        unlightKey(piano, flashMidi);
      }
    }, design.feedbackFlashMs);
    return () => clearTimeout(timer);
  }, [piano, event, target, flashMidi, flashRole, measuredKeys, design]);

  // Leaving mid-calibration stops it.
  const calibrating = useRef(false);
  calibrating.current = step === 'listening' && !finished;
  useEffect(
    () => () => {
      if (calibrating.current) {
        stopCalibration();
      }
    },
    [stopCalibration],
  );

  const keys = useMemo(
    () => buildKeyboard({ from: keyboard.from, to: keyboard.to }),
    [keyboard],
  );
  const cLabels = useMemo(
    () => keys.filter(key => key.midi % 12 === 0).map(key => key.midi),
    [keys],
  );
  const keyLayout = useMemo(
    () =>
      layoutCorePiano(keys, {
        width: DESIGN_SIZE.width,
        height: design.keyboard.height,
      }),
    [keys, design],
  );
  const targetKey =
    target >= 0 ? keyLayout.rects.find(key => key.midi === target) : undefined;
  const calloutX = targetKey ? targetKey.x + targetKey.width / 2 : null;

  const backdrop = useMemo(
    () =>
      recordPicture({ width, height }, canvas => {
        canvas.scale(scale, scale);
        drawCalibrationBackground(canvas, height / scale, {
          progress: view.progress,
          calloutX,
        });
      }),
    [width, height, scale, view.progress, calloutX],
  );

  const choose = (id: string) => {
    if (step === 'keyboard') {
      const chosen = KEYBOARD_CHOICES.find(k => k.id === id);
      if (chosen) {
        setKeyboard(chosen);
        setStep('thoroughness');
      }
    } else if (step === 'thoroughness') {
      setSaveFailed(false);
      startCalibration({
        fullMode: id === 'thorough',
        lowestMidi: keyboard.lowestMidi,
        highestMidi: keyboard.highestMidi,
      });
      setStep('listening');
    } else if (id === 'save') {
      if (saveCalibration()) {
        onSaved();
      } else {
        setSaveFailed(true);
      }
    }
  };

  const followLink = (id: 'back' | 'startOver') => {
    if (id === 'startOver') {
      stopCalibration();
    }
    setSaveFailed(false);
    setStep('keyboard');
  };

  const feedbackRun = view.finished
    ? design.saveFeedback
    : {
        ...design.feedback,
        color:
          view.feedback?.tone === 'problem'
            ? design.feedbackProblem
            : design.feedback.color,
      };

  return (
    <View style={styles.screen}>
      <Canvas style={StyleSheet.absoluteFill} opaque>
        <Picture picture={backdrop} />
      </Canvas>

      <PlacedText
        run={design.title}
        text="Calibrate your piano"
        scale={scale}
      />
      <ListeningBadge
        on={view.listening.on}
        text={view.listening.text}
        scale={scale}
      />

      <PlacedText
        run={design.eyebrow}
        text={view.eyebrow}
        scale={scale}
        style={{ letterSpacing: design.eyebrowSpacing * scale }}
      />
      {view.link ? (
        <PlacedText
          run={design.link}
          text={view.link.text}
          scale={scale}
          boxWidth={LINK_WIDTH}
          onPress={() => followLink(view.link!.id)}
        />
      ) : null}
      <PlacedText run={design.question} text={view.question} scale={scale} />
      {view.detail ? (
        <PlacedText run={design.detail} text={view.detail} scale={scale} />
      ) : null}
      {view.feedback ? (
        <PlacedText run={feedbackRun} text={view.feedback.text} scale={scale} />
      ) : null}
      {view.choices.map((choice, index) => (
        <ChoiceButton
          key={choice.id}
          choice={choice}
          box={choiceBox(index, view.choiceWidth)}
          scale={scale}
          onPress={() => choose(choice.id)}
        />
      ))}

      {calloutX !== null ? (
        <CalloutLabel midi={target} centerX={calloutX} scale={scale} />
      ) : null}

      <CorePiano
        state={piano}
        from={keyboard.from}
        to={keyboard.to}
        labels={cLabels}
        markers={MARKERS}
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

/** One line of text placed by its baseline, like the lesson screen's text. */
function PlacedText({
  run,
  text,
  scale,
  boxWidth = PAPER_TEXT_WIDTH,
  style,
  onPress,
}: {
  run: CalibrationText;
  text: string;
  scale: number;
  boxWidth?: number;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
}) {
  const size = run.size * scale;
  const x = run.x * scale;
  const box = boxWidth * scale;
  const left =
    run.align === 'left' ? x : run.align === 'center' ? x - box / 2 : x - box;
  const top = textTop(run.baseline * scale, size);
  // Inside a Pressable the text sits at the Pressable's origin.
  const place = onPress ? styles.origin : { left, top };
  const label = (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={[
        styles.text,
        place,
        {
          width: box,
          fontFamily: ROUNDED_FAMILY,
          fontSize: size,
          fontWeight: run.weight,
          color: run.color,
          textAlign: run.align,
        },
        style,
      ]}
    >
      {text}
    </Text>
  );
  if (!onPress) {
    return label;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={12 * scale}
      onPress={onPress}
      style={[
        styles.pressable,
        {
          left,
          top,
          width: box,
          height: size * 1.3,
        },
      ]}
    >
      {label}
    </Pressable>
  );
}

function ChoiceButton({
  choice,
  box,
  scale,
  onPress,
}: {
  choice: CalibrationChoice;
  box: DesignBox;
  scale: number;
  onPress: () => void;
}) {
  const look = CALIBRATION_DESIGN.choices;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        choice.caption ? `${choice.label}, ${choice.caption}` : choice.label
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          left: box.x * scale,
          top: box.y * scale,
          width: box.width * scale,
          height: box.height * scale,
          borderRadius: look.radius * scale,
          backgroundColor: choice.chosen ? look.chosenFill : look.fill,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[
          styles.choiceLabel,
          {
            fontSize: look.label.size * scale,
            color: choice.chosen ? look.label.chosenColor : look.label.color,
          },
        ]}
      >
        {choice.label}
      </Text>
      {choice.caption ? (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.choiceCaption,
            {
              fontSize: look.caption.size * scale,
              color: choice.chosen
                ? look.caption.chosenColor
                : look.caption.color,
            },
          ]}
        >
          {choice.caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The name of the key to play, in the callout drawn over it. */
function CalloutLabel({
  midi,
  centerX,
  scale,
}: {
  midi: number;
  centerX: number;
  scale: number;
}) {
  const callout = CALIBRATION_DESIGN.callout;
  const { box } = calloutPlacement(centerX);
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        styles.callout,
        {
          left: box.x * scale,
          top: box.y * scale,
          width: box.width * scale,
          height: box.height * scale,
          lineHeight: box.height * scale,
          fontSize: callout.text.size * scale,
          color: callout.text.color,
        },
      ]}
    >
      {noteName(midi)}
    </Text>
  );
}

/** Top right: a dot and whether the mic is listening. */
function ListeningBadge({
  on,
  text,
  scale,
}: {
  on: boolean;
  text: string;
  scale: number;
}) {
  const run = CALIBRATION_DESIGN.listening;
  const dot = CALIBRATION_DESIGN.listeningDot;
  const size = run.size * scale;
  return (
    <View
      style={[
        styles.badge,
        {
          right: (DESIGN_SIZE.width - run.x) * scale,
          top: textTop(run.baseline * scale, size),
          gap: dot.gap * scale,
        },
      ]}
    >
      <View
        style={{
          width: dot.radius * 2 * scale,
          height: dot.radius * 2 * scale,
          borderRadius: dot.radius * scale,
          backgroundColor: on ? dot.on : dot.off,
        }}
      />
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={{
          fontFamily: ROUNDED_FAMILY,
          fontSize: size,
          fontWeight: run.weight,
          color: run.color,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CALIBRATION_DESIGN.bottomStrip,
  },
  keyboard: {
    position: 'absolute',
    left: 0,
  },
  text: {
    position: 'absolute',
  },
  origin: {
    left: 0,
    top: 0,
  },
  pressable: {
    position: 'absolute',
  },
  choice: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceLabel: {
    fontFamily: ROUNDED_FAMILY,
    fontWeight: '700',
  },
  choiceCaption: {
    fontFamily: ROUNDED_FAMILY,
    fontWeight: '400',
    marginTop: 1,
  },
  callout: {
    position: 'absolute',
    fontFamily: ROUNDED_FAMILY,
    fontWeight: '700',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
});
