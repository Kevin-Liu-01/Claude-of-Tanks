// Host migration state: the AES-GCM seal under the key derived from the host secret opens with the same secret and
// with no other; the keyframe codec round-trips rows, meta, destroyed indices and the extras; chunking stays under
// MAX_EVENT_JSON_BYTES and the store assembles chunks out of order, drops duplicates and malformed ones, keeps the
// newest complete blob per kind and clears for a new match; the boot configuration blob never carries the secret;
// a keyframe captured from one actor restores another at the same poses, health, ammo, reload, ERA, kills, damage,
// modules, crew and fires.
import assert from 'node:assert/strict';
import { MAX_EVENT_JSON_BYTES } from '../wire/constants.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { MIGRATION_EVENT_KIND } from './hostProtocol.ts';
import {
  MIGRATION_CHUNK_BYTES, MigrationStore, applyResumeState, captureEntityExtras, chunkMigrationBlob, decodeBootConfig, decodeMigrationKeyframe,
  deriveMigrationKey, encodeBootConfig, encodeMigrationKeyframe, openMigrationBlob, sealMigrationBlob,
} from './migrationState.ts';

// ---- seal / open
const SECRET = 'host-secret-0123456789abcdef0123456789abcdef';
const key = await deriveMigrationKey(SECRET);
const other = await deriveMigrationKey('another-secret-0123456789abcdef0123456789');
const plain = new TextEncoder().encode('the hidden enemy positions');
const sealed = await sealMigrationBlob(key, plain);
assert.notDeepEqual([...sealed.subarray(12)], [...plain], 'the ciphertext is not the plaintext');
assert.deepEqual([...await openMigrationBlob(key, sealed)], [...plain]);
await assert.rejects(openMigrationBlob(other, sealed), 'a peer without the secret cannot open it');
const sealedAgain = await sealMigrationBlob(key, plain);
assert.notDeepEqual([...sealedAgain.subarray(0, 12)], [...sealed.subarray(0, 12)], 'a fresh IV per blob');
await assert.rejects(openMigrationBlob(key, new Uint8Array(5)), /too short/);
await assert.rejects(deriveMigrationKey('short'), /at least 16/);

// ---- two actors on the same roster: capture from A after some play, restore B, compare
const seats = [
  { seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a2' },
  { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90m' },
];
const bots = [{ playerId: 'bot-a', name: 'Bot A', team: 'alpha', specId: 'leo2a7v' }, { playerId: 'bot-b', name: 'Bot B', team: 'bravo', specId: 'leo2a7v' }];
let nowMs = 1000;
const now = () => nowMs;
const schedule = () => () => {};
const TICK_MS = 1000 / 60;
const a = createMatchActor({ roomId: 'mig', mapId: 'verdant', seed: 99, seats, bots, world: 'terrain', countdownS: 0, now, schedule });
for (let tick = 0; tick < 240; tick++) { nowMs += TICK_MS; a.advance(nowMs); }
// scripted damage on p1 so the restore has something to carry
const p1 = a.entityForWireId(1);
p1.combat.hp = Math.round(p1.combat.maxHp * 0.4);
p1.combat.ammo[0] = 7;
p1.combat.shellSlot = 1;
p1.combat.reload.t = 2.5; p1.combat.reload.totalS = 6; p1.combat.reload.kind = 'shell';
p1.kills = 2; p1.damage = 1234.6;
const moduleId = Object.keys(p1.combat.modules)[0];
p1.combat.modules[moduleId].state = 'red';
const crewId = Object.keys(p1.combat.crew)[0];
p1.combat.crew[crewId] = false;
p1.combat.fire.burning = true;
const eraNames = [...(p1.spec.armor?.hullPlates ?? []), ...(p1.spec.armor?.turretPlates ?? [])].filter((plate) => plate.kind === 'era').map((plate) => plate.name);
if (eraNames.length) p1.combat.eraSpent.add(eraNames[0]);
const bot = a.entityForWireId(3);
bot.combat.hp = 0; bot.combat.destroyed = true;

const era = createEraIndexer();
const rows = a.authority.entities.map((entity) => captureEntityRow(entity, a.wireIdOf(entity.id), era)).sort((x, y) => x.entityId - y.entityId);
const snapshot = a.authority.snapshot({ tick: a.tick, serverTimeMs: Math.round(a.tick * TICK_MS), viewerId: 'migration', ackInputSeq: null });
assert.equal(snapshot.entities.length, 4, 'an unknown viewer sees every entity');
const keyframe = {
  tick: a.tick, battleTimeMs: Math.round(a.authority.timeS * 1000), phase: 'playing',
  frame: {
    tick: a.tick, serverTimeMs: Math.round(a.tick * TICK_MS), ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snapshot.meta, battleTimeMs: Math.round(a.authority.timeS * 1000) }, false), destroyed: [3, 9, 27], entities: rows, shells: [], viewer: null, modeStateJson: null,
  },
  entities: captureEntityExtras(a),
};
const encoded = encodeMigrationKeyframe(keyframe);
const decoded = decodeMigrationKeyframe(encoded);
assert.equal(decoded.tick, keyframe.tick);
assert.equal(decoded.battleTimeMs, keyframe.battleTimeMs);
assert.equal(decoded.phase, 'playing');
assert.deepEqual(decoded.frame.destroyed, [3, 9, 27]);
assert.deepEqual(decoded.frame.entities.map((row) => [row.entityId, row.x, row.hp, row.flags, row.eraSpent]), rows.map((row) => [row.entityId, row.x, row.hp, row.flags, row.eraSpent]));
assert.equal(decoded.entities.find((entry) => entry.entityId === 1).kills, 2);
assert.equal(decoded.entities.find((entry) => entry.entityId === 1).modules[moduleId], 'red');
assert.equal(decoded.entities.find((entry) => entry.entityId === 1).crew[crewId], false);
assert.equal(decoded.entities.find((entry) => entry.entityId === 1).burning, true);
assert.throws(() => decodeMigrationKeyframe(new Uint8Array(2)), /too short/);
const roundTripped = await openMigrationBlob(key, await sealMigrationBlob(key, encoded));
assert.deepEqual([...roundTripped], [...encoded]);

// ---- restore B from the keyframe (a resumed actor at A's tick)
const b = createMatchActor({ roomId: 'mig', mapId: 'verdant', seed: 99, seats, bots, world: 'terrain', now, schedule, autoStart: false, resume: { tick: decoded.tick, battleTimeMs: decoded.battleTimeMs } });
const applied = applyResumeState(b, decoded);
assert.deepEqual(applied, { restored: 4, skipped: 0 });
for (const entityA of a.authority.entities) {
  const entityB = b.authority.entityById.get(entityA.id);
  assert.ok(Math.abs(entityA.state.pos.x - entityB.state.pos.x) <= 0.001 && Math.abs(entityA.state.pos.z - entityB.state.pos.z) <= 0.001, `${entityA.id} pose within 1 mm`);
  assert.ok(Math.abs(entityA.state.yaw - entityB.state.yaw) < 0.0002, `${entityA.id} yaw within a u16 turn`);
  assert.ok(Math.abs(entityA.state.turretYaw - entityB.state.turretYaw) < 0.0002);
  assert.equal(entityB.combat.hp, Math.round(entityA.combat.hp));
  assert.equal(entityB.combat.destroyed, entityA.combat.destroyed);
}
const p1b = b.authority.entityById.get('p1');
assert.equal(p1b.combat.ammo[0], 7);
assert.equal(p1b.combat.shellSlot, 1);
assert.ok(Math.abs(p1b.combat.reload.t - 2.5) < 0.003 && Math.abs(p1b.combat.reload.totalS - 6) < 0.003, 'the reload channel is restored (2 ms steps)');
assert.equal(p1b.combat.reload.kind, 'shell');
assert.equal(p1b.kills, 2);
assert.equal(p1b.damage, 1235);
assert.equal(p1b.combat.modules[moduleId].state, 'red');
assert.equal(p1b.combat.crew[crewId], false);
assert.equal(p1b.combat.fire.burning, true);
if (eraNames.length) assert.ok(p1b.combat.eraSpent.has(eraNames[0]), 'the spent ERA cassette is restored');
assert.equal(b.authority.entityById.get('bot-a').combat.destroyed, true);
b.start();
assert.equal(b.tick, decoded.tick);
assert.equal(b.authority.phase, 'playing');
b.stop();
a.stop();

// ---- chunking under the event limit; the store assembles, dedupes, keeps the newest, rejects malformed, clears
const big = new Uint8Array(MIGRATION_CHUNK_BYTES * 3 + 100).map((_, index) => index & 0xff);
const events = chunkMigrationBlob(MIGRATION_EVENT_KIND.KEYFRAME, 5, 1200, big);
assert.equal(events.length, 4);
for (const event of events) {
  assert.equal(event.kind, 'mp:keyframe');
  assert.ok(new TextEncoder().encode(JSON.stringify(event.payload)).byteLength <= MAX_EVENT_JSON_BYTES, 'each chunk fits one wire event');
}
const store = new MigrationStore();
assert.equal(store.receive({ kind: 'shell_fired', payload: {} }, 1), false, 'game events pass through');
assert.equal(store.receive(events[2], 10), true);
assert.equal(store.receive(events[0], 11), true);
assert.equal(store.receive(events[2], 12), true, 'a duplicate chunk is harmless');
assert.equal(store.keyframe, null, 'incomplete until every part arrived');
assert.equal(store.receive(events[3], 13), true);
assert.equal(store.receive(events[1], 14), true);
assert.ok(store.keyframe, 'complete');
assert.deepEqual([...store.keyframe.blob], [...big]);
assert.equal(store.keyframe.tick, 1200);
assert.equal(store.keyframe.receivedAtMs, 14);
assert.equal(store.stats().blobsCompleted, 1);
const older = chunkMigrationBlob(MIGRATION_EVENT_KIND.KEYFRAME, 6, 900, new Uint8Array([1, 2, 3]));
store.receive(older[0], 20);
assert.equal(store.keyframe.tick, 1200, 'an older tick never replaces the retained keyframe');
const newer = chunkMigrationBlob(MIGRATION_EVENT_KIND.KEYFRAME, 7, 1500, new Uint8Array([4, 5]));
store.receive(newer[0], 21);
assert.equal(store.keyframe.tick, 1500);
assert.equal(store.keyframe.id, 7);
assert.equal(store.receive({ kind: 'mp:keyframe', payload: { id: 8, tick: 1, part: 5, parts: 2, data: 'AA' } }, 22), true);
assert.equal(store.receive({ kind: 'mp:config', payload: { id: 'x' } }, 22), true);
assert.equal(store.stats().rejected, 2);
const configEvents = chunkMigrationBlob(MIGRATION_EVENT_KIND.CONFIG, 1, 0, new Uint8Array([9]));
store.receive(configEvents[0], 23);
assert.equal(store.config.tick, 0);
store.clear();
assert.equal(store.keyframe, null);
assert.equal(store.config, null);
assert.throws(() => chunkMigrationBlob(MIGRATION_EVENT_KIND.KEYFRAME, 1, 0, new Uint8Array(MIGRATION_CHUNK_BYTES * 65)), /too large/);

// ---- the boot config blob carries no secret
const config = { roomId: 'R', matchId: 'm1', generation: 2, mapId: 'verdant', mode: 'standard', seed: 3, seats, bots, countdownS: 5, battleLimitS: null, hostSecret: SECRET, manifestBase: '/mp-collision', resume: null };
const configBytes = encodeBootConfig(config);
assert.doesNotMatch(new TextDecoder().decode(configBytes), /hostSecret|mp-collision/);
const configBack = decodeBootConfig(configBytes);
assert.deepEqual(configBack.seats, seats);
assert.equal(configBack.generation, 2);
assert.throws(() => decodeBootConfig(new TextEncoder().encode('{"roomId":1}')), /invalid/);
console.log('migrationState.selftest: seal/open, keyframe codec, actor restore, chunk store and config blob verified');
