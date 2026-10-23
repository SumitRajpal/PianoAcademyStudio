#!/usr/bin/env node
/** Notification: a macOS alert when Claude needs the owner (permission, waiting for input). */

import { runHook } from './lib/hook.mjs';
import { notify } from './lib/notify.mjs';

runHook('notification', async input => {
  notify(
    `Claude Code · ${input.title || 'Piano Academy Studio'}`,
    input.message || 'Claude needs you.',
  );
  return undefined;
});
