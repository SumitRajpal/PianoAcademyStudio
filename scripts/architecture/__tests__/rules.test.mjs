import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { buildGraph } from '../lib/graph.mjs';
import { loadConfig } from '../lib/paths.mjs';
import { makeProject, purpose } from './helpers.mjs';

const cleanups = [];
after(() => cleanups.forEach(c => c()));

async function violationsOf(files) {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  const config = await loadConfig(p.root);
  const g = await buildGraph({ root: p.root, config, useCache: false });
  return g.violations;
}

const rulesHit = vs => [...new Set(vs.map(v => v.rule))].sort();

test('a clean layout has no violations', async () => {
  const vs = await violationsOf({
    'src/audio/index.ts': `${purpose(
      'audio api',
    )}export const start = () => {};\n`,
    'src/audio/capture/index.ts': `${purpose('mic')}export const cap = 1;\n`,
    'src/sync/index.ts': `${purpose('clock')}export const now = 0;\n`,
    'src/shared/notes.ts': `${purpose('note table')}export const A4 = 440;\n`,
    'src/motion/tokens/index.ts': `${purpose(
      'tokens',
    )}export const fast = { duration: 120 };\n`,
    'src/motion/scenes/Keyboard/index.tsx': `${purpose(
      'keys',
    )}import { now } from '../../../sync';\nimport { A4 } from '../../../shared/notes';\nimport { fast } from '../../tokens';\nexport const k = [now, A4, fast];\n`,
    'src/screens/Practice/index.tsx': `${purpose(
      'practice',
    )}import { start } from '../../audio';\nimport { k } from '../../motion/scenes/Keyboard';\nexport const p = [start, k];\n`,
  });
  assert.deepEqual(vs, []);
});

test('each rule type reports its violation', async () => {
  const vs = await violationsOf({
    'src/audio/index.ts': `${purpose(
      'audio api',
    )}import { Btn } from '../ui/Btn';\nexport const a = Btn;\n`,
    'src/audio/capture/index.ts': `${purpose('mic')}export const cap = 1;\n`,
    'src/ui/Btn.tsx': `${purpose('button')}export const Btn = 1;\n`,
    'src/features/lesson/index.ts': `${purpose(
      'lesson',
    )}export * from './model';\n`,
    'src/features/lesson/model.ts': `${purpose('model')}export const m = 1;\n`,
    'src/features/score/index.ts': `${purpose(
      'score',
    )}import { m } from '../lesson/model';\nexport const s = m;\n`,
    'src/screens/Home/index.tsx': `${purpose(
      'home',
    )}import { cap } from '../../audio/capture';\nexport const h = cap;\n`,
    'src/motion/scenes/Glow/index.tsx': `${purpose(
      'glow',
    )}import { s } from '../../../features/score';\nrunOnJS(update)();\nwithTiming(1, { duration: 300 });\nexport const g = s;\n`,
    'src/motion/drivers/pulse.ts': `${purpose(
      'pulse',
    )}import { useScore } from '../../features/score/useScore';\nexport const p = useScore;\n`,
    'src/features/score/useScore.ts': `${purpose(
      'score hook',
    )}export function useScore() { return 1; }\n`,
    'src/a.ts': `${purpose(
      'a',
    )}import { b } from './b';\nexport const a = b;\n`,
    'src/b.ts': `${purpose(
      'b',
    )}import { a } from './a';\nexport const b = a;\n`,
  });
  assert.deepEqual(rulesHit(vs), [
    'audio-no-ui',
    'motion-isolation',
    'motion-no-js-hop',
    'motion-tokens',
    'no-cycles',
    'public-api-only',
    'screens-no-audio-internals',
    'thread-boundary',
  ]);
  const cycle = vs.find(v => v.rule === 'no-cycles');
  assert.deepEqual(cycle.cycle, ['src/a.ts', 'src/b.ts']);
  const pattern = vs.find(v => v.rule === 'motion-no-js-hop');
  assert.equal(pattern.line, 3);
  const publicApi = vs.find(
    v =>
      v.rule === 'public-api-only' && v.file === 'src/features/score/index.ts',
  );
  assert.equal(publicApi.boundary, 'src/features/lesson');
});

test('thread rule judges the imported symbols, through barrels too', async () => {
  const vs = await violationsOf({
    'src/motion/shared/state.ts': `${purpose(
      'key state',
    )}export const KeyRole = { lit: 1 };\nexport function useKeys() { return 1; }\nexport function press() { 'worklet'; }\n`,
    'src/motion/shared/index.ts': `${purpose(
      'shared barrel',
    )}export { KeyRole, useKeys, press } from './state';\n`,
    'src/motion/shared/bridge.ts':
      '/** @purpose native bridge\n * @thread js */\nexport const call = () => 1;\n',
    'src/motion/scenes/A/drawA.ts': `${purpose(
      'a',
    )}import { KeyRole, press } from '../../shared/state';\nexport const a = [KeyRole, press];\n`,
    'src/motion/scenes/B/drawB.ts': `${purpose(
      'b',
    )}import { useKeys } from '../../shared';\nexport const b = useKeys;\n`,
    'src/motion/scenes/C/drawC.ts': `${purpose(
      'c',
    )}import { call } from '../../shared/bridge';\nexport const c = call;\n`,
  });
  const hits = vs.filter(v => v.rule === 'thread-boundary');
  assert.deepEqual(
    hits.map(v => [v.file, v.symbols || null]),
    [
      ['src/motion/scenes/B/drawB.ts', ['useKeys']],
      ['src/motion/scenes/C/drawC.ts', null],
    ],
    'constants and worklets are fine; a hook through a barrel and plain JS-thread code are not',
  );
});

test('type-only imports do not break thread or cycle rules', async () => {
  const vs = await violationsOf({
    'src/motion/scenes/K/index.tsx': `${purpose(
      'k',
    )}import type { T } from '../../../sync/types';\nexport const k = 1 as unknown as T;\n`,
    'src/sync/types.ts': `/** @purpose shared types\n * @thread js */\nexport type T = number;\n`,
    'src/a.ts': `${purpose(
      'a',
    )}import type { B } from './b';\nexport type A = B;\n`,
    'src/b.ts': `${purpose(
      'b',
    )}import type { A } from './a';\nexport type B = A;\n`,
  });
  assert.deepEqual(vs, []);
});
