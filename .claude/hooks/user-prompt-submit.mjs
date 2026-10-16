#!/usr/bin/env node
/**
 * UserPromptSubmit: records when the turn started (for the Stop hook), and when the
 * message names a module, screen or scene, adds a short note on it from the graph.
 * Reads graph.json directly, so it never loads the TypeScript parser.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addContext, archLib, runHook } from './lib/hook.mjs';
import { updateSession } from './lib/state.mjs';

const GENERIC = new Set(
  'app index ios android audio motion sync shared state services content screens features ui native src scenes drivers tokens primitives test tests main entry module'.split(' '),
);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function mentionedModules(graph, prompt, max = 3) {
  const text = String(prompt || '');
  const found = [];
  for (const m of graph.modules) {
    const names = new Set([m.name]);
    const last = m.name.split('/').at(-1).replace(/\.[cm]?[jt]sx?$/, '');
    if (last.length >= 4 && !GENERIC.has(last.toLowerCase())) {
      names.add(last);
    }
    const hit = [...names].some(n =>
      n.includes('/') || /\.\w+$/.test(n)
        ? text.includes(n)
        : !GENERIC.has(n.toLowerCase()) && n.length >= 4 && new RegExp(`\\b${escapeRe(n)}\\b`, 'i').test(text),
    );
    if (hit) {
      found.push(m);
    }
  }
  return found.slice(0, max);
}

runHook('user-prompt-submit', async (input, { root }) => {
  updateSession(root, input.session_id, s => {
    s.turnStartedAt = Date.now();
  });
  let graph;
  try {
    graph = JSON.parse(readFileSync(join(root, 'docs/architecture/graph.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const mods = mentionedModules(graph, input.prompt);
  if (!mods.length) {
    return undefined;
  }
  const { indexGraph, describeModule } = await archLib('query.mjs');
  const idx = indexGraph(graph);
  const rules = graph.rules || [];
  const notes = mods.map(m => {
    const broken = graph.violations.filter(v => m.files.includes(v.file)).map(v => v.rule);
    const ruleText = broken.length
      ? `\n  breaks: ${[...new Set(broken)].map(id => rules.find(r => r.id === id)?.description || id).join(' ')}`
      : '';
    return describeModule(idx, m) + ruleText;
  });
  return addContext(
    'UserPromptSubmit',
    `Architecture notes for what this message mentions (from docs/architecture/graph.json):\n${notes.join('\n')}`,
  );
});
