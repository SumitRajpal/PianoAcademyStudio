#!/usr/bin/env node
/**
 * Rebuilds docs/architecture/graph.json and ARCHITECTURE.md from the code.
 * Usage: node scripts/architecture/build.mjs [--quiet]
 */

import { buildAndWrite } from './lib/pipeline.mjs';
import { parseArgs } from './lib/cli.mjs';

const { flags, root } = parseArgs();
const { graph, problems, wrote } = await buildAndWrite({ root });
if (!flags.has('quiet')) {
  console.log(
    `architecture: ${graph.modules.length} modules, ${graph.files.length} files, ${graph.edges.length} connections, ${problems.length} problem${problems.length === 1 ? '' : 's'} · ${wrote ? 'updated' : 'unchanged'} docs/architecture/graph.json`,
  );
  if (problems.length) {
    console.log('run `npm run arch:check` for details');
  }
}
