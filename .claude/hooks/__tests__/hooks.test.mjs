/**
 * Runs each hook the way Claude Code does: JSON on stdin, CLAUDE_PROJECT_DIR set,
 * output read from stdout. Tools the hooks start (prettier, eslint, tsc, jest, the
 * engine suite) are faked with CLAUDE_HOOKS_FAKE.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildAndWrite } from '../../../scripts/architecture/lib/pipeline.mjs';
import {
  makeProject,
  purpose,
  REPO_ROOT,
  writeFiles,
} from '../../../scripts/architecture/__tests__/helpers.mjs';

const HOOKS = fileURLToPath(new URL('..', import.meta.url));
const OK = {
  prettier: {},
  eslint: {},
  tsc: {},
  jest: {},
  'node-test': {},
  'engine-scenarios': {},
  'engine-tsan': {},
};
const cleanups = [];
after(() => cleanups.forEach(c => c()));

const BASE = {
  'App.tsx': `${purpose(
    'root',
  )}import { Practice } from './src/screens/Practice';\nexport default () => <Practice />;\n`,
  'src/screens/Practice/index.tsx': `${purpose(
    'practice screen',
  )}import { glow } from '../../motion/drivers/keyGlow';\nexport const Practice = () => glow;\n`,
  'src/motion/drivers/keyGlow.ts': `${purpose(
    'glow driver',
  )}import { now } from '../../sync';\nexport const glow = now;\n`,
  'src/sync/index.ts': `${purpose('clock')}export const now = 0;\n`,
  'src/features/score/index.ts': `${purpose('score')}export const s = 1;\n`,
};

function project(files = BASE, { git = false } = {}) {
  const p = makeProject(files);
  cleanups.push(p.cleanup);
  cpSync(
    join(REPO_ROOT, 'docs/troubleshooting.md'),
    join(p.root, 'docs/troubleshooting.md'),
  );
  if (git) {
    spawnSync('git', ['init', '-q', '-b', 'feat/test'], { cwd: p.root });
  }
  return p.root;
}

function hook(name, input, { root, fake = OK, file = `${name}.mjs` } = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS, file)], {
    input:
      typeof input === 'string'
        ? input
        : JSON.stringify({ session_id: 'sess-1', cwd: root, ...input }),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: root,
      CLAUDE_HOOKS_NO_NOTIFY: '1',
      CLAUDE_HOOKS_FAKE: JSON.stringify(fake),
    },
  });
  let json = null;
  try {
    json = r.stdout.trim() ? JSON.parse(r.stdout) : null;
  } catch {
    json = null;
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
const context = r => r.json?.hookSpecificOutput?.additionalContext || '';
const decision = r => r.json?.hookSpecificOutput?.permissionDecision;

test('session-start: map, handoff note, git, and the state saved before compaction', async () => {
  const root = project(BASE, { git: true });
  mkdirSync(join(root, '.claude/handoff'), { recursive: true });
  writeFileSync(
    join(root, '.claude/handoff/2026-10-01T0900-aaaa.md'),
    '# old\n',
  );
  writeFileSync(
    join(root, '.claude/handoff/2026-10-02T0900-bbbb.md'),
    '# Handoff latest\n- did things\n',
  );
  const r = hook('session-start', { source: 'startup' }, { root });
  assert.equal(r.code, 0);
  assert.match(context(r), /^Architecture map · 5 modules/);
  assert.match(
    context(r),
    /Last handoff note \(\.claude\/handoff\/2026-10-02T0900-bbbb\.md\)/,
  );
  assert.match(context(r), /Git: branch feat\/test/);
  assert.ok(
    existsSync(join(root, 'docs/architecture/graph.json')),
    'the graph is rebuilt first',
  );

  hook('pre-compact', { trigger: 'auto' }, { root });
  const after = hook('session-start', { source: 'compact' }, { root });
  assert.match(
    context(after),
    /Working state saved before compaction:\n- Branch: feat\/test/,
  );
});

test('user-prompt-submit: notes on mentioned modules, and the turn start', async () => {
  const root = project();
  await buildAndWrite({ root });
  const r = hook(
    'user-prompt-submit',
    { prompt: 'Make keyGlow pulse faster' },
    { root },
  );
  assert.match(context(r), /motion\/drivers\/keyGlow \[driver · motion · ui\]/);
  assert.match(context(r), /used by: screens\/Practice/);
  const quiet = hook(
    'user-prompt-submit',
    { prompt: 'fix the app and the audio' },
    { root },
  );
  assert.equal(quiet.stdout, '', 'generic words name no module');
  const state = JSON.parse(
    readFileSync(join(root, '.claude/state/sessions/sess-1.json'), 'utf8'),
  );
  assert.ok(state.turnStartedAt > 0);
});

test('pre-tool-use: protected files, setup files and the generated doc', async () => {
  const root = project();
  await buildAndWrite({ root });
  const edit = (file, extra = {}) =>
    hook(
      'pre-tool-use',
      {
        tool_name: 'Edit',
        tool_input: {
          file_path: join(root, file),
          old_string: 'x',
          new_string: 'y',
          ...extra,
        },
      },
      { root },
    );
  assert.equal(decision(edit('docs/architecture/graph.json')), 'deny');
  assert.equal(
    decision(
      hook(
        'pre-tool-use',
        {
          tool_name: 'Write',
          tool_input: { file_path: join(root, '.env'), content: 'A=1' },
        },
        { root },
      ),
    ),
    'deny',
  );
  assert.equal(decision(edit('android/app/build/x.txt')), 'deny');
  assert.equal(decision(edit('.claude/settings.json')), 'ask');
  assert.equal(decision(edit('scripts/architecture/config.mjs')), 'ask');
  assert.equal(
    edit('.claude/handoff/note.md').stdout,
    '',
    'handoff notes are free to edit',
  );

  const doc = readFileSync(
    join(root, 'docs/architecture/ARCHITECTURE.md'),
    'utf8',
  );
  const gen = edit('docs/architecture/ARCHITECTURE.md', {
    old_string: '## 1. Overview',
    new_string: '## 1. Hand edit',
  });
  assert.equal(
    decision(gen),
    'deny',
    'the generated part is rebuilt from code',
  );
  assert.ok(doc.includes('## 7. Conventions'));
  const conv = edit('docs/architecture/ARCHITECTURE.md', {
    old_string: '## 7. Conventions',
    new_string: '## 7. Conventions\n\n- New convention.',
  });
  assert.equal(conv.stdout, '', 'the conventions section is Claude’s');
});

test('pre-tool-use: a rule-breaking edit is blocked before it lands', async () => {
  const root = project();
  await buildAndWrite({ root });
  const write = content =>
    hook(
      'pre-tool-use',
      {
        tool_name: 'Write',
        tool_input: {
          file_path: join(root, 'src/motion/drivers/keyGlow.ts'),
          content,
        },
      },
      { root },
    );
  const bad = write(
    `${purpose(
      'glow driver',
    )}import { s } from '../../features/score';\nexport const glow = s;\n`,
  );
  assert.equal(decision(bad), 'deny');
  assert.match(
    bad.json.hookSpecificOutput.permissionDecisionReason,
    /Motion code may not import features/,
  );
  const fine = write(
    `${purpose(
      'glow driver v2',
    )}import { now } from '../../sync';\nexport const glow = now + 1;\n`,
  );
  assert.equal(fine.stdout, '');
});

test('pre-tool-use: blocked shell commands', () => {
  const root = project();
  const bash = command =>
    decision(
      hook(
        'pre-tool-use',
        { tool_name: 'Bash', tool_input: { command } },
        { root },
      ),
    );
  for (const cmd of [
    'git push --force origin main',
    'git push -f',
    'git push origin +main',
    'git branch -D old',
    'git push origin --delete old',
    'cat .env',
    'cp .env.local /tmp/x',
    'ls android/app/debug.keystore',
    'xcrun simctl boot "iPhone 16"',
    "xcodebuild -workspace ios/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16' build",
    'npm run ios',
    'npx react-native run-ios',
  ]) {
    assert.equal(bash(cmd), 'deny', cmd);
  }
  for (const cmd of [
    'git push origin feat/x',
    'git push -u origin chore/claude-setup',
    'git status',
    'npm run ios -- --device "Ramster"',
    "xcodebuild -workspace ios/App.xcworkspace -scheme App -destination 'id=00008120-001C1852022B601E' build",
    'xcrun simctl list devices',
    'xcrun devicectl list devices',
    "node -e 'console.log(process.env.HOME)'",
  ]) {
    assert.equal(bash(cmd), undefined, cmd);
  }
});

test('post-tool-use: formats, reports what eslint could not fix, rebuilds the graph', async () => {
  const root = project();
  writeFiles(root, {
    'src/sync/extra.ts': `${purpose('extra')}export const e = 1;\n`,
  });
  const lint = {
    ...OK,
    eslint: {
      code: 1,
      stdout: `${root}/src/sync/extra.ts:1:1: 'x' is defined but never used. [Error/no-unused-vars]\n`,
    },
  };
  const r = hook(
    'post-tool-use',
    {
      tool_name: 'Write',
      tool_input: { file_path: join(root, 'src/sync/extra.ts') },
      tool_response: {},
    },
    { root, fake: lint },
  );
  assert.equal(r.json?.decision, 'block');
  assert.match(r.json.reason, /ESLint found problems/);
  const graph = JSON.parse(
    readFileSync(join(root, 'docs/architecture/graph.json'), 'utf8'),
  );
  assert.ok(
    graph.files.some(f => f.id === 'src/sync/extra.ts'),
    'graph rebuilt',
  );
  const log = readFileSync(
    join(root, '.claude/state/sessions/sess-1.files.log'),
    'utf8',
  );
  assert.match(log, /\tsrc\/sync\/extra\.ts\n/);

  const bashRun = hook(
    'post-tool-use',
    {
      tool_name: 'Bash',
      tool_input: { command: 'sed -i x' },
      tool_response: {
        bashEditDiff: { changedFiles: [join(root, 'src/sync/index.ts')] },
      },
    },
    { root },
  );
  assert.equal(bashRun.code, 0);
  assert.match(
    readFileSync(join(root, '.claude/state/sessions/sess-1.files.log'), 'utf8'),
    /\tsrc\/sync\/index\.ts\n/,
  );
});

test('build-failure: known fixes from docs/troubleshooting.md', () => {
  const root = project();
  const r = hook(
    'build-failure',
    {
      tool_name: 'Bash',
      tool_input: { command: 'cd ios && pod install' },
      error:
        'Exit code 1\n[!] CocoaPods could not find compatible versions for pod "RNSkia"',
      is_interrupt: false,
    },
    { root },
  );
  assert.match(context(r), /Known fixes/);
  assert.match(context(r), /pod install --repo-update/);
  const other = hook(
    'build-failure',
    {
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      error: 'Exit code 1',
    },
    { root },
  );
  assert.equal(other.stdout, '', 'only build commands get hints');
});

test('stop: checks what changed, blocks once, then lets Claude finish', async () => {
  const root = project();
  await buildAndWrite({ root });
  const stop = (extra = {}, fake = OK) =>
    hook('stop', { stop_hook_active: false, ...extra }, { root, fake });

  assert.equal(stop().stdout, '', 'nothing changed: nothing to check');

  writeFiles(root, { 'src/features/lesson/index.ts': 'export const l = 1;\n' });
  hook(
    'post-tool-use',
    {
      tool_name: 'Write',
      tool_input: { file_path: join(root, 'src/features/lesson/index.ts') },
    },
    { root },
  );
  const first = stop();
  assert.equal(first.json?.decision, 'block');
  assert.match(first.json.reason, /features\/lesson has no purpose/);

  const second = stop({ stop_hook_active: true });
  assert.equal(
    second.json?.decision,
    undefined,
    'the loop guard lets Claude stop',
  );
  assert.match(second.json?.systemMessage || '', /still failing/);
  const state = JSON.parse(
    readFileSync(join(root, '.claude/state/sessions/sess-1.json'), 'utf8'),
  );
  assert.ok(state.unresolved.length > 0, 'kept for the handoff note');

  writeFiles(root, {
    'src/features/lesson/index.ts': `${purpose('lesson')}export const l = 1;\n`,
  });
  const tscFails = stop(
    {},
    {
      ...OK,
      tsc: {
        code: 2,
        stdout:
          'src/features/lesson/index.ts(1,7): error TS2322: Type mismatch.\n',
      },
    },
  );
  assert.match(
    tscFails.json?.reason || '',
    /TypeScript \(tsc --noEmit\):\n- src\/features\/lesson\/index\.ts\(1,7\): error TS2322/,
  );
  assert.equal(stop().stdout, '', 'all checks pass');
});

test('stop: engine changes run the regression gate', async () => {
  const root = project({
    ...BASE,
    'src/motion/scenes/PianoMaster/CorePianoNotesDetection/index.ts': `${purpose(
      'engine api',
    )}export const e = 1;\n`,
    'src/motion/scenes/PianoMaster/CorePianoNotesDetection/shared/Cascade.h':
      'struct Cascade {};\n',
    'src/motion/scenes/PianoMaster/CorePianoNotesDetection/test/run.sh':
      '#!/bin/sh\n',
  });
  await buildAndWrite({ root });
  hook(
    'post-tool-use',
    {
      tool_name: 'Edit',
      tool_input: {
        file_path: join(
          root,
          'src/motion/scenes/PianoMaster/CorePianoNotesDetection/shared/Cascade.h',
        ),
      },
    },
    { root },
  );
  const failing = {
    ...OK,
    'engine-scenarios': {
      code: 1,
      stdout:
        '  [FAIL] repeated C4      expected 4, got 3\n45 passed, 1 failed\n',
    },
  };
  const r = hook('stop', { stop_hook_active: false }, { root, fake: failing });
  assert.match(r.json?.reason || '', /Note engine scenarios/);
  assert.match(r.json.reason, /\[FAIL\] repeated C4/);
});

test('session-end writes a handoff note only when the session changed something', async () => {
  const quietRoot = project();
  hook('session-end', { reason: 'prompt_input_exit' }, { root: quietRoot });
  assert.ok(
    !existsSync(join(quietRoot, '.claude/handoff')),
    'no note for a session that changed nothing',
  );

  const root = project(BASE, { git: true });
  hook(
    'post-tool-use',
    {
      tool_name: 'Write',
      tool_input: { file_path: join(root, 'src/sync/index.ts') },
    },
    { root },
  );
  const start = Date.now();
  hook('session-end', { reason: 'clear' }, { root });
  assert.ok(Date.now() - start < 1500, 'fits the 1.5 s SessionEnd budget');
  const notes = readdirSync(join(root, '.claude/handoff'));
  assert.equal(notes.length, 1);
  const note = readFileSync(join(root, '.claude/handoff', notes[0]), 'utf8');
  assert.match(note, /ended: clear · branch: feat\/test/);
  assert.match(note, /- src\/sync\/index\.ts/);
});

test('subagent-start, notification, statusline, and failing open', async () => {
  const root = project(BASE, { git: true });
  await buildAndWrite({ root });
  assert.match(
    context(
      hook(
        'subagent-start',
        { agent_id: 'a1', agent_type: 'Explore' },
        { root },
      ),
    ),
    /^Architecture map/,
  );
  assert.equal(
    hook(
      'notification',
      { message: 'Claude needs your permission', title: 'Permission needed' },
      { root },
    ).code,
    0,
  );

  const status = spawnSync(
    process.execPath,
    [join(HOOKS, '../statusline.mjs')],
    {
      input: JSON.stringify({
        model: { display_name: 'Opus' },
        workspace: { project_dir: root },
        context_window: { used_percentage: 41.6 },
      }),
      encoding: 'utf8',
    },
  );
  assert.equal(status.stdout, 'feat/test · Opus · ctx 42% · arch ✓');

  const broken = hook('pre-tool-use', 'this is not json', { root });
  assert.equal(broken.code, 0, 'bad input never blocks the session');
});
