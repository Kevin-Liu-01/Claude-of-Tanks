import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Execute the actual public scheduling wrapper with an owned generator fixture.
// Geometry/output equivalence is separately checked by the whole-world profile;
// this test isolates awaited failure and IteratorClose propagation.
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function createPropsAsync(');
const end = source.indexOf('\nfunction* propsBuildSteps(', start);
assert.ok(start >= 0 && end > start);
const wrapper = stripTypeScriptTypes(source.slice(start, end)).replace('export ', '');
function fixture(steps, acquire = async () => {}, close = () => {}) {
  const events = [], runtime = {}, args = [];
  const nested = (function* () {
    try {
      for (const step of steps) { events.push(['work', step]); yield step; }
      events.push(['complete']);
      return runtime;
    } finally { events.push(['closed']); close(); }
  })();
  function* build(...values) {
    args.push(values);
    return yield* nested;
  }
  const run = new Function('propsBuildSteps', 'ensureTankBuilder',
    wrapper + '\nreturn createPropsAsync;')(build, acquire);
  return { run, events, runtime, args };
}

{
  const f = fixture([{ fine: true, stage: 'first' }, undefined, { fine: true, stage: 'last' }]);
  const ticks = [], height = {}, engine = {}, config = {}, vegetation = {};
  const result = await f.run(height, engine, 82, config,
    (done, total) => ticks.push([done, total]), true, vegetation);
  assert.equal(result, f.runtime);
  assert.deepEqual(f.args, [[height, engine, 82, config, vegetation]]);
  assert.deepEqual(ticks, [[1, 180], [2, 180], [3, 180]]);
  assert.equal(result._buildDetail.sliceCount, 4);
  assert.equal(f.events.filter(([event]) => event === 'closed').length, 1);
  assert.equal(f.events.at(-2)[0], 'complete');
}
{
  const f = fixture([{ fine: true }, undefined, { stage: 'coarse' }]);
  const ticks = [];
  await f.run({}, {}, 2002, null, (done, total) => ticks.push([done, total]), false);
  assert.deepEqual(ticks, [[1, 9], [2, 9]], 'legacy coarse callers keep their paint cadence');
}
{
  const f = fixture([{ fine: true, tankBuilder: 't90m' },
    ...Array.from({ length: 300 }, () => ({ fine: true, progress: false, stage: 'vertex-batch' })),
    { fine: true, stage: 'placed' }]);
  const ticks = [];
  const runtime = await f.run({}, {}, 2002, null, done => ticks.push(done), true);
  assert.equal(ticks.length, 302, 'every internal batch still reaches the task/paint scheduler');
  assert.deepEqual(ticks.slice(0, -1), Array(301).fill(1));
  assert.equal(ticks.at(-1), 2, 'micro-batches cannot prematurely fill the structure loading bar');
  assert.equal(runtime._buildDetail.sliceCount, 303, 'timing records every actual batch');
}
for (const failureStage of ['tick', 'builder']) {
  const failure = new Error('original ' + failureStage + ' rejection');
  const f = fixture([{ fine: true, tankBuilder: 't90m' }, { fine: true }],
    async () => { if (failureStage === 'builder') throw failure; });
  await assert.rejects(f.run({}, {}, 2002, null, async () => { throw failure; }, true),
    error => error === failure);
  assert.deepEqual(f.events.map(([event]) => event), ['work', 'closed'],
    'awaited rejection reaches the delegated producer finally, without another construction step');
  assert.equal(f.runtime._buildDetail, undefined, 'partial runtime is never published');
}
{
  const failure = new Error('original tick failure');
  const f = fixture([{ stage: 'owned' }], async () => {}, () => { throw new Error('disposer failed'); });
  await assert.rejects(f.run({}, {}, 2002, null, async () => { throw failure; }, true),
    error => error === failure, 'IteratorClose cannot mask the original failure');
}
{
  const helperStart = source.indexOf('      function disposeWreckBakeCache()');
  const helperEnd = source.indexOf('\n      try {\n        yield* placeAuthoredWrecks();', helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  const helpers = stripTypeScriptTypes(source.slice(helperStart, helperEnd));
  const seen = [];
  const geometry = name => ({ dispose() { seen.push(name); if (name === 'failed') throw new Error(name); } });
  const cache = new Map([['first', { geo: geometry('failed'), shadowGeo: geometry('shadow') }],
    ['empty', null], ['last', { geo: geometry('last') }]]);
  const drain = new Function('bakeCache', helpers + '\nreturn { cache: disposeWreckBakeCache, placed: disposePlacedWreckGeometries };')(cache);
  drain.cache(); drain.cache();
  assert.equal(cache.size, 0);
  assert.deepEqual(seen, ['failed', 'shadow', 'last'], 'failed disposal cannot strand the remaining cache');
  seen.length = 0;
  const placed = [geometry('last'), geometry('failed')];
  drain.placed(placed); drain.placed(placed);
  assert.equal(placed.length, 0);
  assert.deepEqual(seen, ['failed', 'last'], 'ownership removed before each disposer; never double-dispose');
}
{
  let release, entered;
  const boundary = new Promise(resolve => { release = resolve; });
  const paused = new Promise(resolve => { entered = resolve; });
  const failure = new Error('abandoned loading ownership');
  const f = fixture([{ stage: 'owned-wreck' }, { stage: 'must-not-start' }]);
  const pending = f.run({}, {}, 2002, null, async () => {
    entered(); await boundary; throw failure;
  }, true);
  const rejected = assert.rejects(pending, error => error === failure);
  await paused;
  assert.deepEqual(f.events.map(([event]) => event), ['work']);
  release(); await rejected;
  assert.deepEqual(f.events.map(([event]) => event), ['work', 'closed']);
}

// Each checkpoint follows completed work, before the next expensive owner;
// no geometry formula, RNG draw or source-acquisition order is rewritten.
for (const [operation, stage, next] of [
  ['yield* placeTankWrecks();', 'wrecks-finalized', 'function beginWaterworksRubbleCapture'],
  ['placeCentralMonument();', 'street-details', 'function placeGroundBlendDecals'],
  ['placeGroundBlendDecals();', 'ground-decals', 'let poleIM:'],
  ['  dressMapExtras({', 'map-extras', 'function composeAuthoredLoggingYard'],
]) {
  const op = source.indexOf(operation), checkpoint = source.indexOf("stage: '" + stage + "'", op);
  assert.ok(op > 0 && checkpoint > op && checkpoint < source.indexOf(next, op), stage);
}
assert.match(source, /const baked = yield\* bakeTankWreckSteps/);
assert.match(source, /const baked = yield\* bakeFor\(specId, pop\)/);
assert.match(source, /finally \{[\s\S]*disposeWreckBakeCache\(\);/);
console.log('propsScheduling.selftest: real wrapper cadence, delegated cleanup and completed-work boundaries pass');
