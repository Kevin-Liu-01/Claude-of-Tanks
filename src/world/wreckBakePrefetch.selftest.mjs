// Receipt for the wreck bake prefetch (src/world/wreckBakePrefetch.ts, the time-to-battle lane): the planned bakes start
// at once, in plan order and one at a time; the props build takes each planned bake once and bakes anything else on
// demand; a failed planned bake surfaces where it is taken and stops the rest of the plan (the wreck-worker lane,
// 2026-10-09: the props build bakes what the plan could not deliver on the main thread, props.ts); disposal releases
// every bake nobody took and the worker.
import assert from 'node:assert/strict';
import { resolveWreckBakeRows, startWreckBakePrefetch, wreckBakeKey } from './wreckBakePrefetch.ts';
import { WRECK_BAKE_PLAN, WRECK_BAKE_PLAN_VARIANTS } from './maps/wreckBakePlan.ts';
import { MAP_IDS } from './maps/mapIds.ts';
import { WRECK_PLAN_VARIANTS, planTables, resolvePlanRows } from '../../tools/wreck-bake-plan.mjs';

function fakeClient() {
  const log = [], gates = [];
  let disposed = false, busy = false;
  const client = {
    prepare() { log.push('prepare'); },
    bake(specId, options) {
      assert.equal(busy, false, 'one bake at a time');
      busy = true;
      log.push(`bake ${specId} ${options.seed} ${options.state}`);
      return new Promise((resolve, reject) => {
        gates.push({
          ok: () => { busy = false; resolve({ specId, options, geo: { disposed: 0, dispose() { this.disposed++; } }, shadowGeo: null }); },
          fail: () => { busy = false; reject(new Error(`bake ${specId} failed`)); },
        });
      });
    },
    dispose() { disposed = true; log.push('dispose'); },
  };
  return { client, log, gates, isDisposed: () => disposed };
}
const tick = () => new Promise((r) => setImmediate(r));

{
  const f = fakeClient();
  const p = startWreckBakePrefetch([['m60a2', 2002, 'turret_blown_off'], ['merkava4b', 2133, 'turret_blown_off'], ['m60a2', 2002, 'turret_blown_off'], ['t72b3m_2022', 2264, 'burnt_out']], () => f.client, () => 0);
  await tick();
  assert.deepEqual(f.log, ['prepare', 'bake m60a2 2002 turret_blown_off'], 'the first planned bake starts at once; the next waits for it');
  assert.equal(p.stats.planned, 3, 'a repeated row is one bake');
  const first = p.take('m60a2', { seed: 2002, state: 'turret_blown_off' });
  assert.ok(first, 'a planned bake is taken');
  assert.equal(p.take('m60a2', { seed: 2002, state: 'turret_blown_off' }), null, 'and only once');
  assert.equal(p.take('m1a1_abrams_hc', { seed: 9, state: 'burnt_out' }), null, 'a request the plan does not hold bakes on demand');
  f.gates[0].ok();
  assert.equal((await first).specId, 'm60a2');
  await tick();
  assert.equal(f.log.at(-1), 'bake merkava4b 2133 turret_blown_off', 'plan order');
  f.gates[1].fail();
  await tick(); await tick();
  // (the wreck-worker lane, 2026-10-09) a worker that failed once would cost every later planned bake its own timeout
  // while the props build waits on it: the rest of the plan is not started and fails where it is taken
  assert.equal(f.log.at(-1), 'bake merkava4b 2133 turret_blown_off', 'a failed bake stops the rest: no further worker job starts');
  await assert.rejects(p.take('merkava4b', { seed: 2133, state: 'turret_blown_off' }), /failed/, 'a failed planned bake surfaces where it is taken');
  await assert.rejects(p.take('t72b3m_2022', { seed: 2264, state: 'burnt_out' }), /stopped after a failed bake/,
    'the rest of the plan fails at once where it is taken');
  p.dispose();
  await tick(); await tick();
  assert.ok(f.isDisposed());
  assert.equal(f.gates.length, 2, 'two worker jobs in all');
  assert.deepEqual([p.stats.taken, p.stats.missed, p.stats.failed, p.stats.settled], [3, 2, 2, 3]);
}
{
  // a planned bake nobody took: disposal releases its geometry and the worker
  const f = fakeClient();
  const p = startWreckBakePrefetch([['m60a2', 2002, 'turret_blown_off']], () => f.client, () => 0);
  await tick();
  f.gates[0].ok();
  await tick();
  p.dispose();
  await tick(); await tick();
  assert.ok(f.isDisposed());
  assert.deepEqual([p.stats.taken, p.stats.failed, p.stats.settled], [0, 0, 1]);
}
{
  // disposed before the queue drains: the waiting bakes never start
  const f = fakeClient();
  const p = startWreckBakePrefetch([['a', 1, 'burnt_out'], ['b', 2, 'burnt_out']], () => f.client, () => 0);
  await tick();
  p.dispose();
  f.gates[0].ok();
  await tick(); await tick();
  assert.deepEqual(f.log.filter((l) => l.startsWith('bake')), ['bake a 1 burnt_out'], 'nothing starts after disposal');
}
{
  // the plan by tier and terrain (2026-10-08): a variant's own rows where the plan keeps them, else its fallback — the
  // assault phone to the phone, the phone and the assault terrain to the desktop rows; the tool keeps a variant only
  // where it differs from that fallback, so its tables and the runtime's resolution give back every recorded key
  const desktop = [['a', 2002, 'turret_blown_off'], ['b', 2133, 'burnt_out'], ['c', 2264, 'turret_blown_off']], phone = [['a', 2002, 'turret_blown_off'], ['b', 2133, 'burnt_out']];
  const trench = [['a', 2002, 'turret_blown_off'], ['d', 2133, 'turret_blown_off']];
  const recorded = {
    flat: { desktop, mobile: desktop, assault: desktop, 'assault-mobile': desktop },
    small: { desktop, mobile: phone, assault: desktop, 'assault-mobile': phone },
    dug: { desktop, mobile: phone, assault: trench, 'assault-mobile': [['a', 2002, 'turret_blown_off']] },
  };
  const tables = planTables(recorded);
  assert.deepEqual(Object.keys(tables.variants).sort(), ['dug@assault', 'dug@assault-mobile', 'dug@mobile', 'small@mobile'],
    'a variant equal to its fallback is not kept');
  for (const [mapId, keys] of Object.entries(recorded)) {
    for (const variant of WRECK_PLAN_VARIANTS) {
      const runtime = resolveWreckBakeRows(tables, mapId, { mobile: variant.endsWith('mobile'), assault: variant.startsWith('assault') });
      assert.deepEqual(runtime, keys[variant], `${mapId}@${variant}: the runtime resolves the recorded rows`);
      assert.deepEqual(resolvePlanRows(tables, mapId, variant), runtime, `${mapId}@${variant}: the tool resolves as the runtime does`);
    }
  }
  assert.equal(resolveWreckBakeRows(tables, 'nowhere', { mobile: true, assault: true }), null);
  // the committed plan: every canonical map planned, its variants named for planned maps only
  assert.deepEqual(Object.keys(WRECK_BAKE_PLAN).sort(), [...MAP_IDS].sort(), 'every canonical map has desktop rows');
  for (const key of Object.keys(WRECK_BAKE_PLAN_VARIANTS)) {
    const [mapId, variant] = key.split('@');
    assert.ok(MAP_IDS.includes(mapId) && ['mobile', 'assault', 'assault-mobile'].includes(variant), `${key} names a map and a variant`);
  }
}
// (wrecks-270) one bake per donor, seed and damage state: two states of one donor and seed are two bakes
assert.equal(wreckBakeKey('m1a1_abrams_hc', 2002, 'overturned'), 'm1a1_abrams_hc|2002|overturned');
assert.notEqual(wreckBakeKey('m1a1_abrams_hc', 2002, 'turret_blown_off'), wreckBakeKey('m1a1_abrams_hc', 2002, 'burnt_out'));
console.log('wreckBakePrefetch: planned bakes at once in plan order, one at a time, taken once, misses on demand, failures where taken and stopping the rest, disposal releases; the plan by tier and terrain resolves every recorded key PASS');
