#!/usr/bin/env node
/**
 * SessionEnd: writes a handoff note to .claude/handoff/ (gitignored) when the session
 * changed files: what changed, the last check, anything still failing. The next session
 * start loads the latest note. Claude Code gives all SessionEnd hooks 1.5 s together,
 * so this reads only small files and one fast git command.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { branch, uncommitted } from './lib/git.mjs';
import { runHook } from './lib/hook.mjs';
import { changedFiles, readSession, safeId } from './lib/state.mjs';

const KEEP = 30;
const pad = n => String(n).padStart(2, '0');

runHook('session-end', async (input, { root }) => {
  const id = input.session_id;
  const files = changedFiles(root, id);
  const session = readSession(root, id);
  if (!files.length && !(session.unresolved || []).length) {
    return undefined;
  }
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}T${pad(now.getHours())}${pad(now.getMinutes())}`;
  const pending = uncommitted(root) || [];
  const lines = [
    `# Handoff ${stamp} (automatic)`,
    '',
    `- Session: ${safeId(id)} · ended: ${input.reason || 'unknown'} · branch: ${
      branch(root) || 'unknown'
    }`,
    `- Uncommitted files: ${pending.length}`,
    `- Files changed this session (${files.length}):`,
    ...files.slice(0, 40).map(f => `  - ${f}`),
  ];
  if (files.length > 40) {
    lines.push(`  - … +${files.length - 40} more`);
  }
  if (session.lastCheck) {
    lines.push(
      `- Last end-of-turn check: ${
        session.lastCheck.ok ? 'passed' : 'FAILED'
      } (${session.lastCheck.at})`,
    );
  }
  if ((session.unresolved || []).length) {
    lines.push('', '## Still failing', '', ...session.unresolved);
  }
  lines.push(
    '',
    'For a written summary (decisions, next steps), use /handoff before ending a session.',
  );

  const dir = join(root, '.claude/handoff');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${stamp}-${safeId(id).slice(0, 8)}.md`),
    `${lines.join('\n')}\n`,
  );
  if (existsSync(dir)) {
    const notes = readdirSync(dir)
      .filter(n => n.endsWith('.md'))
      .sort();
    for (const old of notes.slice(0, Math.max(0, notes.length - KEEP))) {
      rmSync(join(dir, old), { force: true });
    }
  }
  return undefined;
});
