/**
 * The unit of every piano look: the white key pitch of the reference lesson
 * screen (iPhone 15 Plus: 28 white keys across 932 points, keyboard 121.67
 * points tall, so the pitch is 33.29 points).
 *
 * Looks store sizes as shares of the pitch, so they hold at any size and range:
 * - widths, radii, blurs and offsets are shares of the white key pitch;
 * - positions along a black key are shares of its length;
 * - heights across the keyboard are shares of the keyboard height.
 */

export const REFERENCE_PITCH = 932 / 28;

/** Points measured on the reference screen, as a share of the pitch. */
export const pt = (points: number) => points / REFERENCE_PITCH;
