import { StyleSheet, Text } from 'react-native';

import { ROUNDED_FAMILY, textTop } from '../../../../../shared/typography';
import type { PianoKeyLabelLayout } from './layoutPianoKeyLabels';

export type PianoKeyLabelProps = {
  label: PianoKeyLabelLayout;
  /** White key pitch: the name is centred in a box two pitches wide. */
  pitch: number;
};

/** One note name, as system text (SF Pro Rounded) laid over the keys. */
export function PianoKeyLabel({ label, pitch }: PianoKeyLabelProps) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        styles.label,
        {
          left: label.centerX - pitch,
          width: 2 * pitch,
          top: textTop(label.baseline, label.size),
          fontSize: label.size,
          color: label.color,
        },
      ]}
    >
      {label.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    textAlign: 'center',
    fontFamily: ROUNDED_FAMILY,
    fontWeight: '700',
  },
});
