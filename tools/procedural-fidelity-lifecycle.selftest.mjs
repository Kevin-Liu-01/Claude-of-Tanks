import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Execute the actual entrypoint with injected resource APIs, never a browser,
// listener, cache directory or generated report on the real filesystem.
const source = fs.readFileSync(new URL('./procedural-fidelity.mjs', import.meta.url), 'utf8');
const imports = source.match(/^import .+;$/gm);
assert.equal(imports.length, 5, 'keep every entrypoint dependency explicitly injected');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('fs', 'path', 'tmpdir', 'createServer', 'puppeteer', 'process', 'console',
  source.replace(/^import .+;\n/gm, ''));

async function scenario(failAt = null, cleanupFailures = [], gatePassed = true) {
  const events = [], logs = [], writes = [];
  const primary = new Error(`injected ${failAt}`);
  const cleanup = new Map(cleanupFailures.map(stage => [stage, new Error(`injected ${stage}`)]));
  const step = (stage) => {
    events.push(stage);
    if (stage === failAt) throw primary;
    if (cleanup.has(stage)) throw cleanup.get(stage);
  };
  const cache = '/fixture/tmp/cot-fidelity-vite-owned';
  const fakeFs = {
    mkdtempSync(prefix) {
      assert.equal(prefix, '/fixture/tmp/cot-fidelity-vite-');
      step('cache:create');
      return cache;
    },
    rmSync(target, options) {
      assert.equal(target, cache, 'remove only this run\'s returned cache');
      assert.deepEqual(options, { recursive:true, force:true });
      step('cache:close');
    },
    existsSync() { return true; },
    mkdirSync() {},
    writeFileSync(target, content) { writes.push({ target, content }); },
  };
  let currentUrl = 'about:blank';
  const page = {
    async setViewport(viewport) {
      assert.deepEqual(viewport, { width:1500, height:800, deviceScaleFactor:1 });
      step('page:viewport');
    },
    setDefaultTimeout(timeout) {
      assert.equal(timeout, 90000);
      step('page:timeout');
    },
    on(event) { step(`page:on:${event}`); },
    async goto(url, options) {
      assert.equal(options.timeout, 90000);
      step('page:goto');
      currentUrl = url;
    },
    async waitForFunction() { step('page:wait'); },
    async evaluate(expression) {
      if (expression === 'window.__REFERENCE_IDS') return ['fixture_x'];
      if (expression === 'window.__FIDELITY_REPORT') return {
        id:'fixture_x', name:'Fixture', score:96, gatePassed,
        scores:{ overall:96, hull:96, turret:96, gun:96, tracks:96 },
      };
      return undefined;
    },
    url() { return currentUrl; },
  };
  const server = {
    config:{ server:{ port:6700 } },
    async listen() { step('server:listen'); },
    async close() { step('server:close'); },
  };
  const browser = {
    async newPage() { step('page:create'); return page; },
    async close() { step('browser:close'); },
  };
  const createServer = async (options) => {
    assert.equal(options.cacheDir, cache);
    assert.deepEqual(options.optimizeDeps, { noDiscovery:true });
    step('server:create');
    return server;
  };
  const puppeteer = { async launch(options) {
    assert.equal(options.headless, 'new');
    assert.deepEqual(options.args, ['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']);
    step('browser:launch');
    return browser;
  } };
  const process = { cwd:() => '/fixture', argv:['node', 'procedural-fidelity.mjs', '--ids=fixture_x', '--check'] };
  const console = { log:(...args) => logs.push(args), error:(...args) => logs.push(args) };
  let failure;
  try { await run(fakeFs, path, () => '/fixture/tmp', createServer, puppeteer, process, console); }
  catch (error) { failure = error; }
  return { events, logs, writes, primary, cleanup, failure, process };
}

const allCleanup = ['browser:close', 'server:close', 'cache:close'];
for (const [stage, expectedCleanup] of [
  ['cache:create', []],
  ['server:create', ['cache:close']],
  ['server:listen', ['server:close', 'cache:close']],
  ['browser:launch', ['server:close', 'cache:close']],
  ...['page:create', 'page:viewport', 'page:timeout', 'page:on:pageerror', 'page:on:console', 'page:goto', 'page:wait']
    .map(stage => [stage, allCleanup]),
]) {
  const result = await scenario(stage);
  assert.equal(result.failure, result.primary, `${stage}: retain exact primary failure`);
  assert.deepEqual(result.events.filter(event => event.endsWith(':close')), expectedCleanup,
    `${stage}: close every acquired resource, in reverse acquisition order`);
  assert.equal(result.writes.length, 0, `${stage}: no passing report after acquisition failure`);
  assert.equal(result.logs.filter(([label]) => label === '[fidelity acquisition]').length, 1);
}

for (const failures of [...allCleanup.map(stage => [stage]), allCleanup]) {
  const result = await scenario(null, failures);
  assert.ok(result.failure instanceof AggregateError, 'cleanup failure prevents a successful run');
  assert.deepEqual(result.failure.errors, failures.map(stage => result.cleanup.get(stage)));
  assert.deepEqual(result.events.filter(event => event.endsWith(':close')), allCleanup);
  assert.equal(result.writes.length, 0, 'cleanup failure cannot publish a passing report');
  assert.equal(result.logs.filter(([label]) => label.startsWith('[fidelity cleanup ')).length, failures.length);
}

const combined = await scenario('page:goto', allCleanup);
assert.equal(combined.failure, combined.primary, 'cleanup errors never replace the primary acquisition failure');
assert.deepEqual(combined.events.filter(event => event.endsWith(':close')), allCleanup);
assert.equal(combined.logs.filter(([label]) => label.startsWith('[fidelity cleanup ')).length, 3,
  'secondary failures remain visible');

for (const gatePassed of [true, false]) {
  const result = await scenario(null, [], gatePassed);
  assert.equal(result.failure, undefined);
  assert.deepEqual(result.events.filter(event => event.endsWith(':close')), allCleanup);
  assert.deepEqual(result.writes.map(({ target }) => target), [
    '/fixture/.qa-dev/reports/procedural-fidelity.json', '/fixture/.qa-dev/reports/procedural-fidelity.md',
  ]);
  const { summary } = JSON.parse(result.writes[0].content);
  assert.equal(summary.passThreshold, 90);
  assert.equal(summary.perViewFloor, 90);
  assert.equal(summary.exemplarThreshold, 92);
  assert.equal(summary.preservationThreshold, 99);
  assert.equal(summary.passed, gatePassed ? 1 : 0);
  assert.equal(summary.failed, gatePassed ? 0 : 1);
  assert.equal(result.process.exitCode, gatePassed ? undefined : 1);
}

console.log('procedural-fidelity-lifecycle: 18 browser-free startup, cleanup, primary-error and scoring cases pass');
