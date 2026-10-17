/**
 * A cute note ghost, centred on its head (0,0) with head radius `r`, in two
 * pieces so it can turn without mirroring its letter:
 * - `drawGhostBody`: soft glow and a rounded, lit body with little arms and
 *   a tail curling to `tailSide`. It is shaded like a soft 3D form: light
 *   from the top-left, shadow low on the right, a warm rim light from the
 *   egg's glow behind it and a soft highlight. Both tail sides keep the same light, so the
 *   scene turns a ghost by crossfading the two, never by mirroring.
 * - `drawGhostFace`: happy face with blush, and its note letter on a badge.
 *   The scene slides it across the head to show which way the ghost looks.
 * - `drawGhostShadow`: the soft shadow it casts on the ground.
 * - `drawGhostHalo`: the warm glow around the ghost about to strike.
 * - `drawGhostStreak`: the soft motion streak behind a dashing ghost,
 *   pointing right from (0,0); the scene rotates and stretches it.
 * `drawGhostPoof` is the burst of sparkles left where it hits the egg.
 */

import { ClipOp, type SkCanvas, type SkFont } from 'react-native-skia';

import { blurred, fill, linearGradient, radialGradient, stroke } from '../../shared/paperKit';
import { ghostArmPath, ghostBodyPath, polar, sparklePath } from '../../shared/paperShapes';
import { GHOST_LOOK, type GhostLook } from './ghostLook';

export function drawGhostBody(canvas: SkCanvas, r: number, tailSide: 1 | -1, wave = 0, look: GhostLook = GHOST_LOOK) {
  const body = ghostBodyPath(r, tailSide, wave);
  // Halo.
  canvas.drawPath(body, blurred(fill(look.glow, look.glowAlpha), r * 0.45));
  // Arms, a little darker: they sit slightly behind the body.
  for (const side of [-1, 1]) {
    const arm = ghostArmPath({ x: side * r * 0.9, y: r * 0.45 }, r, side < 0 ? 150 : 30);
    canvas.drawPath(arm, radialGradient({ x: side * r * 0.9, y: r * 0.35 }, r * 0.7, [
      { color: look.body[1], at: 0 },
      { color: look.body[2], at: 1 },
    ]));
  }
  // Base form: bright where the light hits (top-left), cream towards the edge.
  canvas.drawPath(
    body,
    radialGradient({ x: -r * 0.32, y: -r * 0.42 }, r * 2.2, [
      { color: look.body[0], at: 0 },
      { color: look.body[1], at: 0.38 },
      { color: look.body[2], at: 0.8 },
    ]),
  );
  canvas.save();
  canvas.clipPath(body, ClipOp.Intersect, true);
  // Core shadow: the far side of the round form, low and to the right.
  canvas.drawPath(
    body,
    linearGradient({ x: -r * 0.5, y: -r * 0.6 }, { x: r * 0.9, y: r * 1.3 }, ['#00000000', '#00000000', look.shade], [0, 0.45, 1]),
  );
  canvas.drawOval(
    { x: r * 0.15, y: r * 0.35, width: r * 1.6, height: r * 1.3 },
    blurred(fill(look.shade, look.shadeAlpha * 0.7), r * 0.35),
  );
  // Warm rim light all round the edge, as if backlit by the egg's glow.
  canvas.drawPath(body, blurred(stroke(look.rim, r * 0.22, look.rimAlpha), r * 0.12));
  // The soft shine that makes it read as round.
  canvas.drawOval(
    { x: -r * 0.66, y: -r * 0.86, width: r * 0.62, height: r * 0.42 },
    blurred(fill(look.highlight, 0.85), r * 0.12),
  );
  canvas.restore();
}

/** The ghost's soft shadow on the ground, centred on (0,0). */
export function drawGhostShadow(canvas: SkCanvas, r: number, look: GhostLook = GHOST_LOOK) {
  canvas.drawOval(
    { x: -r * 0.9, y: -r * 0.22, width: r * 1.8, height: r * 0.44 },
    blurred(fill(look.groundShadow, look.groundShadowAlpha), r * 0.18),
  );
}

export function drawGhostFace(
  canvas: SkCanvas,
  r: number,
  letter: string,
  font: SkFont | null,
  look: GhostLook = GHOST_LOOK,
) {
  // Face: eyes, shine, blush and a little smile.
  const eye = fill(look.eye);
  for (const side of [-1, 1]) {
    canvas.drawOval({ x: side * r * 0.34 - r * 0.09, y: -r * 0.2, width: r * 0.18, height: r * 0.26 }, eye);
    canvas.drawCircle(side * r * 0.34 - r * 0.02, -r * 0.14, r * 0.04, fill('#ffffff'));
    canvas.drawOval({ x: side * r * 0.56 - r * 0.13, y: r * 0.1, width: r * 0.26, height: r * 0.14 }, fill(look.blush, 0.7));
  }
  canvas.drawArc({ x: -r * 0.12, y: r * 0.02, width: r * 0.24, height: r * 0.16 }, 10, 160, false, stroke(look.eye, Math.max(1, r * 0.06)));
  // Letter badge.
  const badgeY = r * 0.72;
  canvas.drawCircle(0, badgeY, r * 0.34, fill(look.letterBadge, 0.95));
  canvas.drawCircle(0, badgeY, r * 0.34, stroke(look.letter, Math.max(0.8, r * 0.05), 0.5));
  if (font) {
    const bounds = font.measureText(letter);
    canvas.drawText(
      letter,
      -bounds.width / 2 - bounds.x,
      badgeY - bounds.y - bounds.height / 2,
      fill(look.letter),
      font,
    );
  }
}

/** Sparkles bursting outward from (0,0); `progress` 0..1 spreads and fades them. */
export function drawGhostPoof(canvas: SkCanvas, r: number, progress: number, look: GhostLook = GHOST_LOOK) {
  const fade = 1 - progress;
  canvas.drawCircle(0, 0, r * (0.6 + progress * 1.4), blurred(fill(look.glow, 0.6 * fade), r * 0.5));
  for (let i = 0; i < 8; i++) {
    const p = polar({ x: 0, y: 0 }, r * (0.4 + progress * 1.8), i * 45 + 20);
    canvas.drawPath(sparklePath(p, r * 0.28 * fade + 0.5), fill(look.poof, fade));
  }
}

/** The warm glow around the ghost that strikes next, centred on (0,0). */
export function drawGhostHalo(canvas: SkCanvas, r: number, look: GhostLook = GHOST_LOOK) {
  canvas.drawCircle(r * 0.1, r * 0.3, r * 1.9, radialGradient({ x: r * 0.1, y: r * 0.3 }, r * 1.9, [
    { color: look.halo, alpha: 0.65, at: 0 },
    { color: look.halo, alpha: 0.25, at: 0.55 },
    { color: look.halo, alpha: 0, at: 1 },
  ]));
}

/** A soft streak of light trailing from (0,0) to the left, `length` long. */
export function drawGhostStreak(canvas: SkCanvas, r: number, length: number, look: GhostLook = GHOST_LOOK) {
  const paint = blurred(linearGradient({ x: 0, y: 0 }, { x: -length, y: 0 }, [look.glow, '#fff1c200']), r * 0.25);
  canvas.drawRRect({ rect: { x: -length, y: -r * 0.75, width: length, height: r * 1.5 }, rx: r * 0.75, ry: r * 0.75 }, paint);
}
