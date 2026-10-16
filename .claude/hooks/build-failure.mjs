#!/usr/bin/env node
/**
 * PostToolUseFailure (Bash): when an iOS, Android or CocoaPods command fails, matches the
 * error against docs/troubleshooting.md and gives Claude the known fix.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addContext, runHook } from './lib/hook.mjs';

const BUILD_COMMAND =
  /\b(?:pod\s+install|pod\s+update|xcodebuild|run-ios|run-android|gradlew|npm\s+run\s+(?:ios|android)|react-native\s+(?:run|build)\S*)\b/;

/** "### Title" sections with "- **Signature:** `regex`" and "- **Fix:** text" lines. */
export function parseTroubleshooting(text) {
  const entries = [];
  let current = null;
  let inFix = false;
  for (const line of String(text || '').split('\n')) {
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      current = { title: heading[1].trim(), signature: null, fix: '' };
      entries.push(current);
      inFix = false;
      continue;
    }
    if (!current) {
      continue;
    }
    const sig = /^-\s+\*\*Signature:\*\*\s+`(.+)`\s*$/.exec(line);
    const fix = /^-\s+\*\*Fix:\*\*\s+(.*)$/.exec(line);
    if (sig) {
      current.signature = sig[1];
      inFix = false;
    } else if (fix) {
      current.fix = fix[1].trim();
      inFix = true;
    } else if (inFix && line.trim() && !/^-\s+\*\*/.test(line)) {
      current.fix += ` ${line.trim()}`;
    } else if (/^-\s+\*\*/.test(line)) {
      inFix = false;
    }
  }
  return entries
    .filter(e => e.signature && e.fix)
    .map(e => {
      try {
        return { ...e, re: new RegExp(e.signature, 'i') };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

runHook('build-failure', async (input, { root }) => {
  if (input.tool_name !== 'Bash' || input.is_interrupt) {
    return undefined;
  }
  if (!BUILD_COMMAND.test(String(input.tool_input?.command || ''))) {
    return undefined;
  }
  let doc = '';
  try {
    doc = readFileSync(join(root, 'docs/troubleshooting.md'), 'utf8');
  } catch {
    // No troubleshooting file yet.
  }
  const error = String(input.error || JSON.stringify(input.tool_response || ''));
  const hits = parseTroubleshooting(doc).filter(e => e.re.test(error));
  const text = hits.length
    ? `Known fixes for this build error (docs/troubleshooting.md):\n${hits.map(h => `- ${h.title}: ${h.fix}`).join('\n')}`
    : 'No known fix in docs/troubleshooting.md matches this build error. Once you solve it, add an entry there (### title, a Signature regex and the Fix) so the next failure gets a hint.';
  return addContext('PostToolUseFailure', text);
});
