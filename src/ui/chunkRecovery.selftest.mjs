import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const match = html.match(/<script>\s*(\/\/ CHUNK RECOVERY[\s\S]*?)<\/script>/);
assert.ok(match, 'chunk recovery remains inline ahead of the module entry');

const listeners = new Map();
const timers = [];
const storage = new Map();
let replacedUrl = null;
let prevented = false;
const window = { __GAME_READY: true };
const context = {
  window,
  document: {
    body: { appendChild() {} },
    createElement: () => ({ classList: { add() {} }, style: {} }),
    getElementById: () => null,
  },
  location: {
    href: 'https://game.test/?tank=leo1a5',
    replace(url) { replacedUrl = url; },
  },
  history: { replaceState() {} },
  sessionStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  addEventListener: (type, listener) => listeners.set(type, listener),
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  setInterval: () => 1,
  clearInterval() {},
  URL,
  Date,
};

runInNewContext(match[1], context);
listeners.get('vite:preloadError')?.({
  preventDefault() { prevented = true; },
});

const recoveryTimer = timers.find(({ ms }) => ms < 1000);
assert.ok(recoveryTimer,
  'a missing lazy chunk after boot must schedule one fresh-document recovery');
assert.equal(prevented, false,
  'the original import must reject instead of resolving to an undefined module');
assert.equal(window.__CHUNK_RECOVERY_PENDING, true,
  'runtime diagnostics must expose that navigation recovery is committed');
recoveryTimer.fn();
assert.match(replacedUrl ?? '', /[?&]_bootretry=/,
  'runtime chunk recovery must replace the stale document with a cache-busted URL');

console.log('chunkRecovery.selftest: post-boot import failures remain errors and recover once');
