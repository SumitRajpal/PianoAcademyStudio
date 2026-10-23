#!/usr/bin/env node
/**
 * SessionStart (startup, resume, /clear, compaction): gives Claude the compact
 * architecture map, the last handoff note, git state, and the working state saved
 * before compaction. Rebuilds the graph first in case code changed outside Claude.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { branch, uncommitted } from './lib/git.mjs';
import { addContext, archLib, runHook, truncate } from './lib/hook.mjs';
import { precompactPath, pruneSessions } from './lib/state.mjs';

function latestHandoff(root) {
  const dir = join(root, '.claude/handoff');
  if (!existsSync(dir)) {
    return null;
  }
  const notes = readdirSync(dir)
    .filter(n => n.endsWith('.md'))
    .sort();
  const name = notes.at(-1);
  return name ? { name, text: readFileSync(join(dir, name), 'utf8') } : null;
}

runHook('session-start', async (input, { root }) => {
  const parts = [];
  const { buildAndWrite } = await archLib('pipeline.mjs');
  const { renderSummary } = await archLib('summary.mjs');
  const { graph, flows, problems } = await buildAndWrite({ root });
  parts.push(renderSummary(graph, flows, problems, { budget: 6000 }));

  const note = latestHandoff(root);
  if (note) {
    parts.push(
      `Last handoff note (.claude/handoff/${note.name}):\n${truncate(
        note.text.trim(),
        1500,
      )}`,
    );
  }

  const b = branch(root);
  const changes = uncommitted(root);
  if (b) {
    const list = (changes || []).map(c => c.path);
    parts.push(
      `Git: branch ${b} · ${
        list.length
          ? `${list.length} uncommitted file${
              list.length === 1 ? '' : 's'
            }: ${list.slice(0, 8).join(', ')}${list.length > 8 ? ', …' : ''}`
          : 'no uncommitted changes'
      }`,
    );
  }

  if (input.source === 'compact') {
    const path = precompactPath(root, input.session_id);
    if (existsSync(path)) {
      parts.push(
        `Working state saved before compaction:\n${readFileSync(
          path,
          'utf8',
        ).trim()}`,
      );
    }
  }

  if (input.source === 'startup') {
    pruneSessions(root);
  }
  return addContext('SessionStart', parts.join('\n\n'));
});
