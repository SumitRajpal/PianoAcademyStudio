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
    'App.tsx': `${purpose(
      'root',
    )}import { Home } from './src/screens/Home';\nexport default () => <Home />;\n`,
    'index.js': `${purpose('entry')}import App from './App';\n`,
    'src/screens/Home/index.tsx': `${purpose(
      'home screen',
    )}import { Row } from './Row';\nexport const Home = () => <Row />;\n`,
    'src/screens/Home/Row.tsx': 'export const Row = () => null;\n',
    'src/motion/drivers/keyGlow.ts': `${purpose(
      'glow driver',
    )}export const glow = 1;\n`,
    'src/audio/index.ts': `${purpose(
      'audio api',
    )}import Native from '../../native/AudioEngine/NativeAudioEngine';\nexport { Native };\n`,
    'native/AudioEngine/NativeAudioEngine.ts':
      "import { TurboModuleRegistry } from 'react-native';\nexport default TurboModuleRegistry.getEnforcing('AudioEngine');\n",
    'native/AudioEngine/ios/AudioEngine.mm': 'RCT_EXPORT_MODULE(AudioEngine)\n',
    'ios/App/AppDelegate.swift': 'class AppDelegate {}\n',
    'src/screens/Home/__tests__/Home.test.tsx':
      "import { Home } from '../index';\n",
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
  assert.equal(
    byId['src/motion/drivers/keyGlow.ts'].name,
    'motion/drivers/keyGlow',
  );
  assert.equal(byId['src/motion/drivers/keyGlow.ts'].thread, 'ui');
  assert.equal(byId['native/AudioEngine'].kind, 'native-module');
  assert.equal(byId.ios.kind, 'platform');
  assert.ok(
    byId.ios.purpose,
    'platform modules get their purpose from the config',
  );
  assert.ok(
    !g.files.some(f => f.id.includes('__tests__')),
    'tests are not part of the graph',
  );

  const edge = (from, to, kind) =>
    g.edges.some(e => e.from === from && e.to === to && e.kind === kind);
  assert.ok(edge('App.tsx', 'src/screens/Home/index.tsx', 'renders'));
  assert.ok(
    edge('src/screens/Home/index.tsx', 'src/screens/Home/Row.tsx', 'renders'),
  );
  assert.ok(
    edge(
      'native/AudioEngine/NativeAudioEngine.ts',
      'native/AudioEngine/ios/AudioEngine.mm',
      'calls-native',
    ),
  );
  assert.ok(
    g.moduleEdges.some(
      e => e.from === 'App.tsx' && e.to === 'src/screens/Home',
    ),
  );
  assert.ok(
    !g.moduleEdges.some(e => e.from === e.to),
    'no self edges between modules',
  );
});

test('native includes across folders and C++ TurboModules link to JS', async () => {
  const g = await graphOf({
    'src/engine/index.ts': `${purpose(
      'engine api',
    )}import { TurboModuleRegistry } from 'react-native';\nexport default TurboModuleRegistry.getEnforcing('NativePianoEngine');\n`,
    'src/engine/shared/NativePianoEngine.h':
      'struct N { static constexpr auto kModuleName = "NativePianoEngine"; };\n',
    'src/engine/shared/AudioInput.h': 'struct AudioInput {};\n',
    'ios/App/Provider.mm':
      '#include "../../src/engine/shared/NativePianoEngine.h"\n#include "AudioInput.h"\n',
  });
  const edge = (from, to, kind) =>
    g.edges.some(e => e.from === from && e.to === to && e.kind === kind);
  assert.ok(
    edge(
      'ios/App/Provider.mm',
      'src/engine/shared/NativePianoEngine.h',
      'imports',
    ),
    'relative include',
  );
  assert.ok(
    edge('ios/App/Provider.mm', 'src/engine/shared/AudioInput.h', 'imports'),
    'include by search path',
  );
  assert.ok(
    edge(
      'src/engine/index.ts',
      'src/engine/shared/NativePianoEngine.h',
      'calls-native',
    ),
  );
  assert.ok(g.moduleEdges.some(e => e.from === 'ios' && e.to === 'src/engine'));
});

test('threads follow role: tag, config, barrel, component or hook, plane default', async () => {
  const g = await graphOf({
    'src/motion/scenes/Keys/index.ts': `${purpose(
      'keys',
    )}export { Keys } from './Keys';\nexport { drawKey } from './drawKey';\n`,
    'src/motion/scenes/Keys/Keys.tsx': 'export const Keys = () => null;\n',
    'src/motion/scenes/Keys/drawKey.ts': 'export const drawKey = () => 1;\n',
    'src/motion/scenes/Keys/drawKey2.ts': 'export const drawKey2 = () => 2;\n',
    'src/motion/scenes/Keys/useKeys.ts':
      'export function useKeys() { return 1; }\n',
    'src/motion/scenes/Keys/keysLook.ts': 'export const LOOK = { r: 1 };\n',
    'src/motion/scenes/Keys/tagged.ts':
      '/** @thread js */\nexport const t = 1;\n',
    'src/motion/scenes/Keys/drawKey3.ts': 'export const drawKey3 = () => 3;\n',
  });
  const thread = id =>
    g.files.find(f => f.id === `src/motion/scenes/Keys/${id}`).thread;
  assert.equal(thread('index.ts'), 'any', 'barrel');
  assert.equal(thread('Keys.tsx'), 'js', 'React component');
  assert.equal(thread('useKeys.ts'), 'js', 'hook');
  assert.equal(thread('keysLook.ts'), 'any', 'config: looks are data');
  assert.equal(thread('drawKey.ts'), 'ui', 'plane default');
  assert.equal(thread('tagged.ts'), 'js', 'header tag wins');
  assert.equal(
    g.modules.find(m => m.id === 'src/motion/scenes/Keys').thread,
    'ui',
    "barrel module takes its files' main thread",
  );
});

test('platform variants and unresolved imports', async () => {
  const g = await graphOf({
    'App.tsx': `${purpose(
      'root',
    )}import { haptics } from './src/shared/haptics';\nimport x from './missing';\n`,
    'src/shared/haptics.ios.ts': 'export const haptics = 1;\n',
    'src/shared/haptics.android.ts': 'export const haptics = 2;\n',
  });
  const targets = g.edges
    .filter(e => e.from === 'App.tsx' && e.kind === 'imports')
    .map(e => e.to);
  assert.deepEqual(targets, [
    'src/shared/haptics.android.ts',
    'src/shared/haptics.ios.ts',
  ]);
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
