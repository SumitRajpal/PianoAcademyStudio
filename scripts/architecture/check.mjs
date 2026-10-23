#!/usr/bin/env node
/**
 * Checks the architecture: rule violations, modules without a purpose, flows that
 * don't match the code. Exits 1 when something needs fixing.
 *
 * Usage: node scripts/architecture/check.mjs [--ci] [--rules-only] [--json]
 *   --ci          also fail when the committed graph files are out of date
 *   --rules-only  only rule violations fail the check (used by the pre-commit hook)
 *   --json        machine-readable output
 */

import { buildAndWrite } from './lib/pipeline.mjs';
import { parseArgs } from './lib/cli.mjs';

const { flags, root } = parseArgs();
const ci = flags.has('ci');
const { problems, stale } = await buildAndWrite({ root, write: !ci });
const failing = flags.has('rules-only')
  ? problems.filter(p => p.type === 'violation')
  : problems;
const staleFail = ci && stale;

if (flags.has('json')) {
  console.log(
    JSON.stringify(
      { ok: !failing.length && !staleFail, stale, problems },
      null,
      2,
    ),
  );
} else {
  if (staleFail) {
    console.log(
      '✗ docs/architecture is out of date. Run `npm run arch:build` and commit the result.',
    );
  }
  if (!problems.length) {
    console.log(
      '✓ architecture: every rule passes, every module has a purpose, every flow matches the code',
    );
  } else {
    console.log(
      `architecture: ${problems.length} problem${
        problems.length === 1 ? '' : 's'
      }`,
    );
    for (const p of problems) {
      console.log(`- [${p.type}] ${p.message}`);
    }
  }
}
process.exitCode = failing.length || staleFail ? 1 : 0;
