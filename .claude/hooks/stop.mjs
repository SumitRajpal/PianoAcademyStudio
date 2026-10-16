#!/usr/bin/env node
/**
 * Stop: before Claude says it's done, checks what changed this turn:
 *   architecture (rules, purposes, flows) · tsc --noEmit · related Jest tests ·
 *   tooling tests · eslint. Blocks the finish once with a list of fixes; on the second
 *   attempt it lets Claude stop and records what's still failing for the handoff note.
 * Also sends a macOS notification when a long turn finishes.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { uncommitted } from './lib/git.mjs';
import { archLib, block, headLines, runHook } from './lib/hook.mjs';
import { notify } from './lib/notify.mjs';
import { runTool } from './lib/run.mjs';
import { changedFiles, readSession, updateSession } from './lib/state.mjs';

const APP_CODE = /\.(?:[jt]sx?)$/;
const TS = /\.tsx?$/;
const LINTABLE = /\.(?:[cm]?[jt]sx?)$/;
const isTooling = f => f.startsWith('scripts/') || f.startsWith('.claude/');

function filesThisTurn(root, id, since) {
  const files = new Set(changedFiles(root, id, since));
  if (since) {
    for (const c of uncommitted(root) || []) {
      try {
        if (statSync(join(root, c.path)).mtimeMs >= since) {
          files.add(c.path);
        }
      } catch {
        // Deleted files have no mtime; the log already has the ones Claude touched.
      }
    }
  }
  return [...files].filter(f => !f.startsWith('.claude/state/') && !f.startsWith('.claude/handoff/'));
}

function tscErrors(out) {
  return out
    .split('\n')
    .filter(l => /error TS\d+/.test(l))
    .slice(0, 12);
}

async function architectureProblems(root, changed) {
  const { buildAndWrite } = await archLib('pipeline.mjs');
  const { problems, graph } = await buildAndWrite({ root });
  const touched = new Set(changed);
  const touchedModules = new Set(
    graph.files.filter(f => touched.has(f.id)).map(f => f.module),
  );
  const flowsChanged = touched.has('docs/architecture/flows.md') || touched.has('scripts/architecture/config.mjs');
  return problems.filter(p => {
    if (p.type === 'violation') {
      return touched.has(p.file) || touched.has(p.target) || (p.cycle || []).some(f => touched.has(f));
    }
    if (p.type === 'missing-purpose') {
      return touchedModules.has(p.module) || (p.files || []).some(f => touched.has(f));
    }
    return flowsChanged || touchedModules.has(p.from) || touchedModules.has(p.to) || p.type === 'flow-unknown-step';
  });
}

runHook('stop', async (input, { root }) => {
  const id = input.session_id;
  const session = readSession(root, id);
  const since = session.turnStartedAt || 0;
  const changed = filesThisTurn(root, id, since);
  const longTurn = since && Date.now() - since > 30000;

  if (!changed.length) {
    if (longTurn) {
      notify('Claude Code · Piano Academy Studio', 'Finished. Your turn.');
    }
    return undefined;
  }

  const existing = changed.filter(f => existsSync(join(root, f)));
  const appCode = existing.filter(f => APP_CODE.test(f) && !isTooling(f));
  const tooling = changed.some(f => isTooling(f) && LINTABLE.test(f));
  const lintable = existing.filter(f => LINTABLE.test(f));

  const [arch, tsc, jest, toolingTests, eslint] = await Promise.all([
    architectureProblems(root, changed),
    existing.some(f => TS.test(f) && !isTooling(f))
      ? runTool(root, 'tsc', ['--noEmit', '-p', 'tsconfig.json'], { timeoutMs: 50000 })
      : null,
    appCode.length
      ? runTool(root, 'jest', ['--findRelatedTests', ...appCode, '--passWithNoTests', '--ci', '--silent'], { timeoutMs: 50000 })
      : null,
    tooling
      ? runTool(root, 'node-test', ['scripts/architecture/__tests__/*.test.mjs', '.claude/hooks/__tests__/*.test.mjs'], { timeoutMs: 50000 })
      : null,
    lintable.length ? runTool(root, 'eslint', ['--format', 'unix', ...lintable], { timeoutMs: 30000 }) : null,
  ]);

  const sections = [];
  if (arch.length) {
    sections.push(`Architecture:\n${arch.map(p => `- ${p.message}`).join('\n')}`);
  }
  if (tsc && tsc.code !== 0) {
    const errors = tscErrors(tsc.stdout + tsc.stderr);
    sections.push(`TypeScript (tsc --noEmit):\n${errors.length ? errors.map(e => `- ${e}`).join('\n') : headLines(tsc.stdout + tsc.stderr, 15)}`);
  }
  if (jest && jest.code !== 0) {
    sections.push(`Tests (jest --findRelatedTests ${appCode.join(' ')}):\n${headLines(jest.stderr || jest.stdout, 30)}`);
  }
  if (toolingTests && toolingTests.code !== 0) {
    const failed = (toolingTests.stdout || '').split('\n').filter(l => l.startsWith('✖')).slice(0, 10);
    sections.push(`Tooling tests (npm run test:tooling):\n${failed.length ? failed.join('\n') : headLines(toolingTests.stdout, 20)}`);
  }
  if (eslint && eslint.code === 1 && eslint.stdout.trim()) {
    sections.push(`ESLint:\n${headLines(eslint.stdout, 15)}`);
  }

  const timedOut = [tsc, jest, toolingTests, eslint].some(r => r?.timedOut);
  updateSession(root, id, s => {
    s.lastCheck = { at: new Date().toISOString(), ok: !sections.length, files: changed.slice(0, 50), timedOut };
    s.unresolved = sections.length ? sections : [];
  });

  if (!sections.length) {
    if (longTurn) {
      notify('Claude Code · Piano Academy Studio', 'Finished. Checks passed. Your turn.');
    }
    return undefined;
  }
  if (input.stop_hook_active) {
    notify('Claude Code · Piano Academy Studio', 'Finished, but some checks still fail.');
    return {
      json: {
        systemMessage: `Checks still failing after one retry (${sections.length} area${sections.length === 1 ? '' : 's'}). They are saved for the handoff note.`,
      },
    };
  }
  return block(
    `Before finishing, fix these problems found in what changed this turn:\n\n${sections.join('\n\n')}\n\nIf a problem isn't yours to fix, say so to the owner instead.`,
  );
});
