/**
 * @purpose The system fonts (SF Pro and SF Pro Rounded) and their metrics, so text can be placed by its baseline.
 */

/** React Native font family for SF Pro Rounded on iOS. */
export const ROUNDED_FAMILY = 'ui-rounded';

/** React Native font family for SF Pro, the default iOS font. */
export const SYSTEM_FAMILY = 'System';

/** Vertical metrics of SF Pro Rounded and SF Pro (they share them), as shares of the font size. */
export const ROUNDED_METRICS = {
  ascender: 1980 / 2048,
  descender: 432 / 2048,
  capHeight: 1443 / 2048,
};

/** Top of a one-line text box whose baseline should sit at `baseline`. */
export function textTop(baseline: number, size: number): number {
  return baseline - ROUNDED_METRICS.ascender * size;
}

/** Height of a one-line text box. */
export function lineHeight(size: number): number {
  return (ROUNDED_METRICS.ascender + ROUNDED_METRICS.descender) * size;
}
