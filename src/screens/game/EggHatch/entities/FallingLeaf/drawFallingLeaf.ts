/** One drifting leaf centred on (0,0), pointing up; `variant` picks its colour. */

import type { SkCanvas } from 'react-native-skia';

import { fill, stroke } from '../../shared/paperKit';
import { leafPath, leafVeinPath } from '../../shared/paperShapes';
import { FALLING_LEAF_LOOK, type FallingLeafLook } from './fallingLeafLook';

export function drawFallingLeaf(canvas: SkCanvas, size: number, variant: number, look: FallingLeafLook = FALLING_LEAF_LOOK) {
  const base = { x: 0, y: size / 2 };
  canvas.drawPath(leafPath(base, size, size * 0.42, -90, 0.3), fill(look.leaves[variant % look.leaves.length]));
  canvas.drawPath(leafVeinPath(base, size, -90, 0.3), stroke(look.vein, 0.6, 0.4));
}
