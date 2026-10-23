#!/usr/bin/env node
/**
 * commit-msg hook: Conventional Commits (type(scope)!: summary).
 * Enforced for commits Claude makes (they carry a Co-Authored-By: Claude trailer).
 * For the owner's own commits it only prints a reminder, so their style never blocks them.
 * Usage: node scripts/git/check-commit-msg.mjs <path to the commit message file>
 */

import { readFileSync } from 'node:fs';

const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];
const PATTERN = new RegExp(
  `^(?:${TYPES.join('|')})(?:\\([\\w./-]+\\))?!?: \\S.*`,
);
const EXEMPT = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;

export function checkCommitMessage(text) {
  const lines = text.split('\n').filter(l => !l.startsWith('#'));
  const subject = (lines[0] || '').trim();
  const byClaude = /^Co-Authored-By: Claude\b/im.test(text);
  if (!subject || EXEMPT.test(subject) || PATTERN.test(subject)) {
    return { ok: true, byClaude };
  }
  return { ok: !byClaude, byClaude, subject };
}

const file = process.argv[2];
if (file) {
  const result = checkCommitMessage(readFileSync(file, 'utf8'));
  if (!result.ok || result.subject) {
    const help = `Expected Conventional Commits: <type>(<scope>): <summary>, e.g. "feat(calibration): add the thorough mode". Types: ${TYPES.join(
      ', ',
    )}.`;
    if (result.byClaude) {
      console.error(
        `✗ Commit message "${result.subject}" doesn't follow Conventional Commits.\n${help}`,
      );
      process.exit(1);
    }
    console.error(
      `note: "${result.subject}" isn't a Conventional Commits message (not enforced for your own commits). ${help}`,
    );
  }
}
