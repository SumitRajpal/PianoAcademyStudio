#!/usr/bin/env node
/**
 * Prints the compact architecture map (the one loaded at session start).
 * Usage: node scripts/architecture/summary.mjs [--budget 6000]
 */

import { buildAndWrite } from './lib/pipeline.mjs';
import { parseArgs } from './lib/cli.mjs';
import { renderSummary } from './lib/summary.mjs';

const { values, root } = parseArgs();
const { graph, flows, problems } = await buildAndWrite({ root });
console.log(
  renderSummary(graph, flows, problems, {
    budget: Number(values.budget) || 6000,
  }),
);
