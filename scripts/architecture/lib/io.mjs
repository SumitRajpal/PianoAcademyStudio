/** File helpers: atomic writes, a simple lock, and the analysis cache. */

import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Writes only when the content changed; returns true if it wrote. */
export async function writeIfChanged(path, content) {
  if ((await readText(path)) === content) {
    return false;
  }
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, content);
  await rename(tmp, path);
  return true;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs fn while holding a lock file. Stale locks (older than 15 s) are taken over. */
export async function withLock(lockPath, fn, { timeoutMs = 10000 } = {}) {
  await mkdir(dirname(lockPath), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.close();
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 15000) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for lock ${lockPath}`);
      }
      await sleep(50);
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}

export function hash(text) {
  return createHash('sha1').update(text).digest('hex');
}

export function cacheDir(root) {
  return join(root, 'node_modules', '.cache', 'architecture');
}

export async function loadCache(root, toolHash) {
  const text = await readText(join(cacheDir(root), 'analysis.json'));
  if (text) {
    try {
      const data = JSON.parse(text);
      if (data.toolHash === toolHash) {
        return data;
      }
    } catch {
      // A corrupt cache is rebuilt from scratch.
    }
  }
  return { toolHash, entries: {} };
}

export async function saveCache(root, cache) {
  await writeIfChanged(join(cacheDir(root), 'analysis.json'), JSON.stringify(cache));
}
