/**
 * Piano Academy Studio
 *
 * @purpose Root component: safe-area provider, hidden status bar, and the two screens: calibration first (every launch), then the lesson with real-time acoustic pitch detection.
 * @format
 */

import { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  CorePianoNotesDetection,
  usePianoState,
} from './src/motion/scenes/PianoMaster';
import { CalibrationScreen } from './src/screens/CalibrationScreen';
import { LessonScreen } from './src/screens/LessonScreen';

function MainScreen({ onCalibrate }: { onCalibrate: () => void }) {
  const piano = usePianoState();

  return (
    <View style={styles.container}>
      <LessonScreen pianoState={piano} />
      <CorePianoNotesDetection
        pianoState={piano}
        showDiagnostics
        autoStart
        onCalibrate={onCalibrate}
      />
    </View>
  );
}

function App() {
  // Every launch starts with calibration; saving it opens the lesson.
  const [screen, setScreen] = useState<'calibration' | 'lesson'>('calibration');

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {screen === 'calibration' ? (
        <CalibrationScreen onSaved={() => setScreen('lesson')} />
      ) : (
        <MainScreen onCalibrate={() => setScreen('calibration')} />
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
