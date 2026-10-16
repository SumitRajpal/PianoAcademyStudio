import { useTypeface } from 'react-native-skia';

import type { NotationTypefaces } from './drawStaff';

/** Loads the music fonts; null until both are ready. */
export function useNotationTypefaces(): NotationTypefaces | null {
  const bravura = useTypeface(
    require('../../../../../assets/fonts/Bravura.otf'),
  );
  const leland = useTypeface(require('../../../../../assets/fonts/Leland.otf'));
  return bravura && leland ? { bravura, leland } : null;
}
