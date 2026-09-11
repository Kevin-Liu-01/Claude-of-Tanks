import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { REFERENCE_MIXED_ROSTER, createPerfRosterRequest, inspectPerfRosterEligibility,
  recordPerfRosterCheckpoint, recordPerfRosterEdges, preservePerfRosterFailure, requirePerfRoster } from './perfprobe-roster.mjs';

// Never import the CLI: its top-level work acquires the shared capture lock.
// Execute its exact standalone declarations with browser/process dependencies
// supplied by the fixture, not a second implementation of the sampler.
const source = readFileSync(new URL('./perfprobe.mjs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function declaration(name) {
  const matches = [...source.matchAll(new RegExp(`^(?:async )?function ${name}\\(`, 'gm'))];
  assert.equal(matches.length, 1, `one source-owned ${name} declaration`);
  const start = matches[0].index;
  const end = source.indexOf('\n}', start);
  assert.notEqual(end, -1, `${name} retains a standalone top-level closing brace`);
  return source.slice(start, end + 2);
}
function load(name, context = {}) {
  return runInNewContext(`${declaration(name)}\n${name}`, context);
}

for (const [args, expected] of [
  [[], 'dist'],
  [['--dist', '/private/tmp/frozen baseline'], '/private/tmp/frozen baseline'],
  [['--dist=/private/tmp/frozen-candidate'], '/private/tmp/frozen-candidate'],
  [['--dist=baseline-dist', '--seconds=60'], 'baseline-dist'],
]) {
  assert.equal(load('opt', { args })('dist', 'dist'), expected,
    'production directory accepts separated and inline CLI values without changing its default');
}
assert.equal(load('opt', { args: ['--seconds', '20'] })('seconds', '60'), '20');

const modes = load('perfModes');
assert.deepEqual(plain(modes([], 'battle', 'player')), {
  production: false, earlyWindow: false, cameraInput: false, nativeCadence: false, windowMode: 'sustained',
});
assert.deepEqual(plain(modes(['--production', '--early-window', '--native-cadence'], 'battle', 'player')), {
  production: true, earlyWindow: true, cameraInput: false, nativeCadence: true, windowMode: 'early-control-release',
});
assert.deepEqual(plain(modes(['--camera-input'], 'battle', 'player')), {
  production: false, earlyWindow: false, cameraInput: true, nativeCadence: false, windowMode: 'sustained',
}, 'camera input is an independent explicit opt-in, not an implicit early/native override');
for (const [scene, entry] of [['garage', 'player'], ['battle', 'sync'], ['garage', 'sync']]) {
  assert.throws(() => modes(['--early-window'], scene, entry), /requires --scene battle --entry player/);
  assert.throws(() => modes(['--camera-input'], scene, entry), /--camera-input requires --scene battle --entry player/);
  assert.equal(modes([], scene, entry).earlyWindow, false, 'legacy scene/entry combinations remain available');
  assert.equal(modes([], scene, entry).cameraInput, false);
}
const browserArgs = load('perfBrowserArgs');
const legacyArgs = [
  '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-precise-memory-info', '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--js-flags=--expose-gc',
];
assert.deepEqual(plain(browserArgs(false)), legacyArgs, 'default Chromium switches remain exactly unchanged');
assert.deepEqual(plain(browserArgs(true)), legacyArgs.filter(flag =>
  !['--disable-frame-rate-limit', '--disable-gpu-vsync', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'].includes(flag)),
'native cadence retains normal frame and background scheduling');

function fixture({ memory = true, phase = 'garage' } = {}) {
  let now = 100, serial = 0, heapBytes = 1000;
  const raf = new Map(), intervals = new Map();
  const counts = { resets: 0, heapReads: 0, receipts: 0, gc: 0 };
  const info = {
    autoReset: true,
    render: { calls: 91, triangles: 92, points: 93, lines: 94 },
    memory: { geometries: 7, textures: 11 }, programs: [{}, {}],
    reset() {
      counts.resets++;
      Object.assign(this.render, { calls: 0, triangles: 0, points: 0, lines: 0 });
    },
  };
  const game = { phase, preBattleS: 0, timeS: 0,
    player: { specId: 'm1a2' }, tanks: [{ id: 'player', specId: 'm1a2', team: 0 }] };
  const performance = { now: () => now, timeOrigin: 123456 };
  if (memory) performance.memory = {
    get usedJSHeapSize() { counts.heapReads++; return heapBytes; },
  };
  const window = {
    __DEBUG: { renderer: { info }, game, lighting: { scheduledMask: 5 } },
    __PERF_READ_ENVIRONMENT() { counts.receipts++; return { marker: now }; },
    gc() { counts.gc++; },
  };
  const context = {
    window, performance,
    requestAnimationFrame(callback) { raf.set(++serial, callback); return serial; },
    cancelAnimationFrame(id) { raf.delete(id); },
    setInterval(callback, delay) {
      assert.equal(delay, 1000, 'heap observations retain the existing one-second cadence');
      intervals.set(++serial, callback); return serial;
    },
    clearInterval(id) { intervals.delete(id); },
  };
  return { window, game, info, counts, raf, intervals, context,
    get perf() { return window.__PERF; },
    install(waitForControl, sampleMs = 40) {
      load('installPerfSampler', context)({ sampleMs, waitForControl });
    },
    step(at, render = {}) {
      now = at;
      Object.assign(info.render, render);
      const callbacks = [...raf.values()]; raf.clear();
      callbacks.forEach(callback => callback(at));
    },
    heap(atBytes) {
      heapBytes = atBytes;
      for (const callback of intervals.values()) callback();
    },
  };
}

{
  const f = fixture();
  f.install(true);
  for (const [at, phase, preBattleS] of [
    [200, 'garage', 0], [400, 'battle', Infinity], [600, 'battle', 2],
    [700, 'battle', 0.01], [800, 'battle', NaN], [900, 'battle', undefined],
  ]) {
    Object.assign(f.game, { phase, preBattleS }); f.step(at);
    assert.equal(f.perf.startedAt, null);
    assert.equal(f.info.autoReset, true);
    assert.equal(f.intervals.size, 0);
    assert.deepEqual(f.counts, { resets: 0, heapReads: 0, receipts: 0, gc: 0 },
      'arming and unreleased RAFs perform no counter, heap, receipt or collection work');
  }
  f.game.preBattleS = 0;
  f.step(1000);
  assert.equal(f.perf.armedAt, 100);
  assert.equal(f.perf.timeOrigin, 123456);
  assert.equal(f.perf.startedAt, 1000, 'the first qualifying RAF, not the CDP waiter, opens the window');
  assert.deepEqual(plain(f.perf.deltas), [], 'the loading gap cannot become a frame sample');
  assert.deepEqual(plain(f.perf.heap), [1000]);
  assert.equal(f.info.autoReset, false);
  assert.equal(f.counts.resets, 1, 'discard every renderer pass before control release');
  assert.equal(f.counts.receipts, 1);
  assert.equal(f.intervals.size, 1);
  assert.deepEqual(plain(f.perf.environmentStart), {
    marker: 1000, phase: 'battle', preBattleS: 0, timeS: 0, playerSpecId: 'm1a2',
    roster: [{ id: 'player', specId: 'm1a2', team: 0 }],
  });
  f.game.tanks[0].specId = 'tiger2';
  f.game.timeS = 0.016;
  f.step(1016, { calls: 12, triangles: 180, points: 3, lines: 4 });
  f.heap(1200);
  f.window.__DEBUG.lighting.scheduledMask = 2;
  f.step(1032, { calls: 21, triangles: 240, points: 6, lines: 8 });
  assert.deepEqual(plain(f.perf.deltas), [16, 16]);
  assert.deepEqual(plain(f.perf.times), [16, 32]);
  assert.deepEqual(plain(f.perf.calls), [12, 21]);
  assert.deepEqual(plain(f.perf.tris), [180, 240]);
  assert.deepEqual(plain(f.perf.points), [3, 6]);
  assert.deepEqual(plain(f.perf.lines), [4, 8]);
  assert.deepEqual(plain(f.perf.shadowMasks), [5, 2]);
  assert.deepEqual(plain(f.perf.heap), [1000, 1200]);
  f.step(1048, { calls: 999 });
  assert.equal(f.perf.done, true);
  assert.equal(f.perf.endedAt, 1048);
  assert.equal(f.perf.deltas.length, 2, 'the completion RAF lies outside the requested window');
  assert.deepEqual(plain(f.perf.info), { geometries: 7, textures: 11, programs: 2 });
  assert.equal(f.perf.environmentStart.roster[0].specId, 'm1a2', 'start receipt copies mutable roster rows');
  assert.equal(f.perf.environmentEnd.roster[0].specId, 'tiger2');
  assert.equal(f.counts.receipts, 2, 'environment receipts run only at the two edges');
  assert.equal(f.counts.gc, 0, 'the sampler never forces collection');
  assert.equal(f.info.autoReset, true);
  assert.equal(f.raf.size, 0);
  assert.equal(f.intervals.size, 0);
}
{
  const f = fixture({ memory: false });
  f.install(false);
  assert.equal(f.perf.startedAt, 100, 'sustained sampling starts immediately, including Garage');
  assert.equal(f.perf.windowMode, 'sustained');
  assert.equal(f.info.autoReset, false);
  assert.equal(f.counts.receipts, 1);
  f.step(110); f.step(126, { calls: 4 }); f.step(142);
  assert.deepEqual(plain(f.perf.deltas), [16]);
  assert.deepEqual(plain(f.perf.times), [26]);
  assert.deepEqual(plain(f.perf.heap), [], 'missing performance.memory is supported without invented zero bytes');
  assert.equal(f.perf.done, true);
  assert.equal(f.info.autoReset, true);
  assert.equal(f.intervals.size, 0);
}

{
  const f = fixture();
  const readHeap = load('readPerfHeapSnapshot', f.context);
  assert.deepEqual(plain(readHeap(false)), { bytes: 1000, forcedGC: false });
  assert.equal(f.counts.gc, 0, 'raw reads never force collection');
  assert.deepEqual(plain(readHeap(true)), { bytes: 1000, forcedGC: true });
  assert.equal(f.counts.gc, 2, 'observed forced collection retains both legacy collection calls');
  delete f.window.gc;
  assert.deepEqual(plain(readHeap(true)), { bytes: 1000, forcedGC: false },
    'requesting collection is not evidence that the browser exposed it');
  delete f.context.performance.memory;
  assert.deepEqual(plain(readHeap(true)), { bytes: -1, forcedGC: false });
}

{
  const close = load('closePerfServer');
  const calls = [];
  await close({ async close() { calls.push('dev'); }, httpServer: {
    close() { assert.fail('a dev server owns its own close API'); },
  } });
  await close({ httpServer: { close(callback) { calls.push('preview'); callback(); } } });
  assert.deepEqual(calls, ['dev', 'preview']);
  const devError = new Error('dev close failed'), previewError = new Error('preview close failed');
  await assert.rejects(close({ async close() { throw devError; } }), error => error === devError);
  await assert.rejects(close({ httpServer: { close(callback) { callback(previewError); } } }),
    error => error === previewError);
}
{
  const reads = [], commands = [];
  const bytes = { 'src/a.ts': 'alpha', 'src/z.ts': 'zeta' };
  const receipt = load('perfSourceReceipt', {
    createHash,
    execFileSync(command, args) {
      assert.equal(command, 'git'); commands.push(args);
      if (args[0] === 'ls-files') return 'src/z.ts\nsrc/a.ts\nsrc/z.ts\n';
      if (args[0] === 'rev-parse') return 'fixture-revision\n';
      if (args[0] === 'status') return ' M src/z.ts\n?? src/new.ts\n';
      assert.fail(`unexpected git operation: ${args}`);
    },
    readFileSync(path) { reads.push(path); return bytes[path]; },
  })();
  assert.deepEqual(reads, ['src/a.ts', 'src/z.ts'], 'source hashing sorts and deduplicates paths');
  assert.equal(receipt.sourceHash, createHash('sha256').update('src/a.ts').update('alpha')
    .update('src/z.ts').update('zeta').digest('hex'));
  assert.equal(receipt.revision, 'fixture-revision');
  assert.deepEqual(plain(receipt.dirtyPaths), ['M src/z.ts', '?? src/new.ts']);
  assert.deepEqual(plain(commands[0]), ['ls-files', '-co', '--exclude-standard', '--', 'src']);
}

// Wiring assertions complement executable functions: the CLI must actually
// choose the tested helpers at the correct entry and heap boundaries.
assert.match(source, /const seconds = parseFloat\(opt\('seconds', '60'\)\)/);
assert.match(source, /const entryMode = opt\('entry', 'player'\)/);
assert.match(source, /const sceneMode = opt\('scene', 'battle'\)/);
const budgetSource = source.match(/^const BUDGET = \{[\s\S]*?^\};/m)?.[0];
assert.ok(budgetSource, 'frozen budget declaration remains explicit');
for (const [fpsTarget, seconds] of [[60, 60], [120, 20]]) {
  const budget = runInNewContext(`${budgetSource}\nBUDGET`, { fpsTarget, seconds });
  assert.deepEqual(plain(budget), {
    fpsMedianMin: fpsTarget, fpsP5Min: fpsTarget * 0.75, frameMsP99Max: 1500 / fpsTarget,
    drawCallsWorstFrameMax: 900, trianglesMedianMax: 7_000_000, loadToReadyMaxMs: 5000,
    sceneTextureMBMax: 512, heapGrowthMaxMBperS: seconds >= 60 ? 1 : 2,
  });
}
assert.match(source, /trianglesMedianMax: 6_000_000/);
const arm = source.indexOf('await page.evaluate(installPerfSampler, { sampleMs: seconds * 1000, waitForControl: true, profileWindow, drawAttribution, schedulerTrace })');
const enter = source.indexOf("await D.beginBattleEntry('m1a2', map)");
assert.ok(arm > 0 && arm < enter, 'early acquisition is armed before awaiting normal player entry');
const armBlock = source.slice(source.lastIndexOf('  if (earlyWindow) {', arm), arm);
assert.match(armBlock, /setSamples\(samples\)/, 'forced AA is configured before opening the early window');
assert.doesNotMatch(armBlock, /setTimeout|__GLB_STATS|readPerfHeapSnapshot|window\.gc/);
const settleStart = source.indexOf('  if (!earlyWindow) {', enter);
const preGcStart = source.indexOf('  const heapPreGc', settleStart);
assert.ok(settleStart > enter && preGcStart > settleStart);
const settleBlock = source.slice(settleStart, preGcStart);
assert.match(settleBlock, /setTimeout\(r, 1500\)/);
assert.match(settleBlock, /window\.__GLB_STATS/);
assert.match(source, /const heapPreGc = earlyWindow \? null : await page\.evaluate\(readPerfHeapSnapshot, true\)/,
  'early acquisition does not run the legacy pre-window GC');
assert.match(source, /if \(!earlyWindow\) \{\s*if \(profileWindow\) await beginWindowProfile\(\);\s*await page\.evaluate\(installPerfSampler, \{ sampleMs: seconds \* 1000, waitForControl: false, profileWindow, drawAttribution, schedulerTrace \}\)/,
  'the early sampler is not replaced by a later sustained sampler');
assert.ok(source.indexOf('const heapPostGc = await page.evaluate(readPerfHeapSnapshot, true)') >
  source.indexOf("await page.waitForFunction('window.__PERF && window.__PERF.done === true'"),
  'post-window forced-GC observation remains separate from the timed sample');
assert.match(source, /server = production\s*\? await preview\(/);
assert.match(source, /if \(!production\) await server\.listen\(\)/);
assert.match(source, /const distPath = resolve\(opt\('dist', 'dist'\)\)/);
assert.match(source, /await preview\(\{[^\n]*build: \{ outDir: distPath \}/);
assert.match(source, /const buildIndexHash = production \? sha256\(readFileSync\(resolve\(distPath, 'index\.html'\)\)\) : null/);
assert.match(source, /if \(production && sha256\(readFileSync\(resolve\(distPath, 'index\.html'\)\)\) !== buildIndexHash\)/);
assert.doesNotMatch(source, /resolve\('dist\/index\.html'\)/,
  'every build-hash observation follows the selected production directory');
assert.equal([...source.matchAll(/distPath: production \? distPath : null/g)].length, 3,
  'the report, raw frame dump and failed-acquisition receipt identify the production artifact directory');
assert.doesNotMatch(source, /(?:execSync|execFileSync|spawn|spawnSync)\([^\n]*(?:npm.*build|vite.*build)/,
  'production acquisition consumes an existing artifact, never invokes a build');
assert.match(source, /readFileSync\(new URL\('\.\/perfprobe\.mjs', import\.meta\.url\)\)/);
assert.match(source, /readFileSync\(new URL\('\.\/phase-environment-receipt\.mjs', import\.meta\.url\)\)/);
assert.match(source, /readFileSync\(new URL\('\.\/perfprobe-camera-input\.mjs', import\.meta\.url\)\)/,
  'the exact optional camera acquisition is part of the immutable tool receipt');
assert.match(source, /readFileSync\(new URL\('\.\/perfprobe-roster\.mjs', import\.meta\.url\)\)/,
  'the exact roster acquisition contract is part of the immutable tool receipt');
const cameraStart = source.indexOf('cameraJob = runCameraInputWindow(page,');
assert.ok(cameraStart > source.indexOf('await page.evaluate(installPerfSampler, { sampleMs: seconds * 1000, waitForControl: false, profileWindow, drawAttribution, schedulerTrace })'),
  'camera preparation runs after the ordinary timed sampler, never as an extra early-window settle');
assert.ok(cameraStart < source.indexOf("await page.waitForFunction('window.__PERF && window.__PERF.done === true'"),
  'the input observer runs alongside the timed sample');
assert.match(source.slice(source.lastIndexOf('  if (cameraInput) {', cameraStart), cameraStart), /new AbortController/);
assert.match(source, /const cameraInputReport = cameraJob \? await cameraJob : null/,
  'default acquisition does not run a camera job');
assert.match(source, /cameraInput: cameraInput \? CAMERA_INPUT_PROTOCOL : 'none'/);
assert.equal([...source.matchAll(/cameraInput: cameraInputReport/g)].length, 2,
  'raw frame dumps and full reports retain the requested input evidence');
assert.match(source, /if \(cameraInputReport && !cameraInputReport\.coveragePass\) \{[\s\S]*?failed = true/,
  'unsupported or incomplete input evidence cannot silently produce a successful opt-in exit');
const cleanup = source.slice(source.lastIndexOf('} finally {'));
assert.ok(cleanup.indexOf('cameraAbort?.abort()') < cleanup.indexOf('browser?.close()'));
assert.ok(cleanup.indexOf('if (cameraJob) await cameraJob') < cleanup.indexOf('releaseLock()'),
  'input acquisition is aborted and joined before the shared browser lease is released');
assert.match(source, /cadence: nativeCadence \? 'native-requested' : 'unlocked-throughputput'/);
assert.match(source, /environment: \{ start: perf\.environmentStart, end: perf\.environmentEnd \}/);
assert.match(source, /source: \{\s*\.\.\.source, end: sourceEnd, unchanged: source\.sourceHash === sourceEnd\.sourceHash/);
const trend = source.slice(source.indexOf("appendFileSync(resolve('.qa-dev/reports/perf-trend.jsonl')"));
for (const field of ['windowMode', 'production', 'distPath', 'cadence', 'buildIndexHash', 'acquisitionHash', 'cameraInput', 'cameraInputStatus', 'rosterProvenance']) {
  assert.match(trend, new RegExp(`\\b${field}\\b`), `trend rows distinguish ${field}`);
}

const available = ['m1a2', ...REFERENCE_MIXED_ROSTER, 'extra'].map(id => ({ id, specId: id }));
const request = createPerfRosterRequest();
const snapshot = (ids = ['m1a2', ...REFERENCE_MIXED_ROSTER]) => ({ phase: 'battle', preBattleS: 0, playerSpecId: 'm1a2',
  roster: ids.map((id, index) => ({ id, specId: id, team: index < 7 ? 'player' : 'enemy' })) });
assert.equal(request.label, 'reference-mixed-13-opponents');
assert.equal(request.expectedCount, 14);
assert.deepEqual(request.requestedOpponents, [
  'fv510_milan', 'bwp1', 'amx40', 'strv103a', 't80b', 't80bv', 'type90',
  'm60a2', 'type90a', 'm1a1ha', 'carro45t', 'ztz85_iii', 'm2a2_bradley',
]);
{
  const provenance = inspectPerfRosterEligibility(request, available);
  requirePerfRoster(provenance.eligibility);
  const actual = snapshot();
  for (const name of ['entry', 'sample-start', 'sample-end']) requirePerfRoster(recordPerfRosterCheckpoint(provenance, name, actual));
  assert.equal(provenance.pass, true);
  actual.roster[1].specId = 'changed';
  assert.equal(provenance.checkpoints[0].actual.roster[1].specId, REFERENCE_MIXED_ROSTER[0], 'all checkpoints retain independent copies');
  assert.deepEqual(provenance.checkpoints.map(row => row.name), ['entry', 'sample-start', 'sample-end']);
}
for (const [option, pattern] of [
  ['missing,' + REFERENCE_MIXED_ROSTER.slice(1).join(','), /Unavailable production tank ID "missing"/],
  ['tiger2,' + REFERENCE_MIXED_ROSTER.slice(1).join(','), /archived/],
  [REFERENCE_MIXED_ROSTER.slice(1).join(','), /requires 13 opponents; requested 12/],
  [REFERENCE_MIXED_ROSTER.join(',') + ',extra', /requires 13 opponents; requested 14/],
  [REFERENCE_MIXED_ROSTER[1] + ',' + REFERENCE_MIXED_ROSTER.slice(1).join(','), /Duplicate/],
  ['m1a2,' + REFERENCE_MIXED_ROSTER.slice(1).join(','), /Duplicate/],
  [',' + REFERENCE_MIXED_ROSTER.slice(1).join(','), /tank ID ""/],
]) {
  const provenance = inspectPerfRosterEligibility(createPerfRosterRequest(option), available);
  assert.equal(provenance.pass, false);
  assert.throws(() => requirePerfRoster(provenance.eligibility), pattern);
  assert.equal(provenance.checkpoints.length, 0, 'preflight rejects before any entry sample');
}
assert.throws(() => requirePerfRoster(inspectPerfRosterEligibility(request, available.slice(1)).eligibility), /"m1a2"/);
for (const mutate of [
  actual => actual.roster.pop(),
  actual => actual.roster.push({ id: 'extra', specId: 'extra', team: 'enemy' }),
  actual => { [actual.roster[1], actual.roster[2]] = [actual.roster[2], actual.roster[1]]; },
  actual => { actual.roster[1] = { ...actual.roster[2] }; },
  actual => { actual.roster[1].specId = 'extra'; },
  actual => { actual.playerSpecId = 'extra'; },
  actual => { actual.phase = 'garage'; },
  actual => { actual.phase = 'ended'; },
  actual => { actual.preBattleS = 3; },
  actual => { actual.preBattleS = NaN; },
  actual => { actual.preBattleS = -Infinity; },
  actual => { actual.preBattleS = undefined; },
  actual => { actual.roster[1].team = 'enemy'; },
  actual => { actual.roster[1].team = 'ally'; },
  actual => { [actual.roster[1].team, actual.roster[7].team] = [actual.roster[7].team, actual.roster[1].team]; },
]) {
  const provenance = inspectPerfRosterEligibility(request, available);
  requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'entry', snapshot()));
  const actual = snapshot(); mutate(actual);
  assert.throws(() => requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'sample-start', actual)), /Roster acquisition mismatch/);
  assert.equal(provenance.pass, false, 'mismatch remains failed even if a later edge matches again');
  recordPerfRosterCheckpoint(provenance, 'sample-end', snapshot());
  assert.equal(provenance.pass, false);
  assert.deepEqual(provenance.checkpoints[1].actual, { ...actual, preBattleS: actual.preBattleS ?? null },
    'failed evidence is preserved without filtering/reordering');
}
for (const phase of ['garage', 'ended']) {
  const provenance = inspectPerfRosterEligibility(request, available);
  assert.throws(() => requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'entry', { ...snapshot(), phase })), /phase must be battle/);
}
{
  const provenance = inspectPerfRosterEligibility(request, available);
  requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'entry', { ...snapshot(), preBattleS: 5 }));
  recordPerfRosterEdges(provenance, { environmentStart: snapshot(), environmentEnd: snapshot() });
  assert.equal(provenance.pass, true, 'normal covered entry/countdown is allowed; timed edges must be released');
  recordPerfRosterEdges(provenance, { environmentStart: snapshot(), environmentEnd: snapshot() });
  assert.equal(provenance.checkpoints.length, 3, 'failure cleanup cannot overwrite or duplicate recorded edges');
  let reads = 0;
  await preservePerfRosterFailure(provenance, () => { reads++; throw new Error('later optional GPU inventory failure'); });
  assert.equal(reads, 0, 'complete observed evidence is already saved before diagnostics and is not recaptured');
  assert.equal(provenance.checkpoints[2].name, 'sample-end');
}
{
  const provenance = inspectPerfRosterEligibility(request, available);
  requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'entry', snapshot()));
  const start = snapshot();
  await preservePerfRosterFailure(provenance, async () => ({ environmentStart: start }));
  assert.deepEqual(provenance.checkpoints.map(checkpoint => checkpoint.name), ['entry', 'sample-start']);
  start.roster[0].team = 'changed';
  assert.equal(provenance.checkpoints[1].actual.roster[0].team, 'player', 'incomplete sampler failure retains its observed start without inventing an end');
}
for (const readEdges of [
  () => { throw new Error('CDP closed'); },
  () => Promise.reject(new Error('page crashed')),
  () => new Promise(() => {}),
]) {
  const provenance = inspectPerfRosterEligibility(request, available);
  await preservePerfRosterFailure(provenance, readEdges, 1);
  assert.match(provenance.sampleCaptureError, /CDP closed|page crashed|timed out/);
  assert.equal(provenance.checkpoints.length, 0, 'dead/blocked CDP keeps an explicit capture error, not invented edges');
}
{
  const provenance = inspectPerfRosterEligibility(request, available);
  recordPerfRosterEdges(provenance, { environmentStart: snapshot() });
  assert.equal(provenance.pass, false, 'normal completed acquisition requires both observed edges');
  assert.equal(provenance.checkpoints[1].name, 'sample-end');
  assert.equal(provenance.checkpoints[1].pass, false);
}
{
  const provenance = inspectPerfRosterEligibility(createPerfRosterRequest('random'), available);
  assert.equal(provenance.mode, 'random-seeded');
  assert.equal(provenance.expected, null);
  assert.equal(provenance.requestedOpponents, null);
  const actual = snapshot(['m1a2', ...REFERENCE_MIXED_ROSTER.slice().reverse()]);
  requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'entry', actual));
  requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'sample-start', actual));
  [actual.roster[1], actual.roster[2]] = [actual.roster[2], actual.roster[1]];
  assert.throws(() => requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'sample-end', actual)), /Initial seeded roster/);
  assert.equal(provenance.pass, false, 'random is not pinned, but cannot silently change its initial identities/order mid-sample');
}
for (const badIds of [
  ['m1a2', ...REFERENCE_MIXED_ROSTER.slice(1)],
  ['m1a2', 'unknown', ...REFERENCE_MIXED_ROSTER.slice(1)],
  ['m1a2', REFERENCE_MIXED_ROSTER[1], ...REFERENCE_MIXED_ROSTER.slice(1)],
]) {
  const provenance = inspectPerfRosterEligibility(createPerfRosterRequest('random'), available);
  assert.throws(() => requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'entry', snapshot(badIds))), /Roster acquisition mismatch/);
}
{
  // The contract never assumes an entity ID is a vehicle spec ID.
  const aliased = available.map(row => ({ ...row, specId: `spec-${row.specId}` }));
  const provenance = inspectPerfRosterEligibility(request, aliased);
  const actual = snapshot();
  actual.playerSpecId = 'spec-m1a2';
  actual.roster.forEach(row => { row.specId = `spec-${row.specId}`; });
  requirePerfRoster(recordPerfRosterCheckpoint(provenance, 'entry', actual));
}
const preflight = source.indexOf('requirePerfRoster(rosterProvenance.eligibility)');
assert.ok(preflight > 0 && preflight < arm && preflight < enter, 'eligibility is checked before arming or starting any battle');
assert.match(source.slice(preflight, arm), /delete flags\.forceRoster;\s*delete flags\.rosterExact;/,
  'random clears old debug overrides and uses the ordinary full battle');
const entryCheck = source.indexOf("requirePerfRoster(recordPerfRosterCheckpoint(rosterProvenance, 'entry', actualEntry))");
assert.ok(entryCheck > enter && entryCheck < source.indexOf("if (earlyWindow) await page.keyboard.down('KeyW')"),
  'actual roster validation fails before releasing player-control acquisition');
const sampleDone = source.indexOf("await page.waitForFunction('window.__PERF && window.__PERF.done === true'");
const edgeCapture = source.indexOf('recordPerfRosterEdges(rosterProvenance, perf)');
const diagnosticGc = source.indexOf('const heapPostGc = await page.evaluate(readPerfHeapSnapshot, true)');
assert.ok(sampleDone > 0 && edgeCapture > sampleDone && edgeCapture < diagnosticGc,
  'exact sampler edges are captured before optional GC/inventory diagnostics can fail');
assert.ok(edgeCapture < source.indexOf("if (sceneMode === 'battle') await page.keyboard.up('KeyW')"),
  'even post-window keyboard failures cannot erase already-observed edges');
assert.match(source, /if \(rosterProvenance && !rosterProvenance\.pass\) failed = true/);
assert.match(source, /lines\.rosterProvenance = \{[\s\S]*?pass: rosterProvenance\.pass/);
assert.match(source, /if \(\(rosterProvenance \|\| profileWindow \|\| schedulerTrace\) && !report\) report = \{[\s\S]*?failure: err\.message/,
  'preflight/entry failure still writes the requested and actual failure evidence');
const failureCapture = source.indexOf('await preservePerfRosterFailure(rosterProvenance,');
assert.ok(failureCapture > diagnosticGc && failureCapture < source.indexOf('if ((rosterProvenance || profileWindow || schedulerTrace) && !report) report ='),
  'failed/incomplete sampling attempts one bounded edge capture before final report and browser cleanup');
assert.doesNotMatch(source, /WORST_CASE_ROSTER|all multi-mesh GLB heavies|7 enemies max/);

console.log('perfprobe: frozen frame gates, roster eligibility/exact edge provenance, native flags, control-edge sampling, heap observations, production receipts and cleanup passed');
