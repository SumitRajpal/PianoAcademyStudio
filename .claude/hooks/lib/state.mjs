/**
 * Per-session state in .claude/state/sessions/ (gitignored).
 *   <id>.json       turn start time, last check result, unresolved problems
 *   <id>.files.log  one "<ms>\t<path>" line per file Claude changed (append-only, safe for parallel hooks)
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const sessionsDir = root => join(root, '.claude/state/sessions');
export const safeId = id => String(id || 'unknown').replace(/[^\w-]/g, '').slice(0, 80) || 'unknown';

export function readSession(root, id) {
  try {
    return JSON.parse(readFileSync(join(sessionsDir(root), `${safeId(id)}.json`), 'utf8'));
  } catch {
    return {};
  }
}

export function updateSession(root, id, fn) {
  const data = readSession(root, id);
  fn(data);
  mkdirSync(sessionsDir(root), { recursive: true });
  const path = join(sessionsDir(root), `${safeId(id)}.json`);
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
  return data;
}

export function logChangedFiles(root, id, files) {
  if (!files.length) {
    return;
  }
  mkdirSync(sessionsDir(root), { recursive: true });
  const now = Date.now();
  appendFileSync(
    join(sessionsDir(root), `${safeId(id)}.files.log`),
    files.map(f => `${now}\t${f}\n`).join(''),
  );
}

/** Unique paths changed in this session at or after `sinceMs`, in first-seen order. */
export function changedFiles(root, id, sinceMs = 0) {
  let text = '';
  try {
    text = readFileSync(join(sessionsDir(root), `${safeId(id)}.files.log`), 'utf8');
  } catch {
    return [];
  }
  const seen = new Set();
  for (const line of text.split('\n')) {
    const [ts, path] = line.split('\t');
    if (path && Number(ts) >= sinceMs) {
      seen.add(path);
    }
  }
  return [...seen];
}

export function precompactPath(root, id) {
  return join(sessionsDir(root), `${safeId(id)}.precompact.md`);
}

/** Keeps the newest `keep` sessions' files. */
export function pruneSessions(root, keep = 40) {
  const dir = sessionsDir(root);
  if (!existsSync(dir)) {
    return;
  }
  const byId = new Map();
  for (const name of readdirSync(dir)) {
    const id = name.split('.')[0];
    const mtime = statSync(join(dir, name)).mtimeMs;
    byId.set(id, Math.max(byId.get(id) || 0, mtime));
  }
  const old = [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(keep).map(([id]) => id);
  for (const name of readdirSync(dir)) {
    if (old.includes(name.split('.')[0])) {
      rmSync(join(dir, name), { force: true });
    }
  }
}
