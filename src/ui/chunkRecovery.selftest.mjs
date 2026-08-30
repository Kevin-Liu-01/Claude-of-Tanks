import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const match = html.match(/<script>\s*(\/\/ CHUNK RECOVERY[\s\S]*?)<\/script>/);
assert.ok(match, 'chunk recovery remains inline ahead of the module entry');

function createHarness(ready, {
  href = 'https://game.test/?tank=leo1a5',
  storageBlocked = false,
  hidden = false,
  online = true,
} = {}) {
  const listeners = new Map();
  const timers = [];
  const storage = new Map();
  let replacedUrl = null;
  const window = { __GAME_READY: ready };
  const location = {
    href,
    replace(url) { replacedUrl = url; },
  };
  const document = {
    hidden,
    body: { appendChild() {} },
    createElement: () => ({ classList: { add() {} }, style: {} }),
    getElementById: () => null,
  };
  const context = {
    window,
    document,
    navigator: { onLine: online },
    location,
    history: { replaceState() {} },
    sessionStorage: {
      getItem: (key) => {
        if (storageBlocked) throw new Error('storage blocked');
        return storage.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (storageBlocked) throw new Error('storage blocked');
        storage.set(key, value);
      },
      removeItem: (key) => {
        if (storageBlocked) throw new Error('storage blocked');
        storage.delete(key);
      },
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
  return {
    document, listeners, timers, storage, window,
    get replacedUrl() { return replacedUrl; },
  };
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
assert.match(postBoot.replacedUrl ?? '', /[?&]_dplreset=1(?:&|$)/,
  'runtime chunk recovery must ask middleware to expire a stale deployment pin');

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

const sourceLessBoot = createHarness(false);
sourceLessBoot.listeners.get('error')?.({
  target: sourceLessBoot.window,
  message: 'Opaque entry evaluation failure',
  filename: '',
  error: { message: 'Opaque entry evaluation failure', stack: '' },
});
assert.ok(sourceLessBoot.timers.some(({ ms }) => ms < 1000),
  'a source-less document exception before ready must recover without waiting for inactivity');

const extensionBoot = createHarness(false);
extensionBoot.listeners.get('error')?.({
  target: extensionBoot.window,
  message: 'Extension failure',
  filename: 'chrome-extension://example/content.js',
  error: { message: 'Extension failure', stack: 'chrome-extension://example/content.js:1:1' },
});
assert.equal(extensionBoot.timers.some(({ ms }) => ms < 1000), false,
  'an extension exception must not reload a healthy game document');

const stalledBoot = createHarness(false);
stalledBoot.window.__COT_BOOT_RECOVERY.progress('vehicle');
const stallNotice = stalledBoot.timers.find(({ ms }) => ms === 8000);
const stallWatchdog = stalledBoot.timers.find(({ ms }) => ms === 20000);
assert.ok(stallNotice && stallWatchdog,
  'each real boot stage must arm a nonblocking notice and bounded recovery watchdog');
stallNotice.fn();
assert.equal(stalledBoot.replacedUrl, null,
  'a merely slow first-visit stage must keep running after the early notice');
stallWatchdog.fn();
assert.ok(stalledBoot.timers.some(({ ms }) => ms < 1000),
  'a genuinely stalled stage must eventually schedule one fresh-document recovery');

const blockedStorageRetry = createHarness(false, {
  href: 'https://game.test/?tank=leo1a5&_bootretry=2-already',
  storageBlocked: true,
});
blockedStorageRetry.listeners.get('error')?.({
  target: blockedStorageRetry.window,
  message: 'Injected renderer startup failure',
  filename: 'https://game.test/assets/main-test.js',
  error: { stack: 'Error: injected\n at https://game.test/assets/main-test.js:1:1' },
});
assert.equal(blockedStorageRetry.timers.some(({ ms }) => ms < 1000), false,
  'the counted retry URL must prevent an auto-reload loop when sessionStorage is blocked');

const storageBlockedSecondAttempt = createHarness(false, {
  href: 'https://game.test/?tank=leo1a5&_bootretry=1-first',
  storageBlocked: true,
});
storageBlockedSecondAttempt.listeners.get('error')?.({
  target: storageBlockedSecondAttempt.window,
  message: 'Injected second transient startup failure',
  filename: 'https://game.test/assets/main-test.js',
  error: { stack: 'Error: injected\n at https://game.test/assets/main-test.js:1:1' },
});
const secondRecovery = storageBlockedSecondAttempt.timers.find(({ ms }) => ms < 1000);
assert.ok(secondRecovery, 'a second independent transient failure may recover automatically');
secondRecovery.fn();
assert.match(storageBlockedSecondAttempt.replacedUrl ?? '', /[?&]_bootretry=2-/,
  'the URL receipt must advance even without sessionStorage');
assert.match(storageBlockedSecondAttempt.replacedUrl ?? '', /[?&]_dplreset=1(?:&|$)/,
  'the deployment reset signal must survive storage-restricted recovery');

console.log('chunkRecovery.selftest: bounded failures recover without reloading healthy slow stages');
