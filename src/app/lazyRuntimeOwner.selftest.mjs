import assert from 'node:assert/strict';
import { createLazyRuntimeOwner } from './lazyRuntimeOwner.ts';

let loads = 0;
let creates = 0;
const owner = createLazyRuntimeOwner(
  async () => { loads += 1; return { value: 7 }; },
  (module) => { creates += 1; return { value: module.value }; },
);
assert.equal(owner.current, null);
const [first, second] = await Promise.all([owner.preload(), owner.preload()]);
assert.equal(first, second, 'concurrent requests share one runtime');
assert.equal(owner.current, first);
assert.equal(loads, 1);
assert.equal(creates, 1);
assert.equal(await owner.preload(), first, 'resolved runtime is reused');

let attempts = 0;
const retrying = createLazyRuntimeOwner(
  async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('expected first failure');
    return { ready: true };
  },
  (module) => module,
);
await assert.rejects(retrying.preload(), /expected first failure/);
assert.equal(retrying.current, null);
assert.deepEqual(await retrying.preload(), { ready: true });
assert.equal(attempts, 2, 'a rejected load does not poison the owner');

assert.throws(
  () => createLazyRuntimeOwner(null, () => ({})),
  /loader and factory/,
);

// (2026-11-02 audit R6, round 2 U35) the owner is one app/lazyChunk.ts chunk: the nine facades built on it (and the
// hand-written facades moved onto it) follow the one lazy-chunk policy. It asked a failed chunk again at once on every
// call, with no backoff: a caller that asks often (an intent preload per pointer move, a covered entry's retry) asked the
// network each time. Now: at once after one failure, then past the policy's backoff, the kept failure in between.
{
  let clock = 0;
  let asks = 0;
  let down = true;
  const owner = createLazyRuntimeOwner(
    async () => { asks += 1; if (down) throw new TypeError('Failed to fetch dynamically imported module: ./battleWarmRuntime.ts'); return { warm: true }; },
    (module) => module,
    { now: () => clock },
  );
  await assert.rejects(owner.preload(), /dynamically imported module/);
  await assert.rejects(owner.preload(), /dynamically imported module/);
  assert.equal(asks, 2, 'after one failure the next preload asks again at once');
  for (let i = 0; i < 20; i++) { clock += 50; await assert.rejects(owner.preload(), /dynamically imported module/); }
  assert.equal(asks, 2, `inside the 2 s backoff a preload gets the kept failure and asks nothing (${asks} asks)`);
  assert.equal(owner.state, 'failed');
  down = false;
  clock = 2_000;
  assert.deepEqual(await owner.preload(), { warm: true }, 'past it the next preload asks and loads');
  assert.equal(asks, 3);
  assert.equal(owner.state, 'ready');

  // (round 4 F2) a lifecycle edge (a battle's covered entry) asks a failed runtime again now, whatever the backoff;
  // `failures` tells a re-ask from a first ask
  down = true;
  let edgeAsks = 0;
  const edge = createLazyRuntimeOwner(
    async () => { edgeAsks += 1; if (down) throw new TypeError('Failed to fetch dynamically imported module: ./battleAtmosphereRuntime.ts'); return { lit: true }; },
    (module) => module,
    { now: () => clock },
  );
  await assert.rejects(edge.preload(), /dynamically imported module/);
  await assert.rejects(edge.preload(), /dynamically imported module/);
  assert.equal(edge.failures, 2);
  clock += 500;
  await assert.rejects(edge.preload());
  assert.equal(edgeAsks, 2, 'a plain preload inside the backoff asks nothing');
  down = false;
  assert.deepEqual(await edge.preload({ backoff: false }), { lit: true }, 'an edge asks inside the backoff and loads');
  assert.equal(edgeAsks, 3);
  assert.equal(edge.failures, 0);

  // a factory that returns no runtime fails the load like its chunk
  const empty = createLazyRuntimeOwner(async () => ({}), () => null, { now: () => clock });
  await assert.rejects(empty.preload(), /returned no runtime/);
  assert.equal(empty.current, null);

  // an opener's failure is terminal: its trigger's next press reloads (components/loadFailure.ts)
  let openerAsks = 0;
  const opener = createLazyRuntimeOwner(async () => { openerAsks += 1; throw new TypeError('Failed to fetch dynamically imported module'); },
    (module) => module, { opener: true, now: () => clock });
  await assert.rejects(opener.preload());
  clock += 120_000;
  await assert.rejects(opener.preload());
  assert.equal(openerAsks, 1, 'an opener is asked once');

  // an async factory (the Garage dressing prepares its fleet first) settles before the runtime is current
  const prepared = createLazyRuntimeOwner(async () => ({ id: 7 }), async (module) => { await Promise.resolve(); return { built: module.id }; });
  const shared = prepared.preload();
  assert.equal(prepared.preload(), shared, 'one promise while it loads');
  assert.deepEqual(await shared, { built: 7 });
  assert.deepEqual(prepared.current, { built: 7 });
}

console.log('lazyRuntimeOwner.selftest: coalescing, reuse, retry under the one lazy-chunk policy (backoff, opener, factory) passed');
