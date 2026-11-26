// Where state that must outlive a reboot lives (practice audit 2026-11-26, mechanism 10). First-party tooling: Kevin B. Liu.
//
// The 2026-11-26 00:35 reboot (the system file table filled) wiped /tmp and $TMPDIR: the capture lock's hold log, the
// browser guard's trip log and the receipt result cache (a 30-70 min cold start) went with it. Logs and caches that a
// later run reads go under the user's home; locks, queues and per-run scratch stay in /tmp, where a reboot should clear
// them. tools/no-tmp-state.selftest.mjs fails on a new /tmp log or receipt path in tools/.
import { homedir } from 'node:os';
import { join } from 'node:path';

const home = (env) => env.HOME || homedir();

/** A persistent log file: ~/Library/Logs on macOS, $XDG_STATE_HOME/cot/logs (default ~/.local/state) elsewhere. */
export function cotLogPath(name, { env = process.env, platform = process.platform } = {}) {
  if (platform === 'darwin') return join(home(env), 'Library', 'Logs', name);
  return join(env.XDG_STATE_HOME || join(home(env), '.local', 'state'), 'cot', 'logs', name);
}

/** A regenerable cache that should survive a reboot: $XDG_CACHE_HOME (default ~/.cache)/<name>. */
export function cotCacheDir(name, { env = process.env } = {}) {
  return join(env.XDG_CACHE_HOME || join(home(env), '.cache'), name);
}

/** The default output of a probe's evidence (an --out default): $XDG_STATE_HOME/cot/evidence/<name>. */
export function cotEvidencePath(name, { env = process.env } = {}) {
  return join(env.XDG_STATE_HOME || join(home(env), '.local', 'state'), 'cot', 'evidence', name);
}
