import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const match = html.match(/<script>\s*(\/\/ CHUNK RECOVERY[\s\S]*?)<\/script>/);
assert.ok(match, 'chunk recovery remains inline ahead of the module entry');

function createHarness(ready) {
  const listeners = new Map();
  const timers = [];
  const storage = new Map();
  let replacedUrl = null;
  const window = { __GAME_READY: ready };
  const location = {
    href: 'https://game.test/?tank=leo1a5',
    replace(url) { replacedUrl = url; },
  };
  const context = {
    window,
    document: {
      body: { appendChild() {} },
      createElement: () => ({ classList: { add() {} }, style: {} }),
      getElementById: () => null,
    },
    location,
    history: { replaceState() {} },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    URL,
    Date,
  };
  runInNewContext(match[1], context);
  return { listeners, timers, storage, window, get replacedUrl() { return replacedUrl; } };
}

const postBoot = createHarness(true);
let prevented = false;
postBoot.listeners.get('vite:preloadError')?.({
  preventDefault() { prevented = true; },
});

const recoveryTimer = postBoot.timers.find(({ ms }) => ms < 1000);
assert.ok(recoveryTimer,
  'a missing lazy chunk after boot must schedule one fresh-document recovery');
assert.equal(prevented, false,
  'the original import must reject instead of resolving to an undefined module');
assert.equal(postBoot.window.__CHUNK_RECOVERY_PENDING, true,
  'runtime diagnostics must expose that navigation recovery is committed');
recoveryTimer.fn();
assert.match(postBoot.replacedUrl ?? '', /[?&]_bootretry=/,
  'runtime chunk recovery must replace the stale document with a cache-busted URL');

const firstBoot = createHarness(false);
firstBoot.listeners.get('error')?.({
  target: firstBoot.window,
  message: 'Injected renderer startup failure',
  filename: 'https://game.test/assets/main-test.js',
  error: { stack: 'Error: injected\n at https://game.test/assets/main-test.js:1:1' },
});
const bootExceptionRecovery = firstBoot.timers.find(({ ms }) => ms < 1000);
assert.ok(bootExceptionRecovery,
  'a same-origin game exception before ready must recover without waiting for the watchdog');

const stalledBoot = createHarness(false);
stalledBoot.window.__COT_BOOT_RECOVERY.progress('vehicle');
const stallWatchdog = stalledBoot.timers.find(({ ms }) => ms === 20000);
assert.ok(stallWatchdog, 'each real boot stage must arm a bounded progress watchdog');
stallWatchdog.fn();
assert.ok(stalledBoot.timers.some(({ ms }) => ms < 1000),
  'a stage that never completes must schedule one automatic fresh-document recovery');

console.log('chunkRecovery.selftest: download, evaluation, and stalled-stage failures recover once');
