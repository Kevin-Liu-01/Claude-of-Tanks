import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const runnerSource = await readFile(new URL('./terrain-stream-benchmark.mjs', import.meta.url), 'utf8');
// Fail before importing the old, unguarded runner: this regression must never
// launch Chromium or a Vite server just to discover that importing has effects.
assert.match(runnerSource, /export async function runTerrainStreamBenchmark/,
  'benchmark runner must expose a guarded, injectable entry point');
const { parseTerrainBenchmarkArgs, runTerrainStreamBenchmark } =
  await import('./terrain-stream-benchmark.mjs');

assert.deepEqual(parseTerrainBenchmarkArgs([]), { mapId: 'verdant', cpuRate: 1 });
assert.deepEqual(parseTerrainBenchmarkArgs(['--cpu=4', '--map=winter']), { mapId: 'winter', cpuRate: 4 });
for (const cpuRate of [1, 2, 3, 4, 5, 6]) {
  assert.equal(parseTerrainBenchmarkArgs([`--cpu=${cpuRate}`]).cpuRate, cpuRate);
}
for (const args of [
  ['--map=unknown'], ['--map=Winter'], ['--map='], ['--map=verdant', '--map=winter'],
  ['--cpu=0'], ['--cpu=7'], ['--cpu=-1'], ['--cpu=1.5'], ['--cpu=01'], ['--cpu=1e0'],
  ['--cpu='], ['--cpu=NaN'], ['--cpu=1', '--cpu=4'], ['--unknown=1'], ['winter'],
]) assert.throws(() => parseTerrainBenchmarkArgs(args), /terrain benchmark/);

function fixture(failAt = null, cleanupFailure = false) {
  const calls = [];
  const failure = new Error(`fixture_${failAt}`);
  const step = async (name, value) => {
    calls.push(name);
    if (failAt === name) throw failure;
    return value;
  };
  const session = {
    async send(method, params) {
      assert.equal(method, 'Emulation.setCPUThrottlingRate');
      assert.deepEqual(params, { rate: 4 });
      await step('cpu');
    },
    async detach() { await step('detach'); },
  };
  const page = {
    async createCDPSession() { return step('session', session); },
    async goto(url, options) {
      assert.equal(url, 'http://127.0.0.1:5919/tools/terrain-stream-benchmark.html?map=winter');
      assert.equal(options.timeout, 120000);
      await step('goto');
    },
    async waitForFunction(expression, options) {
      assert.equal(expression, 'window.__TERRAIN_STREAM_BENCH');
      assert.equal(options.timeout, 120000);
      await step('wait');
    },
    async evaluate() {
      return step('evaluate', { scenario: { mapId: 'winter', seed: 1337 }, eagerMs: 123 });
    },
  };
  const browser = {
    async newPage() { return step('page', page); },
    async close() {
      await step('browser-close');
      if (cleanupFailure) throw new Error('fixture_cleanup');
    },
  };
  const server = {
    httpServer: { address: () => ({ port: 5919 }) },
    async listen() { await step('listen'); },
    async close() { await step('server-close'); },
  };
  return { calls, failure, dependencies: {
    async createServerImpl(options) {
      assert.equal(options.server.host, '127.0.0.1');
      assert.equal(options.server.hmr, false);
      return step('server', server);
    },
    async launchBrowserImpl(options) {
      assert.equal(options.headless, 'new');
      return step('launch', browser);
    },
  } };
}

const success = fixture();
const report = await runTerrainStreamBenchmark({ mapId: 'winter', cpuRate: 4 }, success.dependencies);
assert.deepEqual(report, {
  scenario: { mapId: 'winter', seed: 1337, cpuThrottlingRate: 4, cpuThrottlingApplied: true },
  eagerMs: 123,
});
assert.deepEqual(success.calls, [
  'server', 'listen', 'launch', 'page', 'session', 'cpu', 'goto', 'wait', 'evaluate',
  'detach', 'browser-close', 'server-close',
], 'CPU emulation precedes navigation; all owned resources close after the probe');

for (const failAt of ['server', 'listen', 'launch', 'page', 'session', 'cpu', 'goto', 'wait', 'evaluate']) {
  const failed = fixture(failAt);
  await assert.rejects(runTerrainStreamBenchmark({ mapId: 'winter', cpuRate: 4 }, failed.dependencies),
    (error) => error === failed.failure);
  assert.equal(failed.calls.filter((call) => call === 'server-close').length, failAt === 'server' ? 0 : 1);
  assert.equal(failed.calls.filter((call) => call === 'browser-close').length,
    ['server', 'listen', 'launch'].includes(failAt) ? 0 : 1);
}
const cleanup = fixture(null, true);
await assert.rejects(runTerrainStreamBenchmark({ mapId: 'winter', cpuRate: 4 }, cleanup.dependencies),
  /fixture_cleanup/);
assert.equal(cleanup.calls.at(-1), 'server-close', 'browser close failure cannot leak the server');
const failedAndCleanup = fixture('evaluate', true);
await assert.rejects(runTerrainStreamBenchmark({ mapId: 'winter', cpuRate: 4 }, failedAndCleanup.dependencies),
  (error) => error === failedAndCleanup.failure, 'cleanup cannot replace the primary probe failure');
assert.equal(failedAndCleanup.calls.at(-1), 'server-close');
const invalid = fixture();
await assert.rejects(runTerrainStreamBenchmark({ mapId: 'winter', cpuRate: 99 }, invalid.dependencies),
  /terrain benchmark/);
assert.deepEqual(invalid.calls, [], 'invalid direct options fail before creating resources');

// Execute the actual browser entry with inexpensive terrain/graphics fixtures.
// No renderer, browser, or terrain generation runs in this focused test.
const entrySource = await readFile(new URL('./terrain-stream-benchmark-entry.ts', import.meta.url), 'utf8');
const entryBody = stripTypeScriptTypes(entrySource).replace(/^import[\s\S]*?;\s*$/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runEntry = new AsyncFunction('THREE', 'getMapConfig', 'buildTerrainMeshesAsync',
  'createHeightField', 'window', 'performance', 'setTimeout', entryBody);

async function sampleEntry(search, partial = false) {
  const calls = { maps: [], seeds: [], streams: [], cameras: [], timers: [] };
  let clock = 0;
  const window = { location: { search } };
  await runEntry({ Mesh: class Mesh {} }, (id) => { calls.maps.push(id); return {}; },
    async (_field, _context, _config, progress, _yield, stream) => {
      calls.streams.push(stream !== null);
      progress(0); progress(1); progress(2);
      const stats = { enabled: stream !== null, totalGeometryCount: 4,
        initialGeometryCount: 1, initialFineGridCount: 1, streamedGeometryCount: 0 };
      let updates = 0;
      return { traverse() {}, userData: { streamingStats: stats,
        updateLOD(camera) {
          calls.cameras.push({ ...camera });
          updates++;
          if (partial && updates % 4) clock += 50;
          else stats.streamedGeometryCount++;
        } } };
    }, (seed) => { calls.seeds.push(seed); return { _layout: { spawns: { player: { x: 2, z: -95 } } } }; },
    window, { now: () => ++clock }, (callback, ms) => { calls.timers.push(ms); callback(); });
  return { calls, report: window.__TERRAIN_STREAM_BENCH };
}

for (const [search, mapId] of [['', 'verdant'], ['?map=verdant', 'verdant'], ['?map=winter', 'winter']]) {
  const entry = await sampleEntry(search);
  assert.deepEqual(entry.calls.maps, [mapId]);
  assert.deepEqual(entry.calls.seeds, [1337]);
  assert.equal(entry.report.scenario.mapId, mapId);
  assert.equal(entry.report.scenario.seed, 1337);
  assert.equal(entry.report.scenario.cpuThrottlingApplied, undefined,
    'direct page does not claim CDP throttling it cannot observe');
  assert.deepEqual(entry.calls.streams, [false, true, false, false, true, true, false]);
  assert.deepEqual(entry.calls.timers, [50, 50, 50, 50, 50, 50]);
  assert.equal(entry.calls.cameras.length, 181 * 4 * 3);
  assert.deepEqual(entry.calls.cameras[0], { x: 2, z: -95 });
  assert.deepEqual(entry.calls.cameras.at(-1), { x: 37, z: 335 });
  assert.equal(entry.report.runs.length, 6, 'retain original alternating benchmark algorithm');
  assert.equal(entry.report.streamUpdates.count, 181 * 4 * 3);
  assert.equal(entry.report.streamUpdates.includesPartialWork, true);
}
const partial = await sampleEntry('?map=winter', true);
assert.equal(partial.report.streamUpdates.maxMs, 51,
  'expensive incomplete steps cannot disappear from the reported live-work maximum');
assert.equal(partial.report.streamJobs.maxMs, 1, 'completion-only metric remains separately labeled');
assert.deepEqual(partial.report.streamUpdates.completedGeometryPerRun, [181, 181, 181],
  'every run exposes actual throughput so slower publication cannot masquerade as identical work');
for (const query of ['?map=unknown', '?map=', '?map=winter&map=verdant']) {
  await assert.rejects(sampleEntry(query), /terrain benchmark/,
    'unknown or ambiguous map requests cannot silently benchmark Verdant');
}

console.log('terrain-stream-benchmark.selftest: PASS (CLI, actual entry scenario, ordering, failure cleanup)');
