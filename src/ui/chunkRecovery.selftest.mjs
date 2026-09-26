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

// r4 (2026-09-25): the document watchdogs measure downloads. A harness with a controllable clock,
// a Resource Timing observer, a connectivity probe and a beacon sink drives the new paths.
function createNetworkHarness({ href = 'https://game.test/?tank=leo1a5', online = true, fetchResult = 'ok',
  telemetry = 'on', search = '' } = {}) {
  const listeners = new Map();
  const timers = [];
  const beacons = [];
  const fetches = [];
  let now = 1_000_000;
  let observerCallback = null;
  let observed = null;
  const stage = { textContent: 'Starting engine' };
  const retry = { classes: [], classList: { add(name) { retry.classes.push(name); } }, onclick: null };
  const window = { __GAME_READY: false };
  const url = search ? href.replace('?', `?${search}&`) : href;
  const context = {
    window,
    document: {
      hidden: false,
      body: { appendChild() {} },
      createElement: () => ({ classList: { add() {} }, style: {} }),
      getElementById: (id) => (id === 'cot-boot-stage' ? stage : id === 'cot-boot-retry' ? retry : null),
      querySelector: (selector) => (selector.includes('application-version') ? { getAttribute: () => 'v1.0.0+gabc1234' }
        : selector.includes('cot-telemetry') ? { getAttribute: () => telemetry } : null),
      querySelectorAll: () => ({ length: 3 }),
    },
    navigator: { onLine: online, sendBeacon(endpoint, body) { beacons.push({ endpoint, body: JSON.parse(body) }); return true; } },
    location: { href: url, search: new URL(url).search, replace(value) { context.replacedUrl = value; } },
    history: { replaceState() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener: (type, listener) => listeners.set(type, listener),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cancelled = true; },
    setInterval: () => 1,
    clearInterval() {},
    URL,
    Date: { now: () => now },
    Math,
    PerformanceObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe(options) { observed = options; }
    },
    fetch: fetchResult === 'absent' ? undefined : (target) => {
      fetches.push(target);
      return fetchResult === 'ok' ? Promise.resolve({ ok: true }) : Promise.reject(new Error('offline'));
    },
    replacedUrl: null,
  };
  if (fetchResult === 'absent') delete context.fetch;
  runInNewContext(match[1], context);
  const armed = () => timers.filter((timer) => !timer.cancelled && !timer.fired);
  return {
    context, listeners, timers, beacons, fetches, stage, retry, window,
    get observed() { return observed; },
    advance(ms) { now += ms; },
    arrive(entries) { observerCallback({ getEntries: () => entries }); },
    /** Fire every live timer whose delay has elapsed since it was armed (delays are relative to arming). */
    fire(ms) {
      for (const timer of armed()) if (timer.ms === ms) { timer.fired = true; timer.fn(); }
    },
    live: (ms) => armed().filter((timer) => timer.ms === ms).length,
    get replacedUrl() { return context.replacedUrl; },
    recovery: () => armed().some((timer) => timer.ms < 1000),
    async settle() { for (let i = 0; i < 6; i++) await Promise.resolve(); },
  };
}

{
  const h = createNetworkHarness();
  assert.equal(`${h.observed?.type}:${h.observed?.buffered}`, 'resource:true', 'Resource Timing arrivals are observed from the first byte');
  assert.equal(h.live(30000), 1, 'the document notice watchdog is armed at load');
  assert.equal(h.live(60000), 1, 'the document recovery watchdog is armed at load');
  h.advance(1500);
  h.arrive([{ name: 'https://game.test/assets/main-x.js', transferSize: 640000 }, { name: 'https://game.test/fonts/a.woff2', transferSize: 2000 }]);
  assert.equal(h.live(30000), 1, 'an arrival replaces the document watchdogs instead of stacking them');
  assert.equal(h.live(60000), 1);
  assert.equal(h.timers.filter((timer) => timer.ms === 60000).length, 2, 'the previous 60 s watchdog was re-armed, not left running');
  assert.match(h.stage.textContent, /Downloading game files · 1 \/ 4/, 'the splash counts entry-graph files while the module has not claimed the line');
  const network = h.window.__COT_BOOT_RECOVERY.network();
  assert.equal(network.entries, 2);
  assert.equal(network.scripts, 1);
  assert.equal(network.bytes, 642000);
  assert.equal(network.kind, 'slow', 'fresh bytes classify a timeout as a slow connection');
  // The load-time watchdogs were cleared by the arrival: only the re-armed pair can fire, after a full silent window.
  assert.equal(h.timers[0].cancelled, true, 'the superseded load-time notice watchdog is cleared');
  assert.equal(h.timers[1].cancelled, true, 'the superseded load-time recovery watchdog is cleared');
  h.advance(1000);
  h.window.__COT_BOOT_RECOVERY.progress('renderer');
  assert.equal(h.stage.textContent, 'Downloading game files · 1 / 4', 'module stage begin is reported by bootScreen, not this line');
  h.arrive([{ name: 'https://game.test/assets/sky-x.js', transferSize: 1000 }]);
  assert.equal(h.stage.textContent, 'Downloading game files · 1 / 4', 'once the module owns the stage line, downloads stop repainting it');
}

{
  const h = createNetworkHarness();
  h.advance(20000);
  h.fire(30000);
  assert.match(h.stage.textContent, /Nothing has downloaded for a while|Loading stalled/, 'a silent 30 s document notice names the silence, not a missing file');
  assert.deepEqual(h.retry.classes, ['on']);
  assert.equal(h.beacons.length, 1, 'the first retry surface beacons once');
  assert.equal(h.beacons[0].endpoint, '/api/telemetry');
  assert.equal(h.beacons[0].body.v, 2, 'telemetry v2 (2026-09-25): the inline watchdog posts one error record');
  assert.equal(h.beacons[0].body.kind, 'error');
  assert.equal(h.beacons[0].body.sid, h.window.__COT_TELEMETRY_SID, 'the inline beacon uses the shared session id');
  assert.equal(h.beacons[0].body.build, 'v1.0.0+gabc1234');
  assert.equal(h.beacons[0].body.stage, 'download');
  assert.equal(h.beacons[0].body.outcome, 'notice', 'a first notice with reloads left is not terminal');
  h.fire(60000);
  assert.deepEqual(h.fetches.map((target) => String(target).split('?')[0]), ['/humans.txt'],
    'a silent minute is checked against a same-origin probe before the document is replaced');
  await h.settle();
  assert.equal(h.recovery(), true, 'a working connection with a silent minute restarts the stuck requests');
  assert.equal(h.beacons.at(-1).body.code, 'reload:stalled');
  assert.equal(h.beacons.at(-1).body.outcome, 'failed');
}

{
  const h = createNetworkHarness({ fetchResult: 'fail' });
  h.advance(70000);
  h.fire(60000);
  await h.settle();
  assert.equal(h.recovery(), false, 'a dead connection keeps the document instead of reloading into an error page');
  assert.match(h.stage.textContent, /check your connection/);
  assert.equal(h.beacons.at(-1).body.code, 'offline');
  assert.equal(h.beacons.at(-1).body.outcome, 'halted');
  h.context.navigator.onLine = true;
  h.context.fetch = () => Promise.resolve({ ok: true });
  h.listeners.get('online')();
  await h.settle();
  assert.equal(h.recovery(), true, 'coming back online resumes the deferred recovery');
}

{
  const h = createNetworkHarness({ href: 'https://game.test/?tank=leo1a5&_bootretry=2-x' });
  h.listeners.get('vite:preloadError')({ payload: new Error('Unable to preload CSS for /assets/hud-Ab12Cd34.js') });
  assert.equal(h.recovery(), false, 'the reload budget is spent');
  assert.equal(h.stage.textContent, 'A game file failed to download (hud-Ab12Cd34.js)', 'the terminal message names the file');
  assert.equal(h.beacons.at(-1).body.code, 'chunk');
  assert.equal(h.beacons.at(-1).body.outcome, 'halted');
  assert.deepEqual(h.beacons.at(-1).body.error.frames, ['hud-Ab12Cd34.js']);
  const driver = createNetworkHarness({ href: 'https://game.test/?tank=leo1a5&_bootretry=2-x' });
  driver.listeners.get('error')({ target: driver.window, message: 'WebGL: CONTEXT_LOST_WEBGL', filename: '',
    error: { message: 'Could not create a WebGL context', stack: '' } });
  assert.match(driver.stage.textContent, /graphics driver refused/, 'a GL failure is not called a missing file');
  assert.equal(driver.beacons.at(-1).body.code, 'driver');
  const slow = createNetworkHarness({ href: 'https://game.test/?tank=leo1a5&_bootretry=2-x' });
  slow.arrive([{ name: 'https://game.test/assets/a.js', transferSize: 10 }]);
  slow.fire(30000);
  assert.match(slow.stage.textContent, /taking longer than expected on this connection/, 'fresh bytes at the notice mean a slow connection');
}

{
  // Browser proof 2026-09-25 (chunk-404 scenario): a failed static import names the entry script, and the
  // download counter overwrote the retry surface. The 404 is read from Resource Timing and the surface owns the line.
  const h = createNetworkHarness({ href: 'https://game.test/?tank=leo1a5&_bootretry=2-x' });
  h.arrive([{ name: 'https://game.test/assets/i18n-CQsdmk14.js?x=1', transferSize: 0, responseStatus: 404 },
    { name: 'https://game.test/assets/main-EB7eBKg4.js', transferSize: 640000, responseStatus: 200 }]);
  h.listeners.get('error')({ target: { tagName: 'SCRIPT', type: 'module', src: 'https://game.test/assets/main-EB7eBKg4.js' },
    message: '', filename: '', error: null });
  assert.equal(h.stage.textContent, 'A game file failed to download (i18n-CQsdmk14.js)',
    'the file that answered 404 is named, not the entry script that failed to import');
  assert.deepEqual(h.beacons.at(-1).body.error.frames, ['i18n-CQsdmk14.js', 'main-EB7eBKg4.js']);
  h.arrive([{ name: 'https://game.test/assets/late-x.js', transferSize: 10 }]);
  assert.equal(h.stage.textContent, 'A game file failed to download (i18n-CQsdmk14.js)',
    'later arrivals cannot repaint the download counter over the retry surface');
  h.context.navigator.onLine = false;
  const offline = createNetworkHarness({ href: 'https://game.test/?tank=leo1a5&_bootretry=2-x', online: false });
  offline.listeners.get('vite:preloadError')({ payload: new Error('Failed to fetch /assets/hud-Ab12Cd34.js') });
  assert.match(offline.stage.textContent, /\(hud-Ab12Cd34\.js\) — you appear to be offline/, 'an offline chunk failure says so');
  assert.equal(offline.recovery(), false, 'offline failures wait for the online event instead of reloading');
}

{
  const off = createNetworkHarness({ search: 'telemetry=off' });
  off.fire(30000);
  assert.equal(off.beacons.length, 0, '?telemetry=off silences the inline beacon');
  const meta = createNetworkHarness({ telemetry: 'off' });
  meta.fire(30000);
  assert.equal(meta.beacons.length, 0, 'a self-hosted build (meta off) never beacons');
  const bare = createNetworkHarness({ fetchResult: 'absent' });
  bare.advance(70000);
  bare.fire(60000);
  assert.equal(bare.recovery(), true, 'without fetch the watchdog keeps its plain bounded recovery');
}

console.log('chunkRecovery.selftest: bounded failures recover without reloading healthy slow stages');
