#!/usr/bin/env node
/**
 * PostToolUse (Edit, Write, MultiEdit, Bash): records changed files for the Stop hook,
 * runs prettier and eslint --fix on the edited file, reports what eslint couldn't fix,
 * and rebuilds the architecture graph when code changed.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { archLib, block, headLines, relativeTo, runHook } from './lib/hook.mjs';
import { protectedReason } from './lib/protect.mjs';
import { runTool } from './lib/run.mjs';
import { logChangedFiles } from './lib/state.mjs';

const PRETTIER_EXT = /\.(?:[cm]?[jt]sx?|json)$/;
const ESLINT_EXT = /\.(?:[cm]?[jt]sx?)$/;
const GRAPH_INPUT =
  /\.(?:[cm]?[jt]sx?|swift|m|mm|h|hpp|hh|c|cc|cpp|cxx|kt|kts|java)$/;

const affectsGraph = rel =>
  rel === 'docs/architecture/flows.md' ||
  rel === 'scripts/architecture/config.mjs' ||
  (GRAPH_INPUT.test(rel) &&
    !rel.startsWith('scripts/') &&
    !rel.startsWith('.claude/'));

async function rebuild(root) {
  const { buildAndWrite } = await archLib('pipeline.mjs');
  await buildAndWrite({ root });
}

runHook('post-tool-use', async (input, { root }) => {
  const tool = input.tool_name;
  const ti = input.tool_input || {};

  if (tool === 'Bash') {
    const changed = (input.tool_response?.bashEditDiff?.changedFiles || [])
      .map(f => relativeTo(root, String(f)))
      .filter(Boolean);
    logChangedFiles(root, input.session_id, changed);
    if (changed.some(affectsGraph)) {
      await rebuild(root);
    }
    return undefined;
  }
  if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) {
    return undefined;
  }
  const rel = relativeTo(root, ti.file_path);
  if (!rel) {
    return undefined;
  }
  logChangedFiles(root, input.session_id, [rel]);
  if (protectedReason(rel) || !existsSync(join(root, rel))) {
    return undefined;
  }

  const notes = [];
  if (PRETTIER_EXT.test(rel)) {
    await runTool(root, 'prettier', ['--write', rel], { timeoutMs: 15000 });
  }
  if (ESLINT_EXT.test(rel)) {
    const r = await runTool(
      root,
      'eslint',
      ['--fix', '--format', 'unix', rel],
      { timeoutMs: 20000 },
    );
    if (r.code === 1 && r.stdout.trim()) {
      notes.push(
        `ESLint found problems it couldn't fix automatically in ${rel}:\n${headLines(
          r.stdout,
          20,
        )}`,
      );
    }
  }
  if (affectsGraph(rel)) {
    await rebuild(root);
  }
  return notes.length ? block(notes.join('\n\n')) : undefined;
});
