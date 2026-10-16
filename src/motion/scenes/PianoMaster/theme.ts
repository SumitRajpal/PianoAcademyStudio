import { KeyRole } from './pianoState';

/** Colours of lit keys, one per role. */
export type RoleColors = {
  pressed: string;
  target: string;
  correct: string;
  wrong: string;
};

export const DEFAULT_ROLE_COLORS: RoleColors = {
  pressed: '#64D2FF',
  target: '#FFD60A',
  correct: '#30D158',
  wrong: '#FF453A',
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
