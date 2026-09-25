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
const armedBeforeStage = stalledBoot.timers.length;
stalledBoot.window.__COT_BOOT_RECOVERY.progress('vehicle');
// 2026-09-14: the stage notice waits 16 s and only changes the status line; the bounded recovery
// (and the Retry button) waits 30 s, so a slow-but-progressing phone renderer never sees RETRY.
// Only the timers this progress() call armed count — the document-level timeout watchdog armed at
// load shares the 30 s value.
const stageTimers = stalledBoot.timers.slice(armedBeforeStage);
const stallNotice = stageTimers.find(({ ms }) => ms === 16000);
const stallWatchdog = stageTimers.find(({ ms }) => ms === 30000);
assert.ok(stallNotice && stallWatchdog,
  'each real boot stage must arm a nonblocking notice and bounded recovery watchdog');
// The harness document has no elements; hand the notice a stage line and a Retry button so
// the receipt can see what each timer touches (2026-09-14 phone QA: RETRY LOADING appeared at
// 50 % while the bar still moved — the notice must only change the status text).
const stageLine = { textContent: '' };
const retryClasses = [];
const retryButton = { classList: { add: (name) => retryClasses.push(name) }, onclick: null };
stalledBoot.document.getElementById = (id) => (id === 'cot-boot-stage' ? stageLine : id === 'cot-boot-retry' ? retryButton : null);
stallNotice.fn();
assert.equal(stalledBoot.replacedUrl, null,
  'a merely slow first-visit stage must keep running after the early notice');
assert.match(stageLine.textContent, /taking longer/i,
  'the stage notice must tell the player loading is slow');
assert.deepEqual(retryClasses, [],
  'the early notice must not raise the Retry button while the boot is still progressing');
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

// capability gate (2026-09-24): a deliberate stop keeps its sentence on the boot screen; the
// document watchdogs, a later document error and a stage stall must all leave the page alone.
const haltedBoot = createHarness(false);
const haltedStage = { textContent: 'Starting engine' };
haltedBoot.document.getElementById = (id) => (id === 'cot-boot-stage' ? haltedStage : null);
haltedBoot.window.__COT_BOOT_RECOVERY.progress('renderer');
haltedBoot.window.__COT_BOOT_RECOVERY.halt('no_webgl2', 'This browser has no WebGL2');
assert.equal(haltedBoot.window.__COT_BOOT_HALTED, 'no_webgl2');
assert.equal(haltedStage.textContent, 'This browser has no WebGL2', 'the gate sentence stays on the stage line');
for (const { fn } of haltedBoot.timers) fn();
haltedBoot.listeners.get('error')?.({
  target: haltedBoot.window, message: 'later document failure', filename: '',
  error: { message: 'later document failure', stack: '' },
});
haltedBoot.listeners.get('unhandledrejection')?.({ reason: new Error('Failed to fetch dynamically imported module') });
assert.equal(haltedBoot.timers.some(({ ms }) => ms < 1000), false, 'a halted boot never schedules a recovery reload');
assert.equal(haltedBoot.replacedUrl, null, 'a halted boot never replaces the document');
assert.equal(haltedStage.textContent, 'This browser has no WebGL2', 'watchdog notices cannot overwrite the gate sentence');

console.log('chunkRecovery.selftest: bounded failures recover without reloading healthy slow stages');
