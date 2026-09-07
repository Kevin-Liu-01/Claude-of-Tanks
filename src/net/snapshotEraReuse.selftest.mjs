import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SnapshotBuffer, SNAPSHOT_FLAGS, captureWorldSnapshot } from './snapshot.ts';
import { createEnvelope, MESSAGE_TYPES } from './protocol.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';

function frame(tick, count = 14, spent = null) {
  const entities = [];
  for (let i = 0; i < count; i++) entities.push({
    id: `player-${i}`, specId: 'm1a2', team: i < 7 ? 'alpha' : 'bravo',
    state: { pos: { x: i * 20, y: 2, z: tick / 30 }, speed: 2, yaw: 0,
      verticalSpeed: 0, grounded: true },
    combat: { hp: 2000, maxHp: 2000, eraSpent: spent },
  });
  return captureWorldSnapshot({ tick, serverTimeMs: tick * 1000 / 60,
    entities, meta: { phase: 'playing' }, ackInputSeq: null });
}

function createBuffer() {
  return new SnapshotBuffer({ interpolationDelayMs: 0, adaptiveDelay: false,
    immediateEntityId: 'player-0' });
}

function assertEmptyLists(sample, empty) {
  for (const entity of sample.entities) assert.strictEqual(entity.eraSpent, empty);
  assert.strictEqual(sample.immediateAuthority.entity.eraSpent, empty);
  assert.deepEqual(empty, []);
}

test('14-entity interpolation and immediate authority share one frozen absent-ERA list', () => {
  const buffer = createBuffer();
  let reads = 0;
  for (const snapshot of [frame(0), frame(3)]) {
    for (const entity of snapshot.entities) Object.defineProperty(entity, 'eraSpent', {
      get() { reads++; return undefined; },
    });
    buffer.push(snapshot);
  }
  const sample = buffer.sample(25);
  assert.equal(reads, 14 * 3 + 2,
    'exercise both interpolation endpoint decodes, output decode, and immediate owned decodes');
  const empty = sample.entities[0].eraSpent;
  assert.ok(Object.isFrozen(empty));
  assertEmptyLists(sample, empty);
  assertEmptyLists(buffer.sample(30), empty);
  const independent = createBuffer();
  independent.push(frame(0));
  assertEmptyLists(independent.sample(0), empty);
});

test('supplied empty and populated ERA arrays retain their existing reference semantics', () => {
  const buffer = createBuffer();
  const snapshot = frame(0, 3);
  const suppliedEmpty = [];
  const suppliedSpent = ['turret-left', 'hull-front'];
  snapshot.entities[0].eraSpent = suppliedEmpty;
  snapshot.entities[1].eraSpent = suppliedSpent;
  buffer.push(snapshot);
  const sample = buffer.sample(0);
  assert.strictEqual(sample.entities[0].eraSpent, suppliedEmpty);
  assert.strictEqual(sample.immediateAuthority.entity.eraSpent, suppliedEmpty);
  assert.strictEqual(sample.entities[1].eraSpent, suppliedSpent);
  assert.equal(Object.isFrozen(suppliedEmpty), false);
  assert.equal(Object.isFrozen(suppliedSpent), false);
  assert.deepEqual(suppliedSpent, ['turret-left', 'hull-front']);
});

test('changed depletion and then absent ERA replace reused output without stale plates', () => {
  const buffer = createBuffer();
  const first = frame(0, 2, new Set(['hull-front']));
  const changed = frame(3, 2, new Set(['hull-front', 'turret-left']));
  buffer.push(first);
  buffer.push(changed);
  const sample = buffer.sample(25);
  assert.strictEqual(sample.entities[1].eraSpent, changed.entities[1].eraSpent);
  assert.strictEqual(sample.immediateAuthority.entity.eraSpent, changed.entities[0].eraSpent);
  const explicit = frame(6, 2);
  explicit.entities[0].eraSpent = [];
  explicit.entities[1].eraSpent = [];
  buffer.push(explicit);
  const restored = buffer.sample(100);
  assert.strictEqual(restored.entities[1].eraSpent, explicit.entities[1].eraSpent);
  assert.strictEqual(restored.immediateAuthority.entity.eraSpent, explicit.entities[0].eraSpent);
  const absent = frame(9, 2);
  buffer.push(absent);
  const next = buffer.sample(150);
  assertEmptyLists(next, next.entities[0].eraSpent);
  assert.ok(Object.isFrozen(next.entities[0].eraSpent));
  assert.deepEqual(first.entities[0].eraSpent, ['hull-front']);
  assert.deepEqual(changed.entities[0].eraSpent, ['hull-front', 'turret-left']);
  assert.equal(Object.hasOwn(absent.entities[0], 'eraSpent'), false);
});

test('clear, nearby respawn, and visibility re-entry cannot retain prior ERA depletion', () => {
  const buffer = createBuffer();
  const wreck = frame(0, 2, new Set(['hull-front']));
  for (const entity of wreck.entities) entity.flags |= SNAPSHOT_FLAGS.DESTROYED;
  buffer.push(wreck);
  buffer.sample(0);
  buffer.push(frame(3, 2));
  const respawn = buffer.sample(25);
  const empty = respawn.entities[0].eraSpent;
  assert.ok(Object.isFrozen(empty));
  assertEmptyLists(respawn, empty);
  buffer.push(frame(6, 0));
  assert.equal(buffer.sample(100).entities.length, 0);
  buffer.push(frame(9, 2));
  assertEmptyLists(buffer.sample(150), empty);
  buffer.clear();
  assert.equal(buffer.sample(0), null);
  buffer.push(frame(0, 2));
  assertEmptyLists(buffer.sample(0), empty);
});

test('mutation attempts fail without contaminating another entity or buffer', () => {
  const buffer = createBuffer();
  buffer.push(frame(0));
  const sample = buffer.sample(0);
  const empty = sample.entities[0].eraSpent;
  assert.throws(() => empty.push('hull-front'), TypeError);
  assert.throws(() => { empty[0] = 'hull-front'; }, TypeError);
  assert.throws(() => { empty.length = 1; }, TypeError);
  assertEmptyLists(buffer.sample(10), empty);
  const other = createBuffer();
  other.push(frame(0));
  assertEmptyLists(other.sample(0), empty);
});

test('sampling leaves capture and real binary wire representation unchanged', () => {
  const sourceSpent = new Set(['turret-left', 'hull-front']);
  const snapshot = frame(0, 2);
  const populated = frame(0, 1, sourceSpent).entities[0];
  snapshot.entities[1].eraSpent = populated.eraSpent;
  const wire = createEnvelope(MESSAGE_TYPES.SNAPSHOT, snapshot, { seq: 1, tick: 0 });
  const before = snapshotWireCodec.encode(wire);
  for (const entity of snapshot.entities) Object.freeze(entity);
  Object.freeze(snapshot.entities);
  Object.freeze(snapshot);
  const buffer = createBuffer();
  buffer.push(snapshot);
  buffer.sample(0);
  buffer.sample(10);
  assert.deepEqual(snapshotWireCodec.encode(wire), before);
  const decoded = snapshotWireCodec.decode(before).payload;
  assert.equal(Object.hasOwn(decoded.entities[0], 'eraSpent'), false);
  assert.equal(Object.hasOwn(snapshot.entities[0], 'eraSpent'), false);
  assert.deepEqual(decoded.entities[1].eraSpent, ['hull-front', 'turret-left']);
  assert.deepEqual([...sourceSpent], ['turret-left', 'hull-front']);
});
