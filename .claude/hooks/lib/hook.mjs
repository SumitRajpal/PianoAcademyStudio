/**
 * Shared runner for Claude Code hooks. Reads the JSON input from stdin, runs the
 * handler, writes its output, and fails open: a crashing hook logs the error to
 * .claude/state/hook-errors.log and lets the action through.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export function projectDir(input) {
  return (process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd()).replace(/\/+$/, '');
}

/** Repo-relative POSIX path, or null when the path is outside the project. */
export function relativeTo(root, path) {
  if (!path) {
    return null;
  }
  const rel = relative(root, isAbsolute(path) ? path : join(root, path));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return rel.split(sep).join('/');
}

export function logError(root, name, err) {
  try {
    mkdirSync(join(root, '.claude/state'), { recursive: true });
    appendFileSync(
      join(root, '.claude/state/hook-errors.log'),
      `${new Date().toISOString()} ${name}: ${err?.stack || err}\n`,
    );
  } catch {
    // Logging must never break the session.
  }
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return '';
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const write = (stream, text) => new Promise(resolve => (text ? stream.write(text, resolve) : resolve()));

/**
 * Handler results:
 *   undefined          → no output
 *   { json }           → JSON on stdout (exit 0)
 *   { text }           → plain text on stdout (exit 0)
 *   { exit2: reason }  → reason on stderr, exit 2
 */
export async function runHook(name, handler) {
  let input = {};
  try {
    const raw = await readStdin();
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }
  const root = projectDir(input);
  let code = 0;
  try {
    const result = await handler(input, { root });
    if (result?.exit2) {
      await write(process.stderr, result.exit2);
      code = 2;
    } else if (result?.json) {
      await write(process.stdout, JSON.stringify(result.json));
    } else if (result?.text) {
      await write(process.stdout, result.text);
    }
  } catch (err) {
    logError(root, name, err);
  }
  process.exit(code);
}

export const addContext = (event, text) => ({
  json: { hookSpecificOutput: { hookEventName: event, additionalContext: text } },
});

export const deny = reason => ({
  json: {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  },
});

export const ask = reason => ({
  json: {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  },
});

export const block = reason => ({ json: { decision: 'block', reason } });

export const truncate = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Keeps the first `max` lines of command output. */
export function headLines(text, max = 20) {
  const lines = String(text || '').trim().split('\n');
  return lines.length > max ? [...lines.slice(0, max), `… +${lines.length - max} more lines`].join('\n') : lines.join('\n');
}

/** Lazily imports a module from scripts/architecture/lib (the heavy ones load TypeScript). */
export function archLib(name) {
  return import(new URL(`../../../scripts/architecture/lib/${name}`, import.meta.url).href);
}
