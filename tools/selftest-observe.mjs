// What a receipt actually reads (266). The self-test runner preloads this module into every child (run-selftests.mjs
// selftestChildEnv, `--import`) and gives each receipt its own directory (COT_SELFTEST_OBSERVE_DIR); every process the
// receipt starts inherits both, so a tool it spawns is observed too. Each process records the checkout paths it read,
// listed or probed through node:fs and writes them to <dir>/<pid>-<thread>.json when it exits. Without the directory
// nothing is wrapped.
//
// The static closure (tools/selftest-cache.mjs) cannot see a path computed from data: the boot-closure receipts walk
// src/main.ts's imports by computed path (582 files their keys never named), so a PASS could be reused after the boot
// graph changed. The runner keys a PASS on what it observed as well (selftest-cache.mjs recordPass) and lane mode
// selects on it (tools/test-diff.mjs laneReadOf). Observation only adds inputs: it never removes a static one.
// First-party tooling: Kevin B. Liu.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { threadId } from 'node:worker_threads';

const dir = process.env.COT_SELFTEST_OBSERVE_DIR, root = process.env.COT_SELFTEST_OBSERVE_ROOT;
if (dir && root) {
  const seen = { reads: new Set(), lists: new Set(), probes: new Set() };
  const prefix = root + sep;
  const note = (kind, path) => {
    if (typeof path === 'number') return; // a descriptor: its open was noted
    try {
      const text = path instanceof URL ? (path.protocol === 'file:' ? decodeURIComponent(path.pathname) : null)
        : Buffer.isBuffer(path) ? path.toString() : String(path);
      if (text == null) return;
      const full = resolve(text);
      if (full.startsWith(prefix)) seen[kind].add(full.slice(prefix.length).split(sep).join('/'));
    } catch { /* an argument fs itself will reject */ }
  };
  const wrap = (owner, names, kind) => {
    for (const name of names) {
      const original = owner[name];
      if (typeof original !== 'function') continue;
      const wrapped = function (path, ...rest) { note(kind, path); return original.call(this, path, ...rest); };
      Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(original)); // util.promisify.custom, .native
      owner[name] = wrapped;
    }
  };
  wrap(fs, ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream'], 'reads');
  wrap(fs, ['readdirSync', 'readdir', 'opendirSync', 'opendir'], 'lists');
  wrap(fs, ['existsSync', 'statSync', 'lstatSync', 'accessSync'], 'probes');
  wrap(fs.promises, ['readFile', 'open'], 'reads');
  wrap(fs.promises, ['readdir', 'opendir'], 'lists');
  wrap(fs.promises, ['stat', 'lstat', 'access'], 'probes');
  syncBuiltinESMExports();
  process.on('exit', () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(join(dir, `${process.pid}-${threadId}.json`),
        JSON.stringify({ reads: [...seen.reads], lists: [...seen.lists], probes: [...seen.probes] }));
    } catch { /* the runner then has no observation for this process: its static key still holds */ }
  });
}
