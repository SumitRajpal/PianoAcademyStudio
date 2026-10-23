/** Repo-relative locations of the architecture files. */

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONFIG_PATH = 'scripts/architecture/config.mjs';
export const GRAPH_PATH = 'docs/architecture/graph.json';
export const DOC_PATH = 'docs/architecture/ARCHITECTURE.md';
export const FLOWS_PATH = 'docs/architecture/flows.md';

export async function loadConfig(root) {
  const url = pathToFileURL(join(root, CONFIG_PATH)).href;
  const mod = await import(url);
  return mod.default;
}
