#!/usr/bin/env node
/**
 * Status line: branch · model · context used · architecture status.
 *   arch ✓     the last build found no problems
 *   arch ⚠ 2   it found 2 (run /arch check)
 * Reads only small files, so it stays fast.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { branch } from './hooks/lib/git.mjs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  input = {};
}
const root =
  input.workspace?.project_dir ||
  process.env.CLAUDE_PROJECT_DIR ||
  process.cwd();

const parts = [branch(root) || 'no git'];
parts.push(input.model?.display_name || input.model?.id || 'Claude');
const used = input.context_window?.used_percentage;
parts.push(typeof used === 'number' ? `ctx ${Math.round(used)}%` : 'ctx ?');
try {
  const status = JSON.parse(
    readFileSync(
      join(root, 'node_modules/.cache/architecture/status.json'),
      'utf8',
    ),
  );
  parts.push(status.problems ? `arch ⚠ ${status.problems}` : 'arch ✓');
} catch {
  parts.push('arch ?');
}
process.stdout.write(parts.join(' · '));
