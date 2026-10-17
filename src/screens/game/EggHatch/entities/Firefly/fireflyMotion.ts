/**
 * Where each firefly is at time `t` (seconds): a slow looping wander around
 * its home spot plus a blink. Pure worklet maths, so the app runs it on the
 * UI thread every frame and the headless render calls it directly.
 */

export type FireflyPose = { x: number; y: number; r: number; glow: number; warm: boolean };

/** Fixed home spots and phases (deterministic, no random at runtime). */
export const FIREFLY_HOMES = Array.from({ length: 26 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  const fa = a - Math.floor(a);
  const fb = b - Math.floor(b);
  return {
    x: 30 + fa * 872,
    y: 120 + fb * 280,
    phase: fa * 6.28,
    speed: 0.25 + fb * 0.35,
    warm: i % 3 !== 0,
  };
});

export function fireflyPose(i: number, t: number): FireflyPose {
  'worklet';
  const h = FIREFLY_HOMES[i];
  const s = t * h.speed + h.phase;
  const blink = 0.5 + 0.5 * Math.sin(t * (1.6 + h.speed * 2) + h.phase * 3);
  return {
    x: h.x + Math.sin(s) * 26 + Math.sin(s * 2.3) * 9,
    y: h.y + Math.cos(s * 1.3) * 16,
    r: 1.2 + blink * 1.3,
    glow: 0.25 + blink * 0.75,
    warm: h.warm,
  };
}
