#!/usr/bin/env node
/**
 * PreCompact: saves the working state (branch, files changed this session, last check)
 * so SessionStart can give it back after the conversation is compacted.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { branch } from './lib/git.mjs';
import { runHook } from './lib/hook.mjs';
import { changedFiles, precompactPath, readSession } from './lib/state.mjs';

export function workingState(root, id) {
  const session = readSession(root, id);
  const files = changedFiles(root, id);
  const lines = [`- Branch: ${branch(root) || 'unknown'}`];
  lines.push(
    files.length
      ? `- Files changed this session (${files.length}): ${files
          .slice(-25)
          .join(', ')}${files.length > 25 ? ' (latest 25)' : ''}`
      : '- No files changed this session.',
  );
  if (session.lastCheck) {
    lines.push(
      `- Last end-of-turn check (${session.lastCheck.at}): ${
        session.lastCheck.ok ? 'passed' : 'failed'
      }`,
    );
  }
  for (const section of session.unresolved || []) {
    lines.push(`- Still failing: ${section.split('\n')[0]}`);
  }
  return lines.join('\n');
}

runHook('pre-compact', async (input, { root }) => {
  const path = precompactPath(root, input.session_id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${workingState(
      root,
      input.session_id,
    )}\n- Saved: ${new Date().toISOString()} (${
      input.trigger || 'compaction'
    })\n`,
  );
  return undefined;
});
