import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Creates a throwaway project with the real architecture config and the given files. */
export function makeProject(files, { config } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'arch-test-'));
  mkdirSync(join(root, 'scripts/architecture'), { recursive: true });
  if (config) {
    writeFileSync(join(root, 'scripts/architecture/config.mjs'), `export default ${JSON.stringify(config, null, 2)};\n`);
  } else {
    cpSync(join(REPO_ROOT, 'scripts/architecture/config.mjs'), join(root, 'scripts/architecture/config.mjs'));
  }
  writeFiles(root, files);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

export const purpose = text => `/** @purpose ${text} */\n`;
