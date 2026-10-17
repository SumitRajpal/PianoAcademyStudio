/**
 * The egg's shape as numbers, in egg points (centre (0,0)), shared by the
 * drawing, the crack generator and the collision maths. Worklet-safe.
 */

/** Egg size the ornaments and cracks are laid out for, in points. */
export const MAGIC_EGG_SIZE = { width: 82, height: 108 };

/** The egg's half-width, and its reach above and below the centre. */
const RX = MAGIC_EGG_SIZE.width / 2;
const TOP = MAGIC_EGG_SIZE.height * 0.56;
const BOTTOM = MAGIC_EGG_SIZE.height * 0.44;

/** The egg's rocking pivot: the bottom of the shell, sitting in the lotus. */
export const EGG_PIVOT_Y = BOTTOM;

/**
 * The point on the shell in direction (dx, dy) from the centre, and the
 * outward normal there. The outline is treated as two half-ellipses (taller
 * on top), within about a point of the drawn egg.
 */
export function eggSurface(dx: number, dy: number) {
  'worklet';
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ry = uy < 0 ? TOP * 0.98 : BOTTOM;
  const k = 1 / Math.sqrt((ux / RX) * (ux / RX) + (uy / ry) * (uy / ry));
  const x = ux * k;
  const y = uy * k;
  // Normal of the ellipse x²/rx² + y²/ry² = 1.
  const nx = x / (RX * RX);
  const ny = y / (ry * ry);
  const nl = Math.hypot(nx, ny) || 1;
  return { x, y, nx: nx / nl, ny: ny / nl };
}
