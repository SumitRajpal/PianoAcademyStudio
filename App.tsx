/**
 * Piano Academy Studio
 *
 * @purpose Root component: safe-area provider, hidden status bar and the lesson screen, full screen in landscape.
 * @format
 */

import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EggHatch } from './src/screens/game/EggHatch';

// function DemoLesson() {
//   const piano = usePianoState();
//
//   useEffect(() => {
//     // Press a demo chord on startup: C4, E4, G4 (C major)
//     setPressedKeys(piano, ['C4', 'E4', 'G4']);
//   }, [piano]);
//
//   return <LessonScreen pianoState={piano} />;
// }

function App() {
  return (
    <SafeAreaProvider>
      {/* Full screen: no status bar. */}
      <StatusBar hidden />
      {/* <DemoLesson /> */}
      <EggHatch
        onNoteHit={letter => console.log(`Ghost ${letter} hit!`)}
        onHatchComplete={() => console.log('Chicken emerged!')}
      />
    </SafeAreaProvider>
  );
}

export default App;
