import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

for (const name of ['geometry-gate', 'track-clip-audit', 'tank-standard-check',
  'module-visual-align-probe', 'track-duplicate-audit']) {
  const source = readFileSync(new URL(`./${name}.mjs`, import.meta.url), 'utf8');
  assert.match(source, /import \{ withIsolatedCaptureBrowser \} from '\.\/isolated-capture-browser\.mjs'/,
    `${name}: acquire through the isolated lifecycle`);
  assert.equal((source.match(/await withIsolatedCaptureBrowser\(/g) || []).length, 1);
  assert.doesNotMatch(source, /(?:createServer\(|puppeteer\.launch\()/,
    `${name}: no unguarded shared-cache acquisition`);
}

console.log('isolated-capture-browser: startup/callback failures, independent cleanup, primary errors, unchanged options, concurrent ownership and five release callers pass');
