import { KeyRole } from './pianoState';

/** Colours of lit keys, one per role. */
export type RoleColors = {
  pressed: string;
  target: string;
  correct: string;
  wrong: string;
};

/**
 * Key faces; the pressed renderers add depth without neon or glow. Pressed is
 * a warm marigold, stronger than the pastel lesson roles, so a key the player
 * holds stands out and is never mistaken for a target (cream).
 */
export const DEFAULT_ROLE_COLORS: RoleColors = {
  pressed: '#FFB648',
  target: '#F5E6B8',
  correct: '#BFE8CE',
  wrong: '#F2C4CB',
};

/**
 * Lit-key colours indexed by KeyRole, for lookups on the UI thread.
 * A key lit without a role shows as pressed.
 */
export function roleColors(colors: RoleColors): string[] {
  const indexed: string[] = [];
  indexed[KeyRole.None] = colors.pressed;
  indexed[KeyRole.Pressed] = colors.pressed;
  indexed[KeyRole.Target] = colors.target;
  indexed[KeyRole.Correct] = colors.correct;
  indexed[KeyRole.Wrong] = colors.wrong;
  return indexed;
}
