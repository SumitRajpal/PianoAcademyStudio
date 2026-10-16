/**
 * Build → check → write. Used by the CLIs, the Claude hooks, husky and CI.
 */

import { join } from 'node:path';
import { buildGraph, serializeGraph } from './graph.mjs';
import { parseFlows } from './flows.mjs';
import { cacheDir, readText, withLock, writeIfChanged } from './io.mjs';
import { DOC_PATH, FLOWS_PATH, GRAPH_PATH, loadConfig } from './paths.mjs';
import { computeProblems } from './problems.mjs';
import { renderArchitectureDoc } from './render.mjs';

export { computeProblems } from './problems.mjs';

export async function writeStatus(root, problems, extra = {}) {
  const counts = {};
  for (const p of problems) {
    counts[p.type] = (counts[p.type] || 0) + 1;
  }
  await writeIfChanged(
    join(cacheDir(root), 'status.json'),
    `${JSON.stringify({ problems: problems.length, counts, ...extra }, null, 2)}\n`,
  );
}

/**
 * Rebuilds the graph and (unless write is false) writes graph.json and ARCHITECTURE.md.
 * Returns the graph, flows, problems and whether the files on disk were stale.
 */
export async function buildAndWrite({ root, write = true, overrides } = {}) {
  const config = await loadConfig(root);
  const run = async () => {
    const graph = await buildGraph({ root, config, overrides });
    const flows = parseFlows(await readText(join(root, FLOWS_PATH)));
    const problems = computeProblems(graph, flows, config);
    const graphText = serializeGraph(graph);
    const existingDoc = await readText(join(root, DOC_PATH));
    const docText = renderArchitectureDoc(graph, flows, problems, existingDoc);
    const stale =
      (await readText(join(root, GRAPH_PATH))) !== graphText || existingDoc !== docText;
    let wrote = false;
    if (write) {
      const a = await writeIfChanged(join(root, GRAPH_PATH), graphText);
      const b = await writeIfChanged(join(root, DOC_PATH), docText);
      wrote = a || b;
      await writeStatus(root, problems);
    }
    return { config, graph, flows, problems, stale, wrote };
  };
  return write ? withLock(join(cacheDir(root), 'build.lock'), run) : run();
}

/** Loads graph.json from disk without rebuilding (fast path for hooks). */
export async function readGraph(root) {
  const text = await readText(join(root, GRAPH_PATH));
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const violationKey = v =>
  `${v.rule}|${v.target ?? ''}|${(v.cycle || []).join(',')}`;

/**
 * Violations involving `file` that would exist after replacing its text with `newText`
 * and do not exist now. Used by the PreToolUse hook to block an edit before it lands.
 */
export async function newViolationsForChange({ root, file, newText }) {
  const config = await loadConfig(root);
  const before = await buildGraph({ root, config });
  const after = await buildGraph({ root, config, overrides: { [file]: newText } });
  const involves = v => v.file === file || (v.cycle || []).includes(file);
  const counts = new Map();
  for (const v of before.violations.filter(involves)) {
    counts.set(violationKey(v), (counts.get(violationKey(v)) || 0) + 1);
  }
  const fresh = [];
  for (const v of after.violations.filter(involves)) {
    const k = violationKey(v);
    if (counts.get(k)) {
      counts.set(k, counts.get(k) - 1);
    } else {
      fresh.push(v);
    }
  }
  return fresh;
}
