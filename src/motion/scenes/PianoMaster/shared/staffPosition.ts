/**
 * Where a staff is: the height of its top line, and the distance between two
 * lines (one staff space). Symbols that sit on a line use it to find it.
 */
export type StaffPosition = { top: number; space: number };

/**
 * Height of a staff line. Lines are numbered as in music, from 1 at the
 * bottom to 5 at the top: on a treble staff, line 2 is G4 and line 3 is B4.
 */
export function staffLineY(staff: StaffPosition, line: number): number {
  return staff.top + (5 - line) * staff.space;
}
