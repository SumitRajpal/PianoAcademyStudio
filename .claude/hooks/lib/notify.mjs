/** macOS notifications through osascript. No-op elsewhere, or when CLAUDE_HOOKS_NO_NOTIFY is set. */

import { spawn } from 'node:child_process';

const esc = text =>
  String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 220);

export function notify(title, message) {
  if (process.platform !== 'darwin' || process.env.CLAUDE_HOOKS_NO_NOTIFY) {
    return;
  }
  const child = spawn(
    'osascript',
    ['-e', `display notification "${esc(message)}" with title "${esc(title)}"`],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
}
