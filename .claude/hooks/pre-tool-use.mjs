#!/usr/bin/env node
/**
 * PreToolUse (Edit, Write, MultiEdit, NotebookEdit, Bash):
 *   - blocks edits to secret, generated and build files, and to the generated part of ARCHITECTURE.md
 *   - asks the owner before Claude changes its own setup (.claude/, the architecture config)
 *   - blocks an edit that would break a connection rule, before it lands
 *   - blocks force push, branch deletion, and commands that touch secret files
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { archLib, ask, deny, relativeTo, runHook } from './lib/hook.mjs';
import { bashReason, isSetupFile, protectedReason } from './lib/protect.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function applyEdit(text, oldStr, newStr, all) {
  if (!oldStr) {
    return text;
  }
  if (!text.includes(oldStr)) {
    return null;
  }
  return all
    ? text.split(oldStr).join(newStr)
    : text.replace(oldStr, () => newStr);
}

/** The file's text after the tool runs, or null when it can't be worked out. */
function proposedText(root, rel, tool, ti) {
  if (tool === 'Write') {
    return String(ti.content ?? '');
  }
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    return null;
  }
  let text = readFileSync(abs, 'utf8');
  if (tool === 'Edit') {
    return applyEdit(text, ti.old_string, ti.new_string ?? '', ti.replace_all);
  }
  if (tool === 'MultiEdit') {
    for (const e of ti.edits || []) {
      text = applyEdit(text, e.old_string, e.new_string ?? '', e.replace_all);
      if (text === null) {
        return null;
      }
    }
    return text;
  }
  return null;
}

async function inGraphScope(root, rel) {
  const { CODE_EXT } = await archLib('constants.mjs');
  if (!CODE_EXT.test(rel)) {
    return false;
  }
  const { loadConfig } = await archLib('paths.mjs');
  const { matches } = await archLib('glob.mjs');
  const config = await loadConfig(root);
  const inRoots = config.roots.some(r => rel === r || rel.startsWith(`${r}/`));
  return inRoots && !matches(rel, config.exclude);
}

runHook('pre-tool-use', async (input, { root }) => {
  const tool = input.tool_name;
  const ti = input.tool_input || {};

  if (tool === 'Bash') {
    const reason = bashReason(String(ti.command || ''));
    return reason ? deny(reason) : undefined;
  }
  if (!EDIT_TOOLS.has(tool)) {
    return undefined;
  }
  const rel = relativeTo(root, ti.file_path || ti.notebook_path);
  if (!rel) {
    return undefined;
  }
  const blocked = protectedReason(rel);
  if (blocked) {
    return deny(blocked);
  }
  if (isSetupFile(rel)) {
    return ask(
      `This changes Claude's own setup (${rel}). Approve only if you asked for this change.`,
    );
  }

  if (rel === 'docs/architecture/ARCHITECTURE.md') {
    const { extractGenerated } = await archLib('render.mjs');
    const next = proposedText(root, rel, tool, ti);
    const current = existsSync(join(root, rel))
      ? readFileSync(join(root, rel), 'utf8')
      : null;
    if (
      next !== null &&
      current !== null &&
      extractGenerated(next) !== extractGenerated(current)
    ) {
      return deny(
        'Sections 1–6 of ARCHITECTURE.md are generated from the code (`npm run arch:build`). Edit only the Conventions section, or change the code, flows.md or the config.',
      );
    }
    return undefined;
  }

  if (tool === 'NotebookEdit' || !(await inGraphScope(root, rel))) {
    return undefined;
  }
  const newText = proposedText(root, rel, tool, ti);
  if (newText === null) {
    return undefined;
  }
  const { newViolationsForChange } = await archLib('pipeline.mjs');
  const { describeViolation } = await archLib('rules.mjs');
  const fresh = await newViolationsForChange({ root, file: rel, newText });
  if (!fresh.length) {
    return undefined;
  }
  return deny(
    [
      'This edit would break the architecture rules:',
      ...fresh.map(v => `- ${describeViolation(v)}`),
      'Change the edit so it follows the rule. If the rule itself should change, ask the owner first (rules live in scripts/architecture/config.mjs).',
    ].join('\n'),
  );
});
