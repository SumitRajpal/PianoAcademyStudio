/** Small, fast git helpers for hooks. */

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export function git(root, args, timeout = 3000) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout });
  return r.status === 0 ? r.stdout.replace(/\n$/, '') : null;
}

function gitDir(root) {
  const dotGit = join(root, '.git');
  try {
    if (statSync(dotGit).isDirectory()) {
      return dotGit;
    }
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
    return pointer ? (isAbsolute(pointer) ? pointer : join(root, pointer)) : null;
  } catch {
    return null;
  }
}

/** Current branch name, or the short commit when detached. Reads .git/HEAD directly (no process). */
export function branch(root) {
  const dir = gitDir(root);
  if (!dir) {
    return null;
  }
  try {
    const head = readFileSync(join(dir, 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice(16) : head.slice(0, 7);
  } catch {
    return null;
  }
}

/** Uncommitted changes as [{ status, path }], or null outside a git repo. */
export function uncommitted(root) {
  const out = git(root, ['status', '--porcelain', '--untracked-files=all']);
  if (out === null) {
    return null;
  }
  return out
    .split('\n')
    .filter(Boolean)
    .map(line => ({ status: line.slice(0, 2).trim(), path: line.slice(3).replace(/^"|"$/g, '') }));
}
