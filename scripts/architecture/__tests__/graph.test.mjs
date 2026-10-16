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

test('modules: entries, index folders, loose files, platform and native folders', async () => {
  const g = await graphOf({
    'App.tsx': `${purpose('root')}import { Home } from './src/screens/Home';\nexport default () => <Home />;\n`,
    'index.js': `${purpose('entry')}import App from './App';\n`,
    'src/screens/Home/index.tsx': `${purpose('home screen')}import { Row } from './Row';\nexport const Home = () => <Row />;\n`,
    'src/screens/Home/Row.tsx': 'export const Row = () => null;\n',
    'src/motion/drivers/keyGlow.ts': `${purpose('glow driver')}export const glow = 1;\n`,
    'src/audio/index.ts': `${purpose('audio api')}import Native from '../../native/AudioEngine/NativeAudioEngine';\nexport { Native };\n`,
    'native/AudioEngine/NativeAudioEngine.ts': "import { TurboModuleRegistry } from 'react-native';\nexport default TurboModuleRegistry.getEnforcing('AudioEngine');\n",
    'native/AudioEngine/ios/AudioEngine.mm': 'RCT_EXPORT_MODULE(AudioEngine)\n',
    'ios/App/AppDelegate.swift': 'class AppDelegate {}\n',
    'src/screens/Home/__tests__/Home.test.tsx': "import { Home } from '../index';\n",
  });
  const byId = Object.fromEntries(g.modules.map(m => [m.id, m]));
  assert.deepEqual(Object.keys(byId).sort(), [
    'App.tsx',
    'index.js',
    'ios',
    'native/AudioEngine',
    'src/audio',
    'src/motion/drivers/keyGlow.ts',
    'src/screens/Home',
  ]);
  assert.equal(byId['src/screens/Home'].kind, 'screen');
  assert.equal(byId['src/screens/Home'].entry, 'src/screens/Home/index.tsx');
  assert.equal(byId['src/motion/drivers/keyGlow.ts'].kind, 'driver');
  assert.equal(byId['src/motion/drivers/keyGlow.ts'].name, 'motion/drivers/keyGlow');
  assert.equal(byId['src/motion/drivers/keyGlow.ts'].thread, 'ui');
  assert.equal(byId['native/AudioEngine'].kind, 'native-module');
  assert.equal(byId.ios.kind, 'platform');
  assert.ok(byId.ios.purpose, 'platform modules get their purpose from the config');
  assert.ok(!g.files.some(f => f.id.includes('__tests__')), 'tests are not part of the graph');

  const edge = (from, to, kind) => g.edges.some(e => e.from === from && e.to === to && e.kind === kind);
  assert.ok(edge('App.tsx', 'src/screens/Home/index.tsx', 'renders'));
  assert.ok(edge('src/screens/Home/index.tsx', 'src/screens/Home/Row.tsx', 'renders'));
  assert.ok(edge('native/AudioEngine/NativeAudioEngine.ts', 'native/AudioEngine/ios/AudioEngine.mm', 'calls-native'));
  assert.ok(g.moduleEdges.some(e => e.from === 'App.tsx' && e.to === 'src/screens/Home'));
  assert.ok(!g.moduleEdges.some(e => e.from === e.to), 'no self edges between modules');
});

test('platform variants and unresolved imports', async () => {
  const g = await graphOf({
    'App.tsx': `${purpose('root')}import { haptics } from './src/shared/haptics';\nimport x from './missing';\n`,
    'src/shared/haptics.ios.ts': 'export const haptics = 1;\n',
    'src/shared/haptics.android.ts': 'export const haptics = 2;\n',
  });
  const targets = g.edges.filter(e => e.from === 'App.tsx' && e.kind === 'imports').map(e => e.to);
  assert.deepEqual(targets, ['src/shared/haptics.android.ts', 'src/shared/haptics.ios.ts']);
  assert.deepEqual(g.unresolved, [{ file: 'App.tsx', spec: './missing' }]);
});

test('output is deterministic', async () => {
  const files = {
    'App.tsx': `${purpose('root')}import './src/b';\nimport './src/a';\n`,
    'src/a.ts': `${purpose('a')}export const a = 1;\n`,
    'src/b.ts': `${purpose('b')}export const b = 1;\n`,
  };
  const one = JSON.stringify(await graphOf(files));
  const two = JSON.stringify(await graphOf(files));
  assert.equal(one, two);
});
