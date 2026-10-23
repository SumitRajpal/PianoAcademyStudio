#!/usr/bin/env node
/**
 * SubagentStart: gives Claude's helper agents a smaller copy of the architecture map.
 * Reads graph.json as it is (the main session keeps it fresh), so it never loads TypeScript.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addContext, archLib, runHook } from './lib/hook.mjs';

runHook('subagent-start', async (_input, { root }) => {
  let graph;
  try {
    graph = JSON.parse(
      readFileSync(join(root, 'docs/architecture/graph.json'), 'utf8'),
    );
  } catch {
    return undefined;
  }
  const { parseFlows } = await archLib('flows.mjs');
  const { computeProblems } = await archLib('problems.mjs');
  const { renderSummary } = await archLib('summary.mjs');
  const { loadConfig } = await archLib('paths.mjs');
  let flowsText = '';
  try {
    flowsText = readFileSync(join(root, 'docs/architecture/flows.md'), 'utf8');
  } catch {
    // No flows yet.
  }
  const flows = parseFlows(flowsText);
  const problems = computeProblems(graph, flows, await loadConfig(root));
  return addContext(
    'SubagentStart',
    `${renderSummary(graph, flows, problems, {
      budget: 3000,
    })}\nRules and conventions: CLAUDE.md and docs/architecture/ARCHITECTURE.md.`,
  );
});
