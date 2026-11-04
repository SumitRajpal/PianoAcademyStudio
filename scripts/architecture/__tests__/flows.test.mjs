import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { checkFlows, flowStepLabels, parseFlows } from '../lib/flows.mjs';
import { buildAndWrite } from '../lib/pipeline.mjs';
import { hotPath, indexGraph } from '../lib/query.mjs';
import { makeProject, purpose } from './helpers.mjs';

const cleanups = [];
after(() => cleanups.forEach(c => c()));

// A screen that hands an audio module's output to a motion driver when it
// mounts, as the lesson screen hands the note engine PianoMaster's key sink.
const FILES = {
  'App.tsx': `${purpose(
    'root',
  )}import { Practice } from './src/screens/Practice';\nexport default () => <Practice />;\n`,
  'src/screens/Practice/index.tsx': `${purpose(
    'practice screen',
  )}import { hear } from '../../audio';\nimport { glow } from '../../motion/drivers/keyGlow';\nexport const Practice = () => [hear, glow];\n`,
  // Audio by role, as the note engine is (its C++ runs on the audio thread).
  'src/audio/index.ts':
    '/**\n * @purpose detector\n * @thread audio\n */\nexport const hear = 1;\n',
  'src/motion/drivers/keyGlow.ts': `${purpose(
    'glow driver',
  )}export const glow = 0;\n`,
};

async function built() {
  const p = makeProject(FILES);
  cleanups.push(p.cleanup);
  return buildAndWrite({ root: p.root });
}

const flow = steps => `## lights\n\`\`\`flow\n${steps}\n\`\`\`\n`;

test('a step in square brackets is a module that wires its neighbours at mount', () => {
  const [f] = parseFlows(
    flow(
      'mic -> audio\n  -> [screens/Practice] -> motion/drivers/keyGlow -> screen',
    ),
  );
  assert.deepEqual(f.steps, [
    'mic',
    'audio',
    'screens/Practice',
    'motion/drivers/keyGlow',
    'screen',
  ]);
  assert.deepEqual(f.wiring, [false, false, true, false, false]);
  assert.deepEqual(flowStepLabels(f), [
    'mic',
    'audio',
    '[screens/Practice]',
    'motion/drivers/keyGlow',
    'screen',
  ]);
});

test('a wiring step still needs a code connection to each neighbour', async () => {
  const { graph, config } = await built();
  const ok = parseFlows(
    flow(
      'mic -> audio -> [screens/Practice] -> motion/drivers/keyGlow -> screen',
    ),
  );
  assert.deepEqual(checkFlows(graph, ok, config), []);
  const unconnected = parseFlows(
    flow('mic -> audio -> [App.tsx] -> motion/drivers/keyGlow -> screen'),
  );
  assert.deepEqual(
    checkFlows(graph, unconnected, config).map(p => p.type),
    ['flow-missing-connection', 'flow-missing-connection'],
  );
});

test('a wiring step needs a module on each side', async () => {
  const { graph, config } = await built();
  for (const steps of [
    '[screens/Practice] -> motion/drivers/keyGlow -> screen',
    'audio -> [screens/Practice] -> screen',
  ]) {
    assert.deepEqual(
      checkFlows(graph, parseFlows(flow(steps)), config).map(p => p.type),
      ['flow-wiring-misplaced'],
      steps,
    );
  }
});

test('hot-path labels a wiring step instead of warning about it', async () => {
  const { graph, config } = await built();
  const idx = indexGraph(graph);
  const wired = hotPath(
    idx,
    parseFlows(
      flow(
        'mic -> audio -> [screens/Practice] -> motion/drivers/keyGlow -> screen',
      ),
    ),
    config,
  );
  assert.match(
    wired,
    /screens\/Practice \[js\] {3}\(wires at mount; nothing per frame\)/,
  );
  assert.doesNotMatch(wired, /⚠/);
  const plain = hotPath(
    idx,
    parseFlows(
      flow(
        'mic -> audio -> screens/Practice -> motion/drivers/keyGlow -> screen',
      ),
    ),
    config,
  );
  assert.match(
    plain,
    /screens\/Practice \[js\] {3}⚠ JS thread inside the hot path/,
  );
});
