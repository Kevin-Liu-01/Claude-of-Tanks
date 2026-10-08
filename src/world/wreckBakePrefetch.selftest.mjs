// Receipt for the wreck bake prefetch (src/world/wreckBakePrefetch.ts, the time-to-battle lane): the planned bakes start
// at once, in plan order and one at a time; the props build takes each planned bake once and bakes anything else on
// demand; a failed planned bake surfaces where it is taken; disposal releases every bake nobody took and the worker.
import assert from 'node:assert/strict';
import { startWreckBakePrefetch, wreckBakeKey } from './wreckBakePrefetch.ts';

function fakeClient() {
  const log = [], gates = [];
  let disposed = false, busy = false;
  const client = {
    prepare() { log.push('prepare'); },
    bake(specId, options) {
      assert.equal(busy, false, 'one bake at a time');
      busy = true;
      log.push(`bake ${specId} ${options.seed} ${options.pop ? 1 : 0}`);
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
  const p = startWreckBakePrefetch([['m60a2', 2002, 1], ['merkava4b', 2133, 1], ['m60a2', 2002, 1], ['t72b3m', 2264, 0]], () => f.client, () => 0);
  await tick();
  assert.deepEqual(f.log, ['prepare', 'bake m60a2 2002 1'], 'the first planned bake starts at once; the next waits for it');
  assert.equal(p.stats.planned, 3, 'a repeated row is one bake');
  const first = p.take('m60a2', { seed: 2002, pop: true });
  assert.ok(first, 'a planned bake is taken');
  assert.equal(p.take('m60a2', { seed: 2002, pop: true }), null, 'and only once');
  assert.equal(p.take('m1a2', { seed: 9, pop: false }), null, 'a request the plan does not hold bakes on demand');
  f.gates[0].ok();
  assert.equal((await first).specId, 'm60a2');
  await tick();
  assert.equal(f.log.at(-1), 'bake merkava4b 2133 1', 'plan order');
  f.gates[1].fail();
  await tick(); await tick();
  assert.equal(f.log.at(-1), 'bake t72b3m 2264 0', 'a failed bake does not stop the rest');
  await assert.rejects(p.take('merkava4b', { seed: 2133, pop: true }), /failed/, 'a failed planned bake surfaces where it is taken');
  f.gates[2].ok();
  await tick();
  // the last one is never taken: disposal releases its geometry and the worker
  p.dispose();
  await tick(); await tick();
  assert.ok(f.isDisposed());
  assert.deepEqual([p.stats.taken, p.stats.missed, p.stats.failed, p.stats.settled], [2, 2, 1, 3]);
}
{
  // disposed before the queue drains: the waiting bakes never start
  const f = fakeClient();
  const p = startWreckBakePrefetch([['a', 1, 0], ['b', 2, 0]], () => f.client, () => 0);
  await tick();
  p.dispose();
  f.gates[0].ok();
  await tick(); await tick();
  assert.deepEqual(f.log.filter((l) => l.startsWith('bake')), ['bake a 1 0'], 'nothing starts after disposal');
}
assert.equal(wreckBakeKey('m1a2', 2002, true), wreckBakeKey('m1a2', 2002, 1));
assert.notEqual(wreckBakeKey('m1a2', 2002, true), wreckBakeKey('m1a2', 2002, false));
console.log('wreckBakePrefetch: planned bakes at once in plan order, one at a time, taken once, misses on demand, failures where taken, disposal releases PASS');
