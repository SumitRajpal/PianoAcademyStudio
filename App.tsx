/**
 * Piano Academy Studio
 *
 * @purpose Root component: safe-area provider, hidden status bar, and the screens: calibration first (every launch), then the lesson with real-time acoustic pitch detection; and, from either, the developer's take recorder.
 * @format
 */

import { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { takeRecorder } from '@pianoacademy/core-engine';
import { usePianoState } from './src/motion/scenes/PianoMaster';
import { CalibrationScreen } from './src/screens/CalibrationScreen';
import { EngineDiagnostics, LessonScreen } from './src/screens/LessonScreen';
import { TakeRecorderScreen } from './src/screens/TakeRecorder';

type Screen = 'calibration' | 'lesson' | 'recorder';

function MainScreen({
  onCalibrate,
  onRecordTakes,
}: {
  onCalibrate: () => void;
  onRecordTakes?: () => void;
}) {
  const piano = usePianoState();

  return (
    <View style={styles.container}>
      <LessonScreen pianoState={piano} />
      <EngineDiagnostics
        pianoState={piano}
        showDiagnostics
        autoStart
        onCalibrate={onCalibrate}
        onRecordTakes={onRecordTakes}
      />
    </View>
  );
}

function App() {
  // Every launch starts with calibration; saving it opens the lesson.
  const [screen, setScreen] = useState<Screen>('calibration');
  // The take recorder returns to the screen that opened it.
  const [recorderFrom, setRecorderFrom] = useState<Screen>('calibration');
  const openRecorder = (from: Screen) =>
    takeRecorder.isAvailable()
      ? () => {
          setRecorderFrom(from);
          setScreen('recorder');
        }
      : undefined;

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {screen === 'calibration' ? (
        <CalibrationScreen
          onSaved={() => setScreen('lesson')}
          onRecordTakes={openRecorder('calibration')}
        />
      ) : screen === 'recorder' ? (
        <TakeRecorderScreen onBack={() => setScreen(recorderFrom)} />
      ) : (
        <MainScreen
          onCalibrate={() => setScreen('calibration')}
          onRecordTakes={openRecorder('lesson')}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
