import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { buildGraph } from '../lib/graph.mjs';
import { loadConfig } from '../lib/paths.mjs';
import { makeProject, purpose } from './helpers.mjs';

const cleanups = [];
after(() => cleanups.forEach(c => c()));

async function graphOf(files) {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  const config = await loadConfig(p.root);
  return buildGraph({ root: p.root, config, useCache: false });
}

const rulesHit = vs => [...new Set(vs.map(v => v.rule))].sort();

// The note engine package as migration step 2 lays it out (ADR 0003).
const ENGINE = {
  'packages/CoreEngine/src/index.ts': `${purpose(
    'engine api',
  )}export { hear } from './hear';\n`,
  'packages/CoreEngine/src/hear.ts': 'export const hear = 1;\n',
  'packages/CoreEngine/cpp/legacy/Engine.h': 'struct Engine {};\n',
  'packages/CoreEngine/ios/IosAudioInput.mm': '#include "Engine.h"\n',
};

test('the engine package is one module, imported by its name', async () => {
  const g = await graphOf({
    ...ENGINE,
    'src/screens/Practice/index.tsx': `${purpose(
      'practice',
    )}import { hear } from '@pianoacademy/core-engine';\nexport const p = hear;\n`,
  });
  const engine = g.modules.find(m => m.id === 'packages/CoreEngine');
  assert.ok(engine, 'packages/CoreEngine is a module');
  assert.equal(engine.kind, 'engine');
  assert.equal(engine.plane, 'audio');
  assert.equal(engine.purpose, 'engine api');
  assert.ok(
    g.moduleEdges.some(
      e => e.from === 'src/screens/Practice' && e.to === 'packages/CoreEngine',
    ),
    'the screen uses the engine',
  );
  assert.deepEqual(g.violations, []);
});

test('the engine package imports nothing from the app', async () => {
  const g = await graphOf({
    ...ENGINE,
    'packages/CoreEngine/src/hear.ts':
      "import { A4 } from '../../../src/shared/notes';\nexport const hear = A4;\n",
    'src/shared/notes.ts': `${purpose('note table')}export const A4 = 440;\n`,
  });
  assert.deepEqual(rulesHit(g.violations), ['engine-imports-no-app']);
});

test('the app reaches the engine only through its index', async () => {
  const g = await graphOf({
    ...ENGINE,
    'src/screens/Practice/index.tsx': `${purpose(
      'practice',
    )}import { hear } from '@pianoacademy/core-engine/hear';\nexport const p = hear;\n`,
  });
  assert.deepEqual(rulesHit(g.violations), [
    'public-api-only',
    'screens-no-audio-internals',
  ]);
});
