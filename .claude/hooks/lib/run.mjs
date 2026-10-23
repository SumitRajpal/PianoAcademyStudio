/**
 * Runs project tools (prettier, eslint, tsc, jest, node --test) with a timeout.
 * Tests can fake a tool's result with CLAUDE_HOOKS_FAKE='{"tsc":{"code":1,"stdout":"..."}}'.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BINARIES = {
  prettier: 'node_modules/.bin/prettier',
  eslint: 'node_modules/.bin/eslint',
  tsc: 'node_modules/.bin/tsc',
  jest: 'node_modules/.bin/jest',
};

function fake(name) {
  if (!process.env.CLAUDE_HOOKS_FAKE) {
    return null;
  }
  try {
    const all = JSON.parse(process.env.CLAUDE_HOOKS_FAKE);
    return all[name]
      ? { code: 0, stdout: '', stderr: '', timedOut: false, ...all[name] }
      : null;
  } catch {
    return null;
  }
}

/**
 * name: a known tool (prettier, eslint, tsc, jest, node-test), or any label together
 * with opts.command (e.g. "bash") to run a project script.
 */
export function runTool(
  root,
  name,
  args,
  { timeoutMs = 30000, command: custom } = {},
) {
  const faked = fake(name);
  if (faked) {
    return Promise.resolve(faked);
  }
  let command;
  let fullArgs = args;
  if (custom) {
    command = custom;
  } else if (name === 'node-test') {
    command = process.execPath;
    fullArgs = ['--test', ...args];
  } else {
    command = join(root, BINARIES[name]);
    if (!existsSync(command)) {
      return Promise.resolve({
        code: 0,
        stdout: '',
        stderr: `${name} not installed`,
        timedOut: false,
        missing: true,
      });
    }
  }
  return new Promise(resolve => {
    const child = spawn(command, fullArgs, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(err), timedOut });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code: timedOut ? 124 : code ?? 1, stdout, stderr, timedOut });
    });
  });
}
