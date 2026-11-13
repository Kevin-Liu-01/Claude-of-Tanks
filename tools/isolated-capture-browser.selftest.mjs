import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withIsolatedCaptureBrowser } from './isolated-capture-browser.mjs';

const closeOrder = ['browser:close', 'server:close', 'cache:close'];
const options = Object.freeze({
  root:'/fixture', cacheDir:'/shared/cache', logLevel:'error',
  server:Object.freeze({ port:6712, strictPort:false, hmr:false, watch:null }),
  optimizeDeps:Object.freeze({ noDiscovery:false, include:['three'], exclude:['fixture'] }),
});
const launchOptions = Object.freeze({ headless:'new', args:Object.freeze(['--use-gl=angle']) });
let nextCache = 0;

function fixture(failAt = null, closeFailures = []) {
  const events = [], logs = [];
  const primary = new Error(`injected ${failAt}`);
  const errors = new Map(closeFailures.map(stage => [stage, new Error(`injected ${stage}`)]));
  const resources = { cache:null, server:null, browser:null };
  const step = stage => {
    events.push(stage);
    if (stage === failAt) throw primary;
    if (errors.has(stage)) throw errors.get(stage);
  };
  let ownedCache;
  const server = {
    async listen() { step('server:listen'); },
    async close() { step('server:close'); resources.server = null; },
  };
  const browser = {
    async close() { step('browser:close'); resources.browser = null; },
  };
  const dependencies = {
    temporaryDirectory() { step('tmpdir'); return '/fixture/tmp'; },
    mkdtempSync(prefix) {
      assert.equal(prefix, '/fixture/tmp/cot-release-vite-');
      step('cache:create');
      ownedCache = `${prefix}${++nextCache}`;
      resources.cache = ownedCache;
      return ownedCache;
    },
    async createViteServer(received) {
      assert.deepEqual(received, { ...options, cacheDir:ownedCache,
        optimizeDeps:{ ...options.optimizeDeps, noDiscovery:true } });
      assert.notEqual(received, options, 'do not mutate caller configuration');
      assert.notEqual(received.optimizeDeps, options.optimizeDeps);
      step('server:create');
      resources.server = server;
      return server;
    },
    async launchBrowser(received) {
      assert.equal(received, launchOptions, 'preserve exact caller launch options');
      step('browser:launch');
      resources.browser = browser;
      return browser;
    },
    removeCache(target, flags) {
      assert.equal(target, ownedCache, 'never remove another run or shared cache');
      assert.deepEqual(flags, { recursive:true, force:true });
      step('cache:close');
      resources.cache = null;
    },
    logCleanupError(resource, error) { logs.push({ resource, error }); },
  };
  const value = { score:96, threshold:92, timeout:90000 };
  const callback = async received => {
    assert.deepEqual(received, { server, browser });
    step('callback');
    return value;
  };
  return { dependencies, events, logs, primary, errors, resources, callback, value, server, browser,
    get cacheDir() { return ownedCache; } };
}

for (const [stage, expectedClose] of [
  ['tmpdir', []], ['cache:create', []], ['server:create', ['cache:close']],
  ['server:listen', ['server:close', 'cache:close']],
  ['browser:launch', ['server:close', 'cache:close']], ['callback', closeOrder],
]) {
  const test = fixture(stage);
  await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions, test.callback, test.dependencies),
    error => error === test.primary, `${stage}: preserve primary exception identity`);
  assert.deepEqual(test.events.filter(event => event.endsWith(':close')), expectedClose);
  assert.deepEqual(test.resources, { cache:null, server:null, browser:null });
}

for (const failures of [...closeOrder.map(stage => [stage]), closeOrder]) {
  const test = fixture(null, failures);
  await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions, test.callback, test.dependencies), error => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, failures.map(stage => test.errors.get(stage)));
    return true;
  });
  assert.deepEqual(test.events.filter(event => event.endsWith(':close')), closeOrder,
    'attempt every release despite any earlier close failure');
  assert.deepEqual(test.logs.map(({ resource }) => `${resource}:close`), failures);
}

for (const stage of ['server:listen', 'browser:launch', 'callback']) {
  const test = fixture(stage, closeOrder);
  await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions, test.callback, test.dependencies),
    error => error === test.primary, 'secondary errors never replace the primary failure');
  const expected = stage === 'callback' ? closeOrder : closeOrder.slice(1);
  assert.deepEqual(test.events.filter(event => event.endsWith(':close')), expected);
  assert.equal(test.logs.length, expected.length, 'retain every secondary cleanup error');
}

const normal = fixture();
assert.equal(await withIsolatedCaptureBrowser(options, launchOptions, normal.callback, normal.dependencies), normal.value,
  'return the callback value unchanged, after successful cleanup');
assert.deepEqual(normal.events.filter(event => event.endsWith(':close')), closeOrder);
assert.deepEqual(normal.resources, { cache:null, server:null, browser:null });
assert.equal(options.cacheDir, '/shared/cache');
assert.equal(options.optimizeDeps.noDiscovery, false);

const synchronous = fixture();
await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions,
  () => { throw synchronous.primary; }, synchronous.dependencies), error => error === synchronous.primary);
assert.deepEqual(synchronous.events.filter(event => event.endsWith(':close')), closeOrder);

const reporter = fixture('callback', closeOrder);
reporter.dependencies.logCleanupError = () => { throw new Error('injected reporter failure'); };
await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions, reporter.callback, reporter.dependencies),
  error => error === reporter.primary);
assert.deepEqual(reporter.events.filter(event => event.endsWith(':close')), closeOrder);

// Keep one callback suspended while the other invocation fails and closes.
// Ownership is per invocation; no global resource slots or shared cache path.
const first = fixture(), second = fixture('callback');
let signalReady, finishFirst;
const ready = new Promise(resolve => { signalReady = resolve; });
const held = new Promise(resolve => { finishFirst = resolve; });
const firstRun = withIsolatedCaptureBrowser(options, launchOptions, async received => {
  assert.deepEqual(received, { server:first.server, browser:first.browser });
  signalReady();
  await held;
  return first.value;
}, first.dependencies);
await ready;
const firstCache = first.resources.cache;
await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions, second.callback, second.dependencies),
  error => error === second.primary);
assert.notEqual(firstCache, second.cacheDir, 'each invocation receives a distinct owned cache');
assert.deepEqual(first.resources, { cache:firstCache, server:first.server, browser:first.browser },
  'another invocation cannot close the still-running first capture');
assert.equal(first.events.some(event => event.endsWith(':close')), false);
assert.deepEqual(second.resources, { cache:null, server:null, browser:null });
finishFirst();
assert.equal(await firstRun, first.value);
assert.deepEqual(first.resources, { cache:null, server:null, browser:null });

// capture (2026-10-22, tools/capture-hold.mjs): the cache, server, browser and warm open while the ticket waits (the
// lock's prepare); the lock is released after the browser closes and before the server and cache.
{
  const fakeLock = (events, { failAcquire = false } = {}) => ({
    async acquire(_ms, { prepare }) {
      events.push('lock:queue');
      await prepare();
      if (failAcquire) throw new Error('cot-shots lock timeout');
      events.push('lock:hold');
    },
    refresh() { return true; },
    release() { events.push('lock:release'); return true; },
  });
  const held = fixture();
  const warm = async (received) => { assert.deepEqual(received, { server:held.server, browser:held.browser }); held.events.push('warm'); };
  held.dependencies.capture = { lock:fakeLock(held.events), warm };
  assert.equal(await withIsolatedCaptureBrowser(options, launchOptions, held.callback, held.dependencies), held.value);
  assert.deepEqual(held.events, ['lock:queue', 'tmpdir', 'cache:create', 'server:create', 'server:listen', 'browser:launch', 'warm',
    'lock:hold', 'callback', 'browser:close', 'lock:release', 'server:close', 'cache:close'],
  'open and warm while queued; release after the browser closes and before the server and cache');

  const failed = fixture('browser:launch');
  failed.dependencies.capture = { lock:fakeLock(failed.events) };
  await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions, failed.callback, failed.dependencies),
    error => error === failed.primary, 'a failure while warming is the primary error');
  assert.equal(failed.events.includes('lock:release'), false, 'nothing was held, so nothing is released');
  assert.deepEqual(failed.resources, { cache:null, server:null, browser:null });

  const timedOut = fixture();
  timedOut.dependencies.capture = { lock:fakeLock(timedOut.events, { failAcquire:true }) };
  await assert.rejects(withIsolatedCaptureBrowser(options, launchOptions, timedOut.callback, timedOut.dependencies), /lock timeout/);
  assert.deepEqual(timedOut.resources, { cache:null, server:null, browser:null }, 'a wait that times out closes what it warmed');
}

for (const name of ['geometry-gate', 'track-clip-audit', 'tank-standard-check',
  'module-visual-align-probe', 'track-duplicate-audit']) {
  const source = readFileSync(new URL(`./${name}.mjs`, import.meta.url), 'utf8');
  assert.match(source, /import \{ withIsolatedCaptureBrowser \} from '\.\/isolated-capture-browser\.mjs'/,
    `${name}: acquire through the isolated lifecycle`);
  assert.equal((source.match(/await withIsolatedCaptureBrowser\(/g) || []).length, 1);
  assert.doesNotMatch(source, /(?:createServer\(|puppeteer\.launch\(|launchGuardedBrowser\()/,
    `${name}: no unguarded shared-cache acquisition`);
}

// (round 2 U39) a SIGTERM to a held run: the hold's signal owner tears down, releases and exits, so this function's finally
// never runs. On the lane head the teardown closed only the browser, leaving the Vite server and the cot-release-vite-*
// optimizer cache behind (the base's puppeteer path had cleaned both up). A child process holds a private lock with stand-in
// server and browser and a real cache directory under a private root; it must leave neither.
{
  const root = mkdtempSync(join(tmpdir(), 'cot-isolated-signal-'));
  try {
    const marks = join(root, 'marks');
    const script = `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { withIsolatedCaptureBrowser } from ${JSON.stringify(new URL('./isolated-capture-browser.mjs', import.meta.url).href)};
      const root = ${JSON.stringify(root)}, marks = ${JSON.stringify(marks)};
      mkdirSync(marks);
      const mark = (name) => writeFileSync(join(marks, name), '');
      const lock = createCaptureLock({ lockDir: join(root, 'lock'), queueDir: join(root, 'queue'), log: () => {} });
      await withIsolatedCaptureBrowser({ root }, {}, () => { console.log('held'); setInterval(() => {}, 1000); return new Promise(() => {}); }, {
        temporaryDirectory: () => root,
        createViteServer: async () => ({ async listen() {}, async close() { mark('server-closed'); } }),
        launchBrowser: async () => ({ async close() { mark('browser-closed'); } }),
        logCleanupError: (resource, error) => console.error('cleanup', resource, String(error)),
        capture: { lock, waitMs: 60_000, label: 'signal-probe' },
      });`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    const closed = new Promise((done) => child.once('close', (code, signal) => done({ code, signal })));
    for (let i = 0; i < 2400 && !out.includes('held') && child.exitCode === null; i++) await new Promise((done) => setTimeout(done, 25));
    assert.ok(out.includes('held'), `the child holds its private lock: ${err.slice(-600)}`);
    assert.equal(readdirSync(root).filter((name) => name.startsWith('cot-release-vite-')).length, 1, 'its optimizer cache exists while held');
    child.kill('SIGTERM');
    const end = await closed;
    assert.deepEqual(end, { code: 143, signal: null }, `the signal owner exits 128 + 15: ${err.slice(-600)}`);
    assert.ok(existsSync(join(marks, 'browser-closed')), 'the browser closed');
    assert.ok(existsSync(join(marks, 'server-closed')), 'the Vite server closed before the exit');
    assert.deepEqual(readdirSync(root).filter((name) => name.startsWith('cot-release-vite-')), [], 'and the optimizer cache is gone');
    assert.equal(existsSync(join(root, 'lock')), false, 'the lock is released');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// (round 3 B16) the same on SIGINT, through the real launch path: launchGuardedBrowser and @puppeteer/browsers' own launch
// with puppeteer-core's defaults (a node child stands in for Chrome). puppeteer's SIGINT listener killed the browser and
// called process.exit(130) right after the hold's signal owner began its teardown, which stopped at its first await (the
// browser's close): the Vite server and the cot-release-vite-* cache were left behind on Ctrl-C.
{
  const root = mkdtempSync(join(tmpdir(), 'cot-isolated-sigint-'));
  try {
    const marks = join(root, 'marks');
    const script = `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { launch } from ${JSON.stringify(import.meta.resolve('@puppeteer/browsers'))};
      import { launchGuardedBrowser } from ${JSON.stringify(new URL('./browser-launch.mjs', import.meta.url).href)};
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      import { withIsolatedCaptureBrowser } from ${JSON.stringify(new URL('./isolated-capture-browser.mjs', import.meta.url).href)};
      const root = ${JSON.stringify(root)}, marks = ${JSON.stringify(marks)};
      mkdirSync(marks);
      const mark = (name) => writeFileSync(join(marks, name), '');
      const puppeteerLike = { launch: async ({ args = [], handleSIGINT = true, handleSIGTERM = true, handleSIGHUP = true }) => {
        const proc = launch({ executablePath: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)', '--', ...args],
          handleSIGINT, handleSIGTERM, handleSIGHUP });
        return { process: () => proc.nodeProcess, close: async () => { await proc.close(); mark('browser-closed'); } };
      } };
      const lock = createCaptureLock({ lockDir: join(root, 'lock'), queueDir: join(root, 'queue'), log: () => {} });
      await withIsolatedCaptureBrowser({ root }, {}, () => { console.log('held'); setInterval(() => {}, 1000); return new Promise(() => {}); }, {
        temporaryDirectory: () => root,
        createViteServer: async () => ({ async listen() {}, async close() { mark('server-closed'); } }),
        launchBrowser: (options) => launchGuardedBrowser(puppeteerLike, options, { label: 'stand-in', intervalMs: 60_000 }),
        logCleanupError: (resource, error) => console.error('cleanup', resource, String(error)),
        capture: { lock, waitMs: 60_000, label: 'sigint-probe' },
      });`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    const closed = new Promise((done) => child.once('close', (code, signal) => done({ code, signal })));
    for (let i = 0; i < 2400 && !out.includes('held') && child.exitCode === null; i++) await new Promise((done) => setTimeout(done, 25));
    assert.ok(out.includes('held'), `the child holds its private lock: ${err.slice(-600)}`);
    child.kill('SIGINT');
    const end = await closed;
    assert.deepEqual(end, { code: 130, signal: null }, `the signal owner exits 128 + 2: ${err.slice(-600)}`);
    assert.ok(existsSync(join(marks, 'browser-closed')), 'the browser closed');
    assert.ok(existsSync(join(marks, 'server-closed')), 'the Vite server closed before the exit');
    assert.deepEqual(readdirSync(root).filter((name) => name.startsWith('cot-release-vite-')), [], 'and the optimizer cache is gone');
    assert.equal(existsSync(join(root, 'lock')), false, 'the lock is released');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('isolated-capture-browser: startup/callback failures, independent cleanup, primary errors, unchanged options, concurrent ownership, capture holds (warm while queued), a SIGTERM or SIGINT that leaves no server or cache, and five release callers pass');
