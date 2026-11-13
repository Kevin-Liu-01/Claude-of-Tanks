import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateSelectedIds, partitionConceptIds, conceptDesignPath } from './first-party-concept-policy.mjs';
import {readConceptDesign} from './first-party-concept-record.mjs';
import { boundOrigin, loadReadyPage, pageLoadBudget, toolServerOptions } from './tool-page-load.mjs';

// Execute the actual entrypoint with injected resource APIs, never a browser,
// listener, cache directory or generated report on the real filesystem.
const source = fs.readFileSync(new URL('./procedural-fidelity.mjs', import.meta.url), 'utf8');
const imports = source.match(/^import .+;$/gm);
assert.equal(imports.length, 12, 'keep every entrypoint dependency explicitly injected');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('fs', 'path', 'tmpdir', 'createServer', 'puppeteer', 'process', 'console',
  'FLEET_GROUP_BY_ID', 'validateSelectedIds', 'partitionConceptIds', 'readConceptDesign',
  'boundOrigin', 'loadReadyPage', 'pageLoadBudget', 'toolServerOptions', 'launchGuardedBrowser', 'eachBrowserChunk', 'OWNER_KIT_TARGETS',
  source.replace(/^import .+;\n/gm, ''));

// The server binds BOUND_PORT, not the port it asked for (a busy port moved on, R4c 2026-10-16): every URL must use it.
const BOUND_PORT = 6931;
async function scenario(failAt = null, cleanupFailures = [], gatePassed = true, ids = ['fixture_x'], referenceAvailable = true,
  navTimeouts = 0) {
  const events = [], logs = [], writes = [], gotos = [];
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
    existsSync() { return referenceAvailable; },
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
      // the first (registry) load compiles cold: 180 s and one retry (tools/tool-page-load.mjs); the rest keep 90 s
      assert.equal(options.timeout, url.endsWith('&registry=1') ? 180000 : 90000);
      assert.ok(url.startsWith(`http://127.0.0.1:${BOUND_PORT}/tools/procedural-fidelity.html?`), `bound origin: ${url}`);
      gotos.push(url);
      if (url.endsWith('&registry=1') && navTimeouts > 0) {
        navTimeouts--;
        throw Object.assign(new Error('Navigation timeout of 180000 ms exceeded'), { name:'TimeoutError' });
      }
      step('page:goto');
      currentUrl = url;
    },
    async waitForFunction() { step('page:wait'); },
    async evaluate(expression) {
      if (expression === 'window.__REFERENCE_IDS') return ['fixture_x'];
      if (expression === 'window.__FIDELITY_SOURCE_PATH') return '/reference.glb';
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
    httpServer:{ address:() => ({ address:'127.0.0.1', family:'IPv4', port:BOUND_PORT }) },
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
    assert.deepEqual({ ...options.server, port:0 }, { host:'127.0.0.1', port:0, strictPort:false, hmr:false, watch:null });
    assert.ok(options.server.port >= 6700 && options.server.port < 6920);
    step('server:create');
    return server;
  };
  const puppeteer = { async launch(options) {
    assert.equal(options.headless, 'new');
    assert.deepEqual(options.args, ['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage']);
    step('browser:launch');
    return browser;
  } };
  const process = { cwd:() => '/fixture', argv:['node', 'procedural-fidelity.mjs', `--ids=${ids.join(',')}`, '--check'] };
  const console = { log:(...args) => logs.push(args), error:(...args) => logs.push(args) };
  let failure;
  try {
    await run(fakeFs, path, () => '/fixture/tmp', createServer, puppeteer, process, console,
      { fixture_x:'fixture', unregistered_tank:'fixture', ztz100_prototype:'modern2', object695:'modern2', type100:'modern2' },
      validateSelectedIds, partitionConceptIds, readConceptDesign,
      boundOrigin, loadReadyPage, pageLoadBudget, toolServerOptions,
      // the guarded launch is tools/browser-launch.selftest.mjs's to prove; this fixture's browser is fake
      (launcher, options) => launcher.launch(options),
      // (266) the fixture's ids are one chunk, launched the same way (tools/browser-launch-census.selftest.mjs proves the helper)
      async (tool, list, chunkRun) => (list.length ? [await chunkRun([...list], { index: 0, count: 1,
        launch: (launcher, options) => launcher.launch(options), track: (opened) => opened })] : []),
      // (262) no fixture id carries an owner kit (tools/owner-kit-targets.selftest.mjs proves the registry)
      {});
  }
  catch (error) { failure = error; }
  return { events, logs, writes, primary, cleanup, failure, process, gotos };
}

const allCleanup = ['browser:close', 'server:close', 'cache:close'];
// (266) a run that scores reads the registry in a short-lived browser, then scores each chunk of ids in a fresh one
const runCleanup = ['browser:close', ...allCleanup];
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
  const failed = result.events.filter(event => failures.includes(event));
  assert.deepEqual(result.failure.errors, failed.map(stage => result.cleanup.get(stage)), 'every failed close, each browser\'s included');
  assert.deepEqual(result.events.filter(event => event.endsWith(':close')), runCleanup);
  assert.equal(result.writes.length, 0, 'cleanup failure cannot publish a passing report');
  assert.equal(result.logs.filter(([label]) => label.startsWith('[fidelity cleanup ')).length, failed.length);
}

const combined = await scenario('page:goto', allCleanup);
assert.equal(combined.failure, combined.primary, 'cleanup errors never replace the primary acquisition failure');
assert.deepEqual(combined.events.filter(event => event.endsWith(':close')), allCleanup);
assert.equal(combined.logs.filter(([label]) => label.startsWith('[fidelity cleanup ')).length, 3,
  'secondary failures remain visible');

for (const gatePassed of [true, false]) {
  const result = await scenario(null, [], gatePassed);
  assert.equal(result.failure, undefined);
  assert.deepEqual(result.events.filter(event => event.endsWith(':close')), runCleanup);
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

for (const ids of [['ztz100_prototype', 'object695'], ['fixture_x', 'ztz100_prototype'], ['type100'], ['type100','object695','fixture_x']]) {
  const result = await scenario(null, [], true, ids);
  assert.equal(result.failure, undefined);
  const report = JSON.parse(result.writes[0].content);
  const comparisons = ids.includes('fixture_x') ? 1 : 0;
  assert.equal(report.summary.references, comparisons);
  assert.equal(report.summary.passed, comparisons, 'N/A concepts never become passing source comparisons');
  assert.equal(report.summary.notApplicable, ids.length - comparisons);
  assert.equal(report.summary.failed, 0);
  for (const row of report.rows.filter(row => row.comparisonApplicable === false)) {
    assert.equal(row.score, null);
    assert.equal(row.gatePassed, null, 'comparison routing does not certify physical design');
    assert.equal(row.designPath, conceptDesignPath(row.id));
    assert.equal(row.designSha256, readConceptDesign(row.id).designSha256);
  }
  assert.equal(result.events.includes('browser:launch'), comparisons > 0);
  assert.deepEqual(result.events.filter(event => event.endsWith(':close')), comparisons ? runCleanup : []);
}
for (const ids of [['unknown_tank'], ['fixture_x', 'fixture_x']]) {
  const result = await scenario(null, [], true, ids);
  assert.match(result.failure?.message ?? '', /unique known playable tank IDs/);
  assert.deepEqual(result.events, [], 'invalid selection never acquires resources');
  assert.equal(result.writes.length, 0, 'invalid selection never publishes a report');
}

// Exercise actual entrypoint routing: absence of registration is N/A, never
// a source pass. Absence of a registered file is still a hard release failure.
for (const ids of [['unregistered_tank'], ['fixture_x','unregistered_tank']]) {
  const result = await scenario(null, [], true, ids);
  assert.equal(result.failure, undefined);
  const report = JSON.parse(result.writes[0].content);
  assert.equal(report.summary.passed, ids.includes('fixture_x') ? 1 : 0);
  assert.equal(report.summary.notApplicable, 1);
  assert.equal(report.summary.unavailable, 0);
  assert.equal(result.process.exitCode, undefined);
  const row = report.rows.find(row => row.id === 'unregistered_tank');
  assert.equal(row.comparisonPurpose, 'first-party-unregistered');
  assert.equal(row.score, null);
  assert.equal(row.gatePassed, null);
  assert.equal(row.comparisonApplicable, false);
}
for (const ids of [['fixture_x'], ['fixture_x','unregistered_tank']]) {
  const result = await scenario(null, [], true, ids, false);
  assert.equal(result.failure, undefined);
  const report = JSON.parse(result.writes[0].content);
  assert.equal(report.summary.passed, 0);
  assert.equal(report.summary.unavailable, 1);
  assert.equal(report.summary.notApplicable, ids.includes('unregistered_tank') ? 1 : 0);
  assert.equal(result.process.exitCode, 1, 'registration still requires the actual reference file');
  assert.deepEqual(result.events.filter(event => event.endsWith(':close')), runCleanup);
}

// R4c (2026-10-16): a timed-out first load is retried once on the bound origin; a second timeout fails the run
{
  const retried = await scenario(null, [], true, ['fixture_x'], true, 1);
  assert.equal(retried.failure, undefined, 'one timed-out first load is retried');
  assert.equal(retried.gotos.filter(url => url.endsWith('&registry=1')).length, 3, 'the retried registry load, then the chunk\'s first load');
  assert.equal(retried.writes.length, 2, 'the retried run publishes its report');
  const twice = await scenario(null, [], true, ['fixture_x'], true, 2);
  assert.match(twice.failure?.message ?? '', /Navigation timeout/, 'two timed-out first loads fail');
  assert.equal(twice.gotos.length, 2, 'only one retry');
  assert.deepEqual(twice.events.filter(event => event.endsWith(':close')), allCleanup);
  assert.equal(twice.writes.length, 0);
}

console.log('procedural-fidelity-lifecycle: startup, cleanup, primary-error, scoring and registration-aware routing pass; bound origin, 180 s first load, one retry');
