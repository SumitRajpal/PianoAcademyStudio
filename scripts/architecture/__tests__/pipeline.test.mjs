import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { checkFlows, parseFlows } from '../lib/flows.mjs';
import { buildAndWrite, newViolationsForChange } from '../lib/pipeline.mjs';
import { renderSummary } from '../lib/summary.mjs';
import { makeProject, purpose, REPO_ROOT, writeFiles } from './helpers.mjs';

const cleanups = [];
after(() => cleanups.forEach(c => c()));
const project = files => {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  return p.root;
};

const BASE = {
  'App.tsx': `${purpose('root')}import { Practice } from './src/screens/Practice';\nexport default () => <Practice />;\n`,
  'src/screens/Practice/index.tsx': `${purpose('practice screen')}import { glow } from '../../motion/drivers/keyGlow';\nexport const Practice = () => glow;\n`,
  'src/motion/drivers/keyGlow.ts': `${purpose('glow driver')}import { now } from '../../sync';\nexport const glow = now;\n`,
  'src/sync/index.ts': `${purpose('clock')}export const now = 0;\n`,
};

test('build writes the graph and doc, is stable, and keeps the conventions section', async () => {
  const root = project(BASE);
  const first = await buildAndWrite({ root });
  assert.equal(first.wrote, true);
  assert.deepEqual(first.problems, []);
  const second = await buildAndWrite({ root });
  assert.equal(second.wrote, false, 'nothing changes on a second build');

  const docPath = join(root, 'docs/architecture/ARCHITECTURE.md');
  const doc = readFileSync(docPath, 'utf8');
  assert.match(doc, /```mermaid/);
  writeFileSync(docPath, doc.replace('## 7. Conventions', '## 7. Conventions\n\n- Custom note kept by Claude.'));
  await buildAndWrite({ root });
  assert.match(readFileSync(docPath, 'utf8'), /Custom note kept by Claude\./);
});

test('missing purposes and flow problems are reported', async () => {
  const root = project({
    ...BASE,
    'src/features/lesson/index.ts': 'export const l = 1;\n',
    'docs/architecture/flows.md': '# Flows\n\n## feedback\n```flow\nmic -> sync -> motion/drivers/keyGlow\n  -> features/lesson -> nowhere -> screen\n```\n',
  });
  const { problems } = await buildAndWrite({ root });
  const types = problems.map(p => p.type).sort();
  assert.deepEqual(types, ['flow-missing-connection', 'flow-unknown-step', 'missing-purpose']);
});

test('flows parse across lines and pass when connected', async () => {
  const flows = parseFlows(
    '## a\n```flow\nmic -> x\n  -> y\n```\n## heading only\ntext\n````text\n## example\n```flow\nmic -> z\n```\n````\n',
  );
  assert.deepEqual(flows.map(f => [f.name, f.steps]), [['a', ['mic', 'x', 'y']]], 'examples inside other fences are ignored');
  const real = parseFlows(readFileSync(join(REPO_ROOT, 'docs/architecture/flows.md'), 'utf8'));
  assert.deepEqual(real, [], 'the example in the real flows.md is not parsed as a flow');
  const root = project(BASE);
  const { graph, config } = await buildAndWrite({ root });
  const ok = parseFlows('## f\n```flow\nscreens/Practice → motion/drivers/keyGlow → sync → screen\n```\n');
  assert.deepEqual(checkFlows(graph, ok, config), []);
});

test('a hypothetical edit is checked before it lands; old violations are ignored', async () => {
  const root = project({
    ...BASE,
    'src/features/score/index.ts': `${purpose('score')}export const s = 1;\n`,
  });
  await buildAndWrite({ root });
  const file = 'src/motion/drivers/keyGlow.ts';
  const bad = await newViolationsForChange({
    root,
    file,
    newText: `${purpose('glow driver')}import { s } from '../../features/score';\nexport const glow = s;\n`,
  });
  assert.deepEqual(bad.map(v => v.rule).sort(), ['motion-isolation', 'thread-boundary']);

  writeFiles(root, { [file]: `${purpose('glow driver')}import { s } from '../../features/score';\nexport const glow = s;\n` });
  const unchanged = await newViolationsForChange({
    root,
    file,
    newText: `${purpose('glow driver v2')}import { s } from '../../features/score';\nexport const glow = s + 1;\n`,
  });
  assert.deepEqual(unchanged, [], 'an existing violation does not block unrelated edits');
});

test('check --ci fails when the committed graph is stale', async () => {
  const root = project(BASE);
  const check = () =>
    spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/architecture/check.mjs'), '--ci', '--root', root], { encoding: 'utf8' });
  assert.equal(check().status, 1, 'no graph written yet');
  await buildAndWrite({ root });
  assert.equal(check().status, 0);
  writeFiles(root, { 'src/sync/extra.ts': `${purpose('extra')}export const e = 1;\n` });
  const stale = check();
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /out of date/);
});

test('summary fits the budget', async () => {
  const files = { ...BASE };
  for (let i = 0; i < 80; i++) {
    files[`src/features/f${i}/index.ts`] = `${purpose(`feature number ${i} with a fairly long purpose text`)}export const x${i} = ${i};\n`;
  }
  const root = project(files);
  const { graph, flows, problems } = await buildAndWrite({ root });
  const text = renderSummary(graph, flows, problems, { budget: 3000 });
  assert.ok(text.length <= 3000, `summary is ${text.length} chars`);
  assert.match(text, /^Architecture map · 84 modules/);
  assert.match(text, /more \(\/arch\)/);
});
