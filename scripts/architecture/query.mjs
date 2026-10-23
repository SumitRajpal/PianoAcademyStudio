#!/usr/bin/env node
/**
 * Architecture queries, answered from the graph.
 *
 * Usage: node scripts/architecture/query.mjs <command> [args]
 *   (no command) | map     the compact map
 *   show <x>               one module: purpose, connections, packages
 *   who-uses <x>           modules that use x
 *   deps <x>               modules and packages x uses
 *   impact <x>             everything affected by changing x
 *   path <a> <b>           how a connects to b
 *   hot-path               the mic/playback → screen route with the thread of each step
 *   find <name>            where an export or module lives
 *   check                  same as check.mjs
 */

import { buildAndWrite } from './lib/pipeline.mjs';
import { parseArgs } from './lib/cli.mjs';
import {
  describeModule,
  hotPath,
  impact,
  indexGraph,
  resolveTarget,
  shortestPath,
} from './lib/query.mjs';
import { renderSummary } from './lib/summary.mjs';

const { positional, root } = parseArgs();
const [command = 'map', ...args] = positional;
const { config, graph, flows, problems } = await buildAndWrite({ root });
const idx = indexGraph(graph);

const target = name => {
  if (!name) {
    console.log(`Usage: query.mjs ${command} <module, file or export>`);
    process.exit(1);
  }
  const r = resolveTarget(idx, name);
  if (!r.modules.length) {
    console.log(
      `Nothing named "${name}" in the graph. Try: query.mjs find ${name}`,
    );
    process.exit(1);
  }
  return r;
};

switch (command) {
  case 'map':
    console.log(renderSummary(graph, flows, problems));
    break;
  case 'show':
  case 'find': {
    const r = target(args[0]);
    if (r.exportOf) {
      console.log(`"${r.exportOf}" is exported from:`);
    }
    if (r.file) {
      console.log(`${r.file.id} is part of:`);
    }
    console.log(r.modules.map(m => describeModule(idx, m)).join('\n\n'));
    break;
  }
  case 'who-uses': {
    for (const m of target(args[0]).modules) {
      const users = (idx.inc.get(m.id) || []).map(
        e => `${idx.modules.get(e.from).name} (${e.kinds.join(', ')})`,
      );
      console.log(
        `${m.name} is used by: ${
          users.length ? `\n  ${users.join('\n  ')}` : 'nothing'
        }`,
      );
    }
    break;
  }
  case 'deps': {
    for (const m of target(args[0]).modules) {
      const used = (idx.out.get(m.id) || []).map(
        e => `${idx.modules.get(e.to).name} (${e.kinds.join(', ')})`,
      );
      console.log(
        `${m.name} uses: ${
          used.length ? `\n  ${used.join('\n  ')}` : 'no other modules'
        }`,
      );
      if (m.packages?.length) {
        console.log(`  packages: ${m.packages.join(', ')}`);
      }
    }
    break;
  }
  case 'impact': {
    for (const m of target(args[0]).modules) {
      const hit = impact(idx, m.id);
      console.log(
        `Changing ${m.name} can affect ${hit.length} module${
          hit.length === 1 ? '' : 's'
        }:`,
      );
      for (const { module, depth } of hit) {
        console.log(
          `  ${'  '.repeat(depth - 1)}${module.name} [${module.kind}]`,
        );
      }
    }
    break;
  }
  case 'path': {
    const [a, b] = [target(args[0]).modules[0], target(args[1]).modules[0]];
    const steps =
      shortestPath(idx, a.id, b.id) ||
      shortestPath(idx, a.id, b.id, { directed: false });
    if (!steps) {
      console.log(`${a.name} and ${b.name} are not connected.`);
    } else if (!steps.length) {
      console.log(`${a.name} is ${b.name}.`);
    } else {
      console.log(
        [
          a.name,
          ...steps.map(
            s =>
              `${s.dir} ${idx.modules.get(s.to).name} (${s.e.kinds.join(
                ', ',
              )})`,
          ),
        ].join('\n  '),
      );
    }
    break;
  }
  case 'hot-path':
    console.log(hotPath(idx, flows, config));
    break;
  case 'check':
    if (!problems.length) {
      console.log('✓ no problems');
    }
    for (const p of problems) {
      console.log(`- [${p.type}] ${p.message}`);
    }
    process.exitCode = problems.length ? 1 : 0;
    break;
  default:
    console.log(
      `Unknown command "${command}". Commands: map, show, who-uses, deps, impact, path, hot-path, find, check`,
    );
    process.exitCode = 1;
}
