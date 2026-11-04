/**
 * Visual tokens for the take recorder: a plain developer screen, dark so the
 * counts stand out, with no animation.
 */

export const TAKE_RECORDER_LOOK = {
  screen: { backgroundColor: '#0F172A', padding: 16, gap: 16 },
  panel: { backgroundColor: '#1E293B', borderRadius: 14, padding: 14 },
  text: {
    title: { color: '#F8FAFC', fontSize: 20, fontWeight: '700' as const },
    label: { color: '#94A3B8', fontSize: 12, fontWeight: '600' as const },
    body: { color: '#E2E8F0', fontSize: 13 },
    detail: { color: '#94A3B8', fontSize: 12 },
    count: { color: '#F8FAFC', fontSize: 15, fontVariant: ['tabular-nums' as const] },
    warning: { color: '#FBBF24', fontSize: 13 },
    problem: { color: '#F87171', fontSize: 13 },
  },
  chip: {
    backgroundColor: '#334155',
    selectedColor: '#2563EB',
    textColor: '#E2E8F0',
    radius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', radius: 8, padding: 8, placeholderColor: '#64748B' },
  record: { color: '#DC2626', stopColor: '#475569', disabledColor: '#334155', size: 64, radius: 32 },
  devButton: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    textColor: '#E2E8F0',
    radius: 6,
    fontSize: 11,
  },
} as const;

export type TakeRecorderLook = typeof TAKE_RECORDER_LOOK;
