import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCode, analyzeNative, parseHeader } from '../lib/analyze.mjs';
import { matches } from '../lib/glob.mjs';

test('header tags: purpose spans lines, thread is read', () => {
  const h = parseHeader(
    '/**\n * Title\n * @purpose Turns note events\n *   into glow values.\n * @thread ui\n */\nexport {};\n',
  );
  assert.equal(h.purpose, 'Turns note events into glow values.');
  assert.equal(h.thread, 'ui');
  assert.deepEqual(parseHeader('const a = 1;\n'), {
    purpose: null,
    thread: null,
  });
});

test('imports of every form, with type-only and names', () => {
  const a = analyzeCode(
    'src/x.tsx',
    `import React from 'react';
import type { Note } from './types';
import { type A, type B } from './ab';
import { Keyboard } from './Keyboard';
export { clock } from '../sync/clock';
const cfg = require('./cfg');
const lazy = () => import('./lazy');
export function Screen() { return <Keyboard.Key><Keyboard /></Keyboard.Key>; }
export const value = 1;
export default Screen;
`,
  );
  const specs = a.imports.map(i => [i.spec, i.kind, i.typeOnly]);
  assert.deepEqual(specs, [
    ['react', 'import', false],
    ['./types', 'import', true],
    ['./ab', 'import', true],
    ['./Keyboard', 'import', false],
    ['../sync/clock', 'export', false],
    ['./cfg', 'require', false],
    ['./lazy', 'dynamic', false],
  ]);
  assert.deepEqual(a.imports[3].names, ['Keyboard']);
  assert.deepEqual(a.jsxTags, ['Keyboard']);
  assert.deepEqual(a.exports, ['Screen', 'clock', 'default', 'value']);
});

test('worklets, Turbo Module specs and NativeModules uses are detected', () => {
  const a = analyzeCode(
    'src/motion/a.ts',
    `import { TurboModuleRegistry, NativeModules } from 'react-native';
export default TurboModuleRegistry.getEnforcing('AudioEngine');
const legacy = NativeModules.KeepAwake;
function tick() { 'worklet'; return 1; }
`,
  );
  assert.equal(a.hasWorklets, true);
  assert.deepEqual(a.nativeSpecs, ['AudioEngine']);
  assert.deepEqual(a.nativeUses, ['KeepAwake']);
  assert.equal(
    analyzeCode('src/b.ts', 'useAnimatedStyle(() => ({}));').hasWorklets,
    true,
  );
});

test('native files: module names, includes, Kotlin imports', () => {
  const objc = analyzeNative(
    'ios/AudioEngine.mm',
    '#import "AudioEngine.h"\nRCT_EXPORT_MODULE(AudioEngine)\n',
  );
  assert.deepEqual(objc.includes, ['AudioEngine.h']);
  assert.deepEqual(objc.moduleNames, ['AudioEngine']);
  const kt = analyzeNative(
    'android/app/src/main/java/com/x/AudioModule.kt',
    'package com.x\nimport com.x.dsp.Pitch\nclass AudioModule { companion object { const val NAME = "AudioEngine" } }\n',
  );
  assert.equal(kt.pkg, 'com.x');
  assert.deepEqual(kt.imports, ['com.x.dsp.Pitch']);
  assert.deepEqual(kt.moduleNames, ['AudioEngine']);
  assert.deepEqual(
    analyzeNative('ios/A.swift', '@objc(AudioEngine)\nclass A {}').moduleNames,
    ['AudioEngine'],
  );
  const cxx = analyzeNative(
    'src/x/shared/Engine.h',
    'struct E { static constexpr auto kModuleName = "NativePianoEngine"; };',
  );
  assert.deepEqual(cxx.moduleNames, ['NativePianoEngine']);
});

test('glob semantics', () => {
  assert.ok(matches('src/audio/a/b.ts', 'src/audio/**'));
  assert.ok(!matches('src/audiox/a.ts', 'src/audio/**'));
  assert.ok(matches('__tests__/App.test.tsx', '**/__tests__/**'));
  assert.ok(matches('src/features/lesson', 'src/features/*'));
  assert.ok(!matches('src/features/lesson/model', 'src/features/*'));
  assert.ok(matches('src/audio/index.tsx', 'src/audio/index.{ts,tsx}'));
});
