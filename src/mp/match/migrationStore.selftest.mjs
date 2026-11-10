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
// a host that restarted the battle (round 2 U1, review round 2): abandonBattle drops everything retained before the
// current link (the keyframe and the world the next host merges into it) and keeps the configuration and what the
// current link brought; within a generation, a later link's blob outranks an earlier link's higher tick
{
  const config = (id, tick) => ({ kind: MIGRATION_EVENT_KIND.CONFIG, payload: { id, tick, part: 0, parts: 1, data: Buffer.from([id]).toString('base64url') } });
  const store = new MigrationStore();
  store.beginLink();
  store.receive(config(1, 100), 0);
  store.receive(chunk(5, 1900), 0);
  store.retainFallen(7);
  store.retainDestruction({ kind: 'stage', structureId: 3, stage: 'damaged' });
  store.retainRespawn('p1', 1850);
  store.receive({ kind: MIGRATION_EVENT_KIND.KEYFRAME, payload: { id: 1, tick: 1950, part: 0, parts: 2, data: Buffer.from([9]).toString('base64url') } }, 0);
  store.beginLink();
  // the restarted host's first keyframe: id 1 again (its own sequence), part 1 of 2 at its own lower tick
  store.receive({ kind: MIGRATION_EVENT_KIND.KEYFRAME, payload: { id: 1, tick: 320, part: 1, parts: 2, data: Buffer.from([8]).toString('base64url') } }, 0);
  assert.equal(store.keyframe.id, 5, 'a blob never spans two links: the old link\'s part 0 does not complete the new link\'s id 1');
  store.retainFallen(9);
  store.retainRespawn('p2', 330);
  store.abandonBattle();
  assert.equal(store.keyframe, null, 'the abandoned battle\'s keyframe goes');
  assert.equal(store.config?.id, 1, 'the configuration is the match\'s: it stays');
  assert.deepEqual(store.fallen, [9], 'only the current link\'s fall stays');
  assert.deepEqual(store.destruction, [], 'the abandoned battle\'s destruction goes');
  assert.deepEqual(store.respawns, [['p2', 330]], 'only the current link\'s revive stays');
  store.receive({ kind: MIGRATION_EVENT_KIND.KEYFRAME, payload: { id: 1, tick: 320, part: 0, parts: 2, data: Buffer.from([7]).toString('base64url') } }, 0);
  assert.equal(store.keyframe?.tick, 320, 'the restarted host\'s keyframe completes on its own link');
  const ranked = new MigrationStore();
  ranked.beginLink();
  ranked.receive(chunk(4, 1900), 0);
  ranked.beginLink();
  ranked.receive(chunk(1, 320), 0);
  assert.equal(ranked.keyframe.id, 1, 'within a generation, a later link\'s keyframe outranks an earlier link\'s higher tick');
  ranked.receive(chunk(2, 300), 0);
  assert.equal(ranked.keyframe.id, 1, 'on one link the higher tick still stays');
  ranked.clear();
  assert.deepEqual([ranked.keyframe, ranked.fallen, ranked.destruction, ranked.respawns], [null, [], [], []], 'clear() drops the world logs too');
}
console.log('migrationStore.selftest: ok');
