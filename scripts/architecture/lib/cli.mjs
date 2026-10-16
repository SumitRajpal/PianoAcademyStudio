/** Shared CLI helpers: repo root and flags. */

import { fileURLToPath } from 'node:url';

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root' || arg === '--budget') {
      values[arg.slice(2)] = argv[++i];
    } else if (arg.startsWith('--')) {
      flags.add(arg.slice(2));
    } else {
      positional.push(arg);
    }
  }
  const root = values.root || fileURLToPath(new URL('../../..', import.meta.url));
  return { flags, values, positional, root: root.replace(/\/$/, '') };
}
