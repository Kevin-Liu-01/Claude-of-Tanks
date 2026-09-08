import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installProductionEntryObserver, readProductionEntryObserver,
  productionBattleLoaderHidden, observeProductionEntry } from './production-entry-observer.mjs';

function browserFixture() {
  let now = 100;
  let serial = 0;
  const queued = new Map();
  const surface = { loaderOn: false, display: 'none', opacity: '0', numeral: '',
    waiting: false, focused: true, hidden: false, label: 'PRIVATE_LABEL', disconnected: false };
  const numeral = { get textContent() { return surface.numeral; } };
  const overlay = { classList: { contains: (name) => name === 'waiting' && surface.waiting },
    querySelector: () => numeral, getClientRects: () => [1] };
  const loader = { classList: { contains: () => surface.loaderOn },
    querySelector: (selector) => selector === '.fstage'
      ? { textContent: surface.label } : { getAttribute: () => '50' } };
  const debug = { game: { phase: 'garage' }, network: { connected: false },
    frameLoopScheduler: { animationTicks: 10, backgroundTicks: 2 },
    renderer: { info: { render: { frame: 20 }, programs: [{}, {}] } }, post: { composer: {} } };
  let tasks;
  const context = {
    window: { __DEBUG: debug,
      __WORLD_PREFETCH: { requested: 1, completed: 0, joined: 0, promoted: 0,
        cancelled: 0, skippedCapacity: 0, lastMs: 0, active: 'PRIVATE_MAP', lastMap: 'PRIVATE_MAP',
        room: 'PRIVATE_ROOM', player: 'PRIVATE_PLAYER' },
      __NETWORK_LOAD: { map: 'winter', mode: 'PRIVATE_ROOM', worldMs: 20, stages: { compile: 4 },
        status: 'pending', startedAt: 110, endedAt: Infinity,
        stageIntervals: [{ stage: 'panelMasks', startTime: 118, endTime: 120 },
          { stage: 'compile', startTime: 120, endTime: 124 },
          { stage: 'reveal', startTime: 124 }, { stage: 'PRIVATE_STAGE', startTime: 125 }],
        revealSlices: [{ stage: 'activation', startTime: 124, endTime: 126 },
          { stage: 'primeReveal', startTime: NaN, endTime: 'PRIVATE_END' }],
        blackCheck: { before: 40, after: null, error: 'PRIVATE_ERROR' } },
      __WORLD_LOAD: { id: 'winter', cached: false, status: 'pending', startedAt: 110,
        stageIntervals: [{ stage: 'build', startTime: 110 }],
        buildDetail: { terrain: { totalMs: 2 }, url: 'PRIVATE_URL' }, error: { message: 'PRIVATE_ERROR' } },
      __TOP_MASK_LOAD: { status: 'pending', startedAt: 125, endedAt: Infinity,
        specId: 'PRIVATE_SPEC', url: 'PRIVATE_URL', error: new Error('PRIVATE_ERROR'),
        intervals: [{ stage: 'build', startTime: 126, endTime: 127 },
          { stage: 'hullRender', startTime: 128 }, { stage: 'PRIVATE_STAGE', startTime: 129 }] } },
    document: { querySelector: (selector) => selector === '.cot-bl' ? loader : overlay,
      hasFocus: () => surface.focused, get hidden() { return surface.hidden; } },
    getComputedStyle: (node) => node === loader ? { display: surface.display, opacity: surface.opacity }
      : { visibility: 'visible', opacity: '1' },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => { queued.set(++serial, callback); return serial; },
    cancelAnimationFrame: (id) => queued.delete(id),
    PerformanceObserver: class {
      constructor(callback) { tasks = callback; }
      observe() {}
      takeRecords() { return [{ startTime: 120, duration: 55 }]; }
      disconnect() { surface.disconnected = true; }
    },
  };
  const run = (fn, value) => runInNewContext(`(${fn.toString()})(${JSON.stringify(value)})`, context);
  run(installProductionEntryObserver);
  return { surface, debug, queued, context, run,
    tasks: (rows) => tasks({ getEntries: () => rows }),
    step(changes = {}) {
      Object.assign(surface, changes); now += 16;
      debug.frameLoopScheduler.animationTicks++;
      debug.renderer.info.render.frame += 2;
      const callbacks = [...queued.values()]; queued.clear();
      callbacks.forEach((callback) => callback());
    } };
}

const f = browserFixture();
assert.equal(f.run(productionBattleLoaderHidden), false);
f.run(readProductionEntryObserver, 'launch');
f.step({ loaderOn: true, display: 'grid', opacity: '1', waiting: true, numeral: 'READY' });
f.debug.game.phase = 'battle'; f.debug.network.connected = true;
f.step({ loaderOn: false, opacity: '0.5' });
assert.equal(f.run(productionBattleLoaderHidden), false, 'a fading loader is still covering the game');
f.step({ display: 'none', opacity: '0' });
assert.equal(f.run(productionBattleLoaderHidden), true);
f.run(readProductionEntryObserver, 'both-hidden');
for (const second of [5, 4, 3, 2, 1]) f.step({ waiting: false, numeral: String(second) });
f.step({ numeral: 'ROLL OUT!' });
f.debug.renderer.info.programs.push({});
f.tasks([{ startTime: 50, duration: 200 }, { startTime: 130, duration: 60, name: 'PRIVATE_TASK' }]);
const receipt = JSON.parse(JSON.stringify(f.run(readProductionEntryObserver, 'stop')));
assert.deepEqual(receipt.countdown, [5, 4, 3, 2, 1]);
assert.deepEqual(receipt.foregroundCountdown, [5, 4, 3, 2, 1]);
assert.equal(receipt.firstLoaderHidden.phase, 'battle');
assert.equal(receipt.firstLoaderHidden.loaderHidden, true);
assert.equal(receipt.counterDeltas.animationTicks, receipt.rafCallbacks);
assert.equal(receipt.counterDeltas.rendererFrame, receipt.rafCallbacks * 2);
assert.equal(receipt.startCounters.programCount, 2);
assert.equal(receipt.endCounters.programCount, 3);
assert.equal(receipt.counterDeltas.programCount, 1);
assert.equal(receipt.readiness.postAvailable, true);
assert.equal(receipt.readiness.connected, true);
assert.deepEqual(receipt.longTasks, [{ at: 130, durationMs: 60 }, { at: 120, durationMs: 55 }]);
assert.equal(receipt.networkLoad.worldMs, 20);
assert.equal(receipt.networkLoad.status, 'pending');
assert.equal(receipt.networkLoad.startedAt, 110);
assert.equal(receipt.networkLoad.endedAt, null, 'non-finite network clock values remain unknown');
assert.deepEqual(receipt.networkLoad.stageIntervals, [
  { stage: 'panelMasks', startTime: 118, endTime: 120 },
  { stage: 'compile', startTime: 120, endTime: 124 },
  { stage: 'reveal', startTime: 124, endTime: null },
]);
assert.equal(Object.hasOwn(receipt.networkLoad, 'preparationSlices'), false,
  'legacy traces do not acquire an invented preparation interval field');
assert.deepEqual(receipt.networkLoad.revealSlices, [
  { stage: 'activation', startTime: 124, endTime: 126 },
  { stage: 'primeReveal', startTime: null, endTime: null },
]);
assert.equal(receipt.worldLoad.status, 'pending', 'failure evidence retains unfinished world intervals');
assert.equal(receipt.worldLoad.stageIntervals[0].endTime, null);
assert.deepEqual(receipt.topMaskLoad, { status: 'pending', startedAt: 125, endedAt: null,
  intervals: [{ stage: 'build', startTime: 126, endTime: 127 },
    { stage: 'hullRender', startTime: 128, endTime: null }] },
  'a pending mask transaction retains only bounded timing fields');
assert.equal(receipt.clock, 'page-performance-now-ms');
assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
assert.equal(f.queued.size, 0);
assert.equal(f.surface.disconnected, true);
f.debug.renderer.info.render.frame += 100;
assert.deepEqual(JSON.parse(JSON.stringify(f.run(readProductionEntryObserver, 'stop'))), receipt,
  'stop is idempotent and never duplicates pending observer records');

{
  const overlap = browserFixture();
  overlap.context.window.__NETWORK_LOAD.stageIntervals = [
    { stage: 'compile', startTime: 120, endTime: 180 },
    { stage: 'panelJoin', startTime: 180, endTime: 190, detail: 'PRIVATE_DETAIL' },
  ];
  overlap.context.window.__NETWORK_LOAD.preparationSlices = [
    { stage: 'panelMasks', startTime: 118, endTime: 190, room: 'PRIVATE_ROOM' },
    { stage: 'compile', startTime: 120, endTime: 180, url: 'PRIVATE_URL', extraNumeric: 123 },
    { stage: 'panelMasks', startTime: 999, endTime: 1000 },
  ];
  const measured = JSON.parse(JSON.stringify(overlap.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(measured.networkLoad.preparationSlices, [
    { stage: 'panelMasks', startTime: 118, endTime: 190 },
    { stage: 'compile', startTime: 120, endTime: 180 },
  ], 'two full asynchronous preparation intervals survive independently of the residual panel wait');
  assert.deepEqual(measured.networkLoad.stageIntervals, [
    { stage: 'compile', startTime: 120, endTime: 180 },
    { stage: 'panelJoin', startTime: 180, endTime: 190 },
  ], 'panelJoin is retained as a distinct serial wait, not relabelled as full panel preparation');
  assert.doesNotMatch(JSON.stringify(measured), /PRIVATE|extraNumeric/);
}
for (const value of [undefined, null, 'PRIVATE_SLICES', 42, {}, true]) {
  const malformed = browserFixture();
  malformed.context.window.__NETWORK_LOAD.preparationSlices = value;
  const measured = malformed.run(readProductionEntryObserver, 'stop');
  assert.equal(Object.hasOwn(measured.networkLoad, 'preparationSlices'), false,
    'missing and malformed optional preparation collections preserve legacy receipt shape');
}
for (const [rows, expected] of [
  [[], []],
  [[{ stage: 'panelMasks', startTime: NaN, endTime: 'PRIVATE_END' },
    { stage: 'compile', startTime: Infinity }],
  [{ stage: 'panelMasks', startTime: null, endTime: null },
    { stage: 'compile', startTime: null, endTime: null }]],
  [[{ stage: 'PRIVATE_STAGE', startTime: 1 }, { stage: 'panelJoin', startTime: 2 },
    { stage: 'compile', startTime: 3, endTime: 4 }], []],
  [[null, { stage: 'compile', startTime: 0, endTime: 0, private: 'PRIVATE_ROW' }],
  [{ stage: 'compile', startTime: 0, endTime: 0 }]],
  [['PRIVATE_ROW', 7], []],
]) {
  const malformed = browserFixture();
  malformed.context.window.__NETWORK_LOAD.preparationSlices = rows;
  const measured = JSON.parse(JSON.stringify(malformed.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(measured.networkLoad.preparationSlices, expected,
    'preparation extraction visits at most two rows and retains only the two allowed timing stages');
  assert.doesNotMatch(JSON.stringify(measured), /PRIVATE/);
}

{
  const prefetch = browserFixture();
  const raw = prefetch.context.window.__WORLD_PREFETCH;
  const initial = { requested: 1, completed: 0, joined: 0, promoted: 0,
    cancelled: 0, skippedCapacity: 0, lastMs: 0 };
  assert.equal(prefetch.run(readProductionEntryObserver).worldPrefetch.launch, null,
    'an observer installed before launch does not invent a launch snapshot');
  Object.assign(raw, { completed: 1, lastMs: 120 });
  prefetch.run(readProductionEntryObserver, 'launch');
  Object.assign(raw, { requested: 2, completed: 2, joined: 1, promoted: 1, lastMs: 240 });
  prefetch.context.window.__WORLD_LOAD.cached = true;
  const result = JSON.parse(JSON.stringify(prefetch.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(result.worldPrefetch, { start: initial,
    launch: { ...initial, completed: 1, lastMs: 120 },
    end: { ...initial, requested: 2, completed: 2, joined: 1, promoted: 1, lastMs: 240 } },
  'copied pre-launch counters distinguish completed waiting-room work from later promotion');
  assert.equal(result.worldLoad.cached, true, 'world activation retains the independent completed-cache signal');
  raw.completed = 99;
  assert.deepEqual(JSON.parse(JSON.stringify(prefetch.run(readProductionEntryObserver, 'stop'))), result);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
}
{
  const prefetch = browserFixture();
  let reads = 0;
  Object.defineProperty(prefetch.context.window.__WORLD_PREFETCH, 'requested', {
    get() { reads++; return 1; },
  });
  for (let frame = 0; frame < 10; frame++) prefetch.step();
  assert.equal(reads, 0, 'prefetch counters add no per-frame reads');
  prefetch.run(readProductionEntryObserver, 'launch');
  prefetch.run(readProductionEntryObserver, 'stop');
  assert.equal(reads, 2, 'launch and final snapshots read each allowlisted counter once');
}
for (const value of [undefined, null, [], 7, 'PRIVATE_PREFETCH']) {
  const malformed = browserFixture();
  malformed.context.window.__WORLD_PREFETCH = value;
  malformed.run(readProductionEntryObserver, 'launch');
  const result = malformed.run(readProductionEntryObserver, 'stop');
  assert.equal(result.worldPrefetch.launch, null);
  assert.equal(result.worldPrefetch.end, null, 'missing or malformed prefetch records remain unknown');
}
{
  const malformed = browserFixture();
  malformed.context.window.__WORLD_PREFETCH = { requested: NaN, completed: Infinity,
    joined: -1, promoted: 'PRIVATE_COUNTER', cancelled: null, skippedCapacity: 3, lastMs: -10,
    PRIVATE_NUMERIC: 123 };
  const result = JSON.parse(JSON.stringify(malformed.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(result.worldPrefetch.end, { requested: null, completed: null,
    joined: null, promoted: null, cancelled: null, skippedCapacity: 3, lastMs: null });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
}

const worldSliceStages = {
  propsDetail: ['yard-clutter', 'boundary-walls', 'village-well', 'settlement-dressing',
    'military-clutter', 'hay-and-crates', 'roadside-utilities', 'rock-variants', 'tactical-outcrops',
    'surface-rocks', 'embedded-rocks', 'boulder-outcrops', 'rock-instances', 'field-haystacks',
    'field-logs-and-stumps', 'finalize'],
  vegetationDetail: ['grassPrep', 'grassScatter', 'grassCarpet', 'treePrep', 'treeClusters',
    'treeLoneAndBelts', 'treeRimAndMeshes', 'treeRootDecals', 'bushes', 'finalize', 'other'],
};
for (const [family, stages] of Object.entries(worldSliceStages)) {
  for (let offset = 0; offset < stages.length; offset += 8) {
    const detail = browserFixture();
    const rows = stages.slice(offset, offset + 8).map((stage, index) => ({ stage, ms: index }));
    detail.context.window.__WORLD_LOAD.buildDetail[family] = { synchronousMs: 123,
      slowest: rows.map((row) => ({ ...row, specId: 'PRIVATE_PLAYER', url: 'PRIVATE_URL' })) };
    const result = JSON.parse(JSON.stringify(detail.run(readProductionEntryObserver, 'stop')));
    assert.deepEqual(result.worldLoad.buildDetail[family], { synchronousMs: 123, slowest: rows },
      'only source-owned family tags and finite durations survive slow-slice attribution');
    assert.equal(result.worldLoad.buildDetail.terrain.totalMs, 2, 'existing numeric details remain intact');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
}
{
  const detail = browserFixture();
  detail.context.window.__WORLD_LOAD.buildDetail.propsDetail = { slowest: [
    { stage: 'slice-0', ms: 0 }, { stage: 'slice-4', ms: 161 }, { stage: 'slice-4095', ms: 1 },
    { stage: 'slice-4096', ms: 1 }, { stage: 'slice-01', ms: 1 }, { stage: 'slice-PRIVATE', ms: 1 },
    { stage: 'PRIVATE_STAGE', ms: 2 }, { stage: 'grassPrep', ms: 3 },
  ] };
  const result = JSON.parse(JSON.stringify(detail.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(result.worldLoad.buildDetail.propsDetail.slowest, [
    { stage: 'slice', index: 0, ms: 0 }, { stage: 'slice', index: 4, ms: 161 },
    { stage: 'slice', index: 4095, ms: 1 },
  ], 'anonymous props slices retain bounded integer indices, never arbitrary strings or other-family tags');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
}
for (const rows of [undefined, null, 'PRIVATE_ROWS', { stage: 'finalize', ms: 1 },
  [null, 7, 'PRIVATE_ROW', { stage: 'finalize', ms: NaN }, { stage: 'finalize', ms: Infinity },
    { stage: 'finalize', ms: -1 }, { stage: 'finalize', ms: 'PRIVATE_DURATION' }]]) {
  const malformed = browserFixture();
  malformed.context.window.__WORLD_LOAD.status = 'failed';
  malformed.context.window.__WORLD_LOAD.buildDetail.propsDetail = { slowest: rows };
  const result = JSON.parse(JSON.stringify(malformed.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(result.worldLoad.buildDetail.propsDetail.slowest, [],
    'failed builds retain their status without admitting malformed or invalid-duration slices');
  assert.equal(result.worldLoad.status, 'failed');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
}

const background = browserFixture();
background.step({ loaderOn: true, display: 'grid', waiting: true });
for (const second of [5, 4, 3, 2, 1]) background.step({ loaderOn: false, display: 'none',
  waiting: false, numeral: String(second), focused: false, hidden: true });
const backgroundReceipt = background.run(readProductionEntryObserver, 'stop');
assert.deepEqual(Array.from(backgroundReceipt.countdown), [5, 4, 3, 2, 1]);
assert.deepEqual(Array.from(backgroundReceipt.foregroundCountdown), [],
  'DOM numerals in a background page are not evidence of user-visible countdown');

const bounded = browserFixture();
bounded.context.window.__NETWORK_LOAD.stageIntervals = Array.from({ length: 40 }, (_, index) => ({
  stage: 'compile', startTime: index, endTime: index + 1, private: 'PRIVATE_DETAIL',
}));
bounded.context.window.__NETWORK_LOAD.revealSlices = Array.from({ length: 40 }, (_, index) => ({
  stage: 'loaderFade', startTime: index, endTime: index + 1,
}));
bounded.context.window.__TOP_MASK_LOAD.intervals = Array.from({ length: 40 }, (_, index) => ({
  stage: 'hullRender', startTime: index, endTime: index + 1, private: 'PRIVATE_DETAIL',
}));
bounded.context.window.__WORLD_LOAD.buildDetail.propsDetail = {
  slowest: Array.from({ length: 20 }, () => ({ stage: 'finalize', ms: 1 })),
};
for (let index = 0; index < 6020; index++) bounded.step({ waiting: index % 2 === 0 });
bounded.tasks(Array.from({ length: 300 }, () => ({ startTime: 150, duration: 70 })));
const boundedReceipt = bounded.run(readProductionEntryObserver, 'stop');
assert.equal(boundedReceipt.frames.length, 6000);
assert.equal(boundedReceipt.framesDropped, 20);
assert.equal(boundedReceipt.transitions.length, 256);
assert.ok(boundedReceipt.transitionsDropped > 0);
assert.equal(boundedReceipt.longTasks.length, 256);
assert.equal(boundedReceipt.networkLoad.stageIntervals.length, 32);
assert.equal(boundedReceipt.networkLoad.revealSlices.length, 32);
assert.equal(boundedReceipt.topMaskLoad.intervals.length, 16);
assert.equal(boundedReceipt.worldLoad.buildDetail.propsDetail.slowest.length, 8);
assert.doesNotMatch(JSON.stringify(boundedReceipt), /PRIVATE/);
assert.ok(boundedReceipt.longTasksDropped > 0);

const maskStages = ['clone', 'build', 'hullCompile', 'hullRender', 'hullReadback', 'hullCanvas',
  'turretCompile', 'turretRender', 'turretReadback', 'turretCanvas'];
{
  const shadows = browserFixture();
  shadows.context.window.__NETWORK_LOAD.shadowPrime = {
    cascadeCount: 4, totalMs: 21, maxMs: Infinity, name: 'PRIVATE_NAME',
  };
  shadows.context.window.__NETWORK_LOAD.revealSlices = [
    { stage: 'finalShadows', startTime: 2, endTime: 30 },
    { stage: 'PRIVATE_STAGE', startTime: 3, endTime: 4 },
  ];
  const receipt = JSON.parse(JSON.stringify(shadows.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(receipt.networkLoad.shadowPrime, { cascadeCount: 4, totalMs: 21, maxMs: null });
  assert.deepEqual(receipt.networkLoad.revealSlices, [{ stage: 'finalShadows', startTime: 2, endTime: 30 }]);
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
}
{
  const compile = browserFixture();
  const fields = ['targetBindMs', 'submissionMs', 'targetRestoreMs', 'programsBefore', 'programsAfter',
    'maxSubmissionMs', 'submissionSlices', 'extensionMs', 'queryMs', 'maxQueryMs', 'queryCount',
    'existingQueryMs', 'maxExistingQueryMs', 'existingQueryCount', 'newQueryMs', 'maxNewQueryMs', 'newQueryCount',
    'pollMs', 'maxPollMs', 'pollCount', 'yields',
    'uniformMs', 'maxUniformMs', 'uniformCount', 'uniformFailures', 'uniformYields', 'uniformPending', 'uniformReused',
    'openingRenderMs'];
  const row = Object.fromEntries(fields.map((key) => [key, 2]));
  compile.context.window.__NETWORK_LOAD.programCompile = {
    ...row, submissionMs: Infinity, url: 'PRIVATE_URL', name: 'PRIVATE_NAME', detail: { secret: 'PRIVATE' },
  };
  compile.context.window.__NETWORK_LOAD.scarCompile = {
    uniformCount: 3, uniformPending: 0, uniformMs: 4.5, maxUniformMs: Infinity,
    url: 'PRIVATE_URL', detail: { secret: 'PRIVATE' },
  };
  const receipt = JSON.parse(JSON.stringify(compile.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(receipt.networkLoad.programCompile, { ...row, submissionMs: null });
  assert.deepEqual(receipt.networkLoad.scarCompile, {
    ...Object.fromEntries(fields.map((key) => [key, null])),
    uniformCount: 3, uniformPending: 0, uniformMs: 4.5,
  });
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
}
{
  const passes = browserFixture();
  passes.context.window.__NETWORK_LOAD.scarCompile = {
    openingRenderMs: 90,
    openingPasses: [null, { index: -1 }, { index: 16 }, { index: 1.5 },
      { index: 0, renderMs: 80.5, programsBefore: 190, programsAfter: 193,
        label: 'PRIVATE_LABEL', material: 'PRIVATE_MATERIAL' },
      { index: 3, renderMs: -1, programsBefore: Infinity, programsAfter: NaN },
      ...Array.from({ length: 20 }, () => ({ index: 6, renderMs: 0.25,
        programsBefore: 193, programsAfter: 193 }))],
  };
  const receipt = JSON.parse(JSON.stringify(passes.run(readProductionEntryObserver, 'stop')));
  assert.equal(receipt.networkLoad.scarCompile.openingPasses.length, 12,
    'only the first sixteen input rows are inspected, and malformed ordinals are rejected');
  assert.deepEqual(receipt.networkLoad.scarCompile.openingPasses.slice(0, 2), [
    { index: 0, renderMs: 80.5, programsBefore: 190, programsAfter: 193 },
    { index: 3, renderMs: null, programsBefore: null, programsAfter: null },
  ]);
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
}
{
  const watchdog = browserFixture();
  const row = { startTime: 1, endTime: 90, setupMs: 2, renderMs: 30, readbackMs: 55, enqueueMs: 3, waitMs: 52,
    reduceMs: 0.2, restoreMs: 1.8, programsBeforeRender: 12, programsAfterRender: 15 };
  watchdog.context.window.__NETWORK_LOAD.blackCheck.measurements = Array.from({ length: 20 }, () => ({
    ...row, name: 'PRIVATE_NAME', url: 'PRIVATE_URL', error: 'PRIVATE_ERROR' }));
  const receipt = JSON.parse(JSON.stringify(watchdog.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(receipt.networkLoad.blackCheck.measurements, Array.from({ length: 8 }, () => row));
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE/);
  const malformedWatchdog = browserFixture();
  malformedWatchdog.context.window.__NETWORK_LOAD.blackCheck.measurements = [null, { renderMs: Infinity,
    readbackMs: 'PRIVATE_ERROR', endTime: NaN }];
  const malformed = JSON.parse(JSON.stringify(malformedWatchdog.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(malformed.networkLoad.blackCheck.measurements,
    Array.from({ length: 2 }, () => Object.fromEntries(Object.keys(row).map((key) => [key, null]))));

  const detailed = browserFixture();
  const steps = Object.fromEntries(['contextQuery', 'createBuffer', 'bindingQuery', 'bindBuffer',
    'bufferData', 'sizeQuery', 'readPixels', 'fence', 'flush', 'wait', 'copy', 'release'].map((key) => [key, 2]));
  detailed.context.window.__NETWORK_LOAD.blackCheck = { failed: true, measurements: [{ ...row,
    readbackSteps: { ...steps, url: 'PRIVATE_URL', name: 'PRIVATE_NAME', copy: Infinity } }] };
  const measured = JSON.parse(JSON.stringify(detailed.run(readProductionEntryObserver, 'stop')));
  assert.equal(measured.networkLoad.blackCheck.error, true, 'failed graphics receipts remain visible to QA');
  assert.deepEqual(measured.networkLoad.blackCheck.measurements, [{ ...row,
    readbackSteps: { ...steps, copy: null } }]);
  assert.doesNotMatch(JSON.stringify(measured), /PRIVATE/);
}
for (const status of ['complete', 'failed']) {
  const mask = browserFixture();
  const stages = status === 'failed' ? maskStages.slice(0, 4) : maskStages;
  mask.context.window.__TOP_MASK_LOAD = { status, startedAt: 200, endedAt: 220,
    specId: 'PRIVATE_SPEC', rawError: { message: 'PRIVATE_ERROR', url: 'PRIVATE_URL' },
    intervals: stages.map((stage, index) => ({ stage, startTime: 201 + index,
      endTime: 202 + index, detail: 'PRIVATE_DETAIL' })) };
  const result = JSON.parse(JSON.stringify(mask.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(result.topMaskLoad, { status, startedAt: 200, endedAt: 220,
    intervals: stages.map((stage, index) => ({ stage, startTime: 201 + index, endTime: 202 + index })) },
  'complete and failing transactions retain ordered timing-only partial data');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
}

{
  const stages = ['contextQuery', 'createBuffer', 'bindingQuery', 'bindBuffer',
    'bufferData', 'sizeQuery', 'readPixels', 'fence', 'flush', 'wait', 'copy', 'release'];
  const hull = Object.fromEntries(stages.map((stage, index) => [stage, index]));
  const turret = Object.fromEntries(stages.map((stage) => [stage, 0]));
  const mask = browserFixture();
  mask.context.window.__TOP_MASK_LOAD.readbacks = {
    hull: { ...hull, privateNumeric: 100, url: 'PRIVATE_URL', error: new Error('PRIVATE_ERROR') },
    turret: { ...turret, privateNumeric: 200, name: 'PRIVATE_NAME' },
    ...Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`PRIVATE_LAYER_${index}`, hull])),
  };
  const result = JSON.parse(JSON.stringify(mask.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(result.topMaskLoad.readbacks, { hull, turret },
    'readback timing coverage is bounded to two fixed layers and twelve exact numeric stages');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|privateNumeric/);

  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, -1, 'PRIVATE_VALUE', true, {}, [], 1n]) {
    const malformed = browserFixture();
    malformed.context.window.__TOP_MASK_LOAD.readbacks = { hull: { ...hull, copy: invalid } };
    const measured = JSON.parse(JSON.stringify(malformed.run(readProductionEntryObserver, 'stop')));
    assert.deepEqual(measured.topMaskLoad.readbacks, { hull: { ...hull, copy: null }, turret: null },
      'non-finite, negative, and nonnumeric stage values remain unknown; missing layers stay unknown');
    assert.doesNotMatch(JSON.stringify(measured), /PRIVATE/);
  }
  for (const invalid of [undefined, null, 'PRIVATE_RECORD', 42, [], true, () => {}]) {
    const malformed = browserFixture();
    malformed.context.window.__TOP_MASK_LOAD.readbacks = invalid;
    const measured = malformed.run(readProductionEntryObserver, 'stop');
    assert.equal(Object.hasOwn(measured.topMaskLoad, 'readbacks'), false,
      'missing or malformed optional readbacks preserve the legacy receipt shape');
    const live = browserFixture();
    live.context.window.__TOP_MASK_LOAD.readbacks = { hull: invalid, turret: {} };
    const layers = JSON.parse(JSON.stringify(live.run(readProductionEntryObserver, 'stop')));
    assert.deepEqual(layers.topMaskLoad.readbacks, {
      hull: null, turret: Object.fromEntries(stages.map((stage) => [stage, null])),
    }, 'malformed layers are unknown and missing stage values are never invented');
  }
}

for (const value of [undefined, null, 'PRIVATE_TRACE', 42, []]) {
  const malformed = browserFixture();
  malformed.context.window.__TOP_MASK_LOAD = value;
  assert.equal(malformed.run(readProductionEntryObserver, 'stop').topMaskLoad, null,
    'missing and non-record mask traces remain unknown');
}

{
  const panel = browserFixture();
  panel.step({ label: 'Preparing player panel' });
  assert.equal(panel.run(readProductionEntryObserver, 'stop').frames.at(-1).loaderStage,
    'Preparing player panel', 'the covered panel stage has an allowlisted progress label');
}
for (const rows of ['PRIVATE_INTERVALS', { stage: 'build' }, [null, 'PRIVATE_ROW', 7,
  { stage: 'PRIVATE_STAGE', startTime: 1 },
  { stage: 'hullReadback', startTime: NaN, endTime: 'PRIVATE_END' }]]) {
  const malformed = browserFixture();
  malformed.context.window.__TOP_MASK_LOAD = { status: 'PRIVATE_STATUS', startedAt: NaN,
    endedAt: 'PRIVATE_END', intervals: rows };
  const result = JSON.parse(JSON.stringify(malformed.run(readProductionEntryObserver, 'stop')));
  assert.deepEqual(result.topMaskLoad, { status: null, startedAt: null, endedAt: null,
    intervals: Array.isArray(rows) ? [{ stage: 'hullReadback', startTime: null, endTime: null }] : [] });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
}

for (const failure of [null, 'start', 'entry', 'stop']) {
  const calls = [];
  let evidence;
  const problem = new Error(`PRIVATE_${failure}`);
  const pages = ['host', 'guest'].map((role) => ({ async evaluate(fn, action) {
    calls.push(`${role}:${fn.name}:${action || ''}`);
    return { launchAt: 110, bothHiddenAt: failure === 'entry' ? null : 300 };
  } }));
  const running = observeProductionEntry(pages, { origin: 'https://game.example.test', entryProfile: 'guest' },
    async () => { calls.push('entry'); if (failure === 'entry') throw problem; }, {
      async startProfile(page, options) {
        assert.equal(page, pages[1]); assert.deepEqual(options, { origin: 'https://game.example.test' });
        calls.push('profile-start'); if (failure === 'start') throw problem;
        return { async stop() {
          calls.push('profile-stop'); if (failure === 'stop') throw problem;
          return { baselinePageTimeMs: 100, startBeforePageTimeMs: 99, startAfterPageTimeMs: 101,
            profileDurationMs: 250, diagnosticOverhead: true };
        } };
      },
      afterReveal: async () => { calls.push('countdown'); },
      onEvidence: (value) => { evidence = value; },
    });
  if (failure) await assert.rejects(running, (error) => error === problem);
  else await running;
  assert.equal(evidence.peers.length, 2, 'both peer receipts survive failed profile or entry work');
  assert.equal(evidence.diagnosticOverhead, true);
  assert.equal(calls.filter((name) => name === 'profile-stop').length, Number(failure !== 'start'));
  assert.equal(calls.filter((name) => name.endsWith(':stop')).length, 2);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE/);
  if (!failure) {
    assert.equal(evidence.sourceProfile.entryFullyCovered, true);
    assert.ok(calls.indexOf('profile-stop') < calls.indexOf('countdown'),
      'profile stops at both hidden loaders, before optional countdown recording');
  }
}

let partial;
await observeProductionEntry([{ evaluate: async () => ({ launchAt: 100, bothHiddenAt: 30000 }) },
  { evaluate: async () => null }], { entryProfile: 'host', origin: 'https://game.example.test' }, async () => {}, {
  startProfile: async () => ({ stop: async () => ({ baselinePageTimeMs: 50,
    startBeforePageTimeMs: 49, startAfterPageTimeMs: 51, profileDurationMs: 25000, stopReason: 'deadline' }) }),
  onEvidence: (value) => { partial = value; },
});
assert.equal(partial.sourceProfile.entryFullyCovered, false,
  'a bounded profile must not claim complete coverage of a longer entry');
assert.equal(partial.peers[1].observation, null, 'unavailable pages retain an explicit unknown receipt');

for (const failing of [false, true]) {
  let timings;
  let countdowns = 0;
  const pages = [0, 1].map(() => ({ evaluate: async () => ({ launchAt: 10, bothHiddenAt: failing ? null : 20 }) }));
  const run = observeProductionEntry(pages, { entryProfile: 'timings' }, async () => {
    if (failing) throw Object.assign(new Error('PRIVATE timeout'), { name: 'ProtocolError' });
  }, {
    startProfile: () => { assert.fail('timings-only capture must never create a CPU profiler session'); },
    afterReveal: async () => { countdowns++; }, onEvidence: (value) => { timings = value; },
  });
  if (failing) await assert.rejects(run, /PRIVATE timeout/); else await run;
  assert.equal(timings.selectedRole, null);
  assert.equal(timings.sourceProfile, null);
  assert.equal(timings.profileFailure, null);
  assert.equal(timings.profileDiagnostics, null);
  assert.equal(timings.peers.length, 2);
  assert.equal(countdowns, failing ? 0 : 1);
  assert.doesNotMatch(JSON.stringify(timings), /entryFullyCovered|PRIVATE/);
}

let unreadableEvidence;
const unreadable = Object.assign(new Error('PRIVATE protocol closed'), { name: 'TargetCloseError' });
await assert.rejects(observeProductionEntry([{ evaluate: async () => { throw unreadable; } },
  { evaluate: async () => ({ launchAt: null, bothHiddenAt: null }) }], { entryProfile: 'timings' },
async () => { assert.fail('entry cannot start if its observer could not be installed'); }, {
  readContext: () => null, onEvidence: (value) => { unreadableEvidence = value; },
}), (error) => error === unreadable);
assert.equal(unreadableEvidence.peers[0].observationFailure, 'target-closed');
assert.equal(unreadableEvidence.peers[0].renderingContextFailure, 'target-closed');
assert.equal(unreadableEvidence.peers[1].observationFailure, null);
assert.doesNotMatch(JSON.stringify(unreadableEvidence), /PRIVATE/);

console.log('production entry observer: bounded DOM/RAF/tasks, profile boundary and failure receipts passed');
