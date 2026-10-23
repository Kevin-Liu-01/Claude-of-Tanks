// The migration store ranks retained blobs by the host generation this client followed, never by the sender's
// plaintext chunk tick (security audit 2026-10-22): an earlier host that stamped a huge tick on its last keyframe
// could otherwise pin its state over every later host's, and a fresh-booted host (tick 0) was always outranked.
import assert from 'node:assert/strict';
import { MIGRATION_EVENT_KIND, MigrationStore } from './migrationStore.ts';

const chunk = (id, tick, bytes = [id]) => ({
  kind: MIGRATION_EVENT_KIND.KEYFRAME,
  payload: { id, tick, part: 0, parts: 1, data: Buffer.from(Uint8Array.from(bytes)).toString('base64url') },
});

{
  const store = new MigrationStore();
  store.setGeneration(1);
  store.receive(chunk(1, Number.MAX_SAFE_INTEGER), 10);
  assert.equal(store.keyframe.id, 1);
  store.receive(chunk(2, 540), 20); // same generation, lower tick: the newer-tick rule holds within a generation
  assert.equal(store.keyframe.id, 1, 'within one generation the higher tick stays');
  store.setGeneration(2);
  store.receive(chunk(3, 540), 30);
  assert.equal(store.keyframe.id, 3, 'a newer generation outranks an older one whatever tick the older claimed');
  assert.equal(store.keyframe.generation, 2);
  store.setGeneration(1); // generations only move forward: the next blob is still tagged generation 2
  store.receive(chunk(4, 9000), 40);
  assert.equal(store.keyframe.id, 4, 'a stale setGeneration is ignored (same generation, higher tick)');
  assert.equal(store.keyframe.generation, 2);
  store.setGeneration(3);
  store.receive(chunk(5, 0), 50); // a fresh-booted host at tick 0
  assert.equal(store.keyframe.id, 5, 'a fresh boot in a newer generation replaces the older state');
}
{
  const store = new MigrationStore();
  store.receive(chunk(1, -1), 0);
  store.receive(chunk(2, 2 ** 60), 0);
  assert.equal(store.keyframe, null, 'negative or unsafe ticks are refused');
  assert.equal(store.stats().rejected, 2);
  store.receive(chunk(3, 100), 0);
  store.clear();
  assert.equal(store.keyframe, null);
  store.receive(chunk(4, 1), 0);
  assert.equal(store.keyframe.generation, 0, 'clear() starts a new match at generation 0');
}
console.log('migrationStore.selftest: ok');
