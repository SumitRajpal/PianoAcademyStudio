/**
 * Piano Academy Studio
 *
 * @purpose Root component: safe-area provider, hidden status bar and the lesson screen, full screen in landscape.
 * @format
 */

import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LessonScreen } from './src/screens/LessonScreen';

function App() {
  return (
    <SafeAreaProvider>
      {/* Full screen: no status bar. */}
      <StatusBar hidden />
      <LessonScreen />
    </SafeAreaProvider>
  );
}

export default App;
