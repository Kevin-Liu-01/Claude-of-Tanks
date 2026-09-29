// The authority's viewer snapshot (src/sim/worldSnapshot.ts): hidden enemies are omitted BEFORE anything is serialized
// (the AGENTS invariant), rows are quantized integers, the flags read the combat state, the roster and shell counts are
// bounded, and the capture never retains the simulation's objects.
import assert from 'node:assert/strict';
import { SNAPSHOT_FLAGS, captureEntitySnapshot, captureWorldSnapshot } from './worldSnapshot.ts';

const tank = (id, over = {}) => ({
  id, specId: 'm1a2', team: 'alpha', spotted: false,
  state: { pos: { x: 12.345, y: 0.5, z: -7.891 }, speed: 3, yaw: Math.PI / 2, verticalSpeed: -0.25, visualPitch: 0.01, visualRoll: -0.02, turretYaw: 0.5, gunPitch: 0.1, grounded: true },
  combat: { hp: 1234.6, maxHp: 2000, reload: { t: 1.25, totalS: 6, kind: 'shell' }, magazine: null, shellSlot: 1, ammo: [40, 12, 8], destroyed: false, fire: null, eraSpent: new Set(['b', 'a']) },
  input: { fire: true },
  ...over,
});

const row = captureEntitySnapshot(tank('viewer'));
assert.deepEqual([row.x, row.y, row.z], [1235, 50, -789], 'positions in centimetres');
assert.equal(row.vx, 300, 'velocity from yaw and speed (cm/s)');
assert.equal(row.vy, -25);
assert.equal(row.yaw, Math.round((Math.PI / 2) * (32767 / Math.PI)));
assert.equal(row.hp, 1235);
assert.deepEqual([row.reloadMs, row.reloadTotalMs, row.reloadKind], [1250, 6000, 1]);
assert.deepEqual([row.ammo0, row.ammo1, row.ammo2, row.shellSlot], [40, 12, 8, 1]);
assert.equal(row.flags & SNAPSHOT_FLAGS.FIRING, SNAPSHOT_FLAGS.FIRING);
assert.equal(row.flags & SNAPSHOT_FLAGS.DESTROYED, 0);
assert.deepEqual(row.eraSpent, ['a', 'b'], 'spent plates ride sorted');
assert.equal(captureEntitySnapshot(tank('x', { combat: { ...tank('x').combat, eraSpent: new Set() } })).eraSpent, undefined, 'no plates gone, no field');
assert.equal(captureEntitySnapshot(tank('bare', { state: null })), null, 'a tank without state has no row');
const burning = captureEntitySnapshot(tank('b', { combat: { ...tank('b').combat, destroyed: true, fire: { burning: true } }, state: { ...tank('b').state, grounded: false, overturned: true } }));
assert.equal(burning.flags, SNAPSHOT_FLAGS.DESTROYED | SNAPSHOT_FLAGS.BURNING | SNAPSHOT_FLAGS.FIRING | SNAPSHOT_FLAGS.AIRBORNE | SNAPSHOT_FLAGS.OVERTURNED);

// ---- the viewer's snapshot: spotting filters before serialization
const viewer = tank('viewer');
const ally = tank('ally');
const seen = tank('seen-enemy', { team: 'bravo', spotted: true });
const hidden = tank('hidden-enemy', { team: 'bravo', spotted: false, state: { ...tank('h').state, pos: { x: 999, y: 0, z: 999 } } });
const shells = [{ id: 7, shooterId: 'viewer', pos: { x: 1, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 900 }, spec: { type: 'AP', guided: false } },
  { id: 8, shooterId: 'hidden-enemy', pos: { x: 5, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 900 }, spec: { type: 'HE', guided: false } },
  { id: 9, shooterId: 'viewer', dead: true, pos: { x: 1, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 0 }, spec: { type: 'AP' } }];
const events = [{ type: 'shell_fired', shooterId: 'viewer' }, { type: 'shell_fired', shooterId: 'hidden-enemy' }];
const canObserve = (viewerId, entity) => entity.team === 'alpha' || entity.spotted === true;
const snapshot = captureWorldSnapshot({
  tick: 90, serverTimeMs: 1500.4, viewerId: 'viewer', ackInputSeq: 42, entities: [viewer, ally, seen, hidden], shells, events,
  canObserve, canObserveShell: (viewerId, shell) => shell.shooterId !== 'hidden-enemy',
  canObserveEvent: (viewerId, event) => event.shooterId !== 'hidden-enemy', meta: { phase: 'playing', weatherSeed: 6000 },
});
assert.deepEqual(snapshot.entities.map((entry) => entry.id), ['viewer', 'ally', 'seen-enemy'], 'the hidden enemy never reaches the payload');
assert.equal(JSON.stringify(snapshot).includes('hidden-enemy'), false, 'not as an entity, a shell or an event');
assert.deepEqual(snapshot.shells.map((shell) => shell.id), [7], 'dead shells and hidden shooters are gone');
assert.equal(snapshot.events.length, 1);
assert.deepEqual([snapshot.tick, snapshot.serverTimeMs, snapshot.ackInputSeq], [90, 1500, 42]);
assert.deepEqual(snapshot.meta, { phase: 'playing', weatherSeed: 6000 });
assert.notEqual(snapshot.meta, undefined);
const own = snapshot.entities.find((entry) => entry.id === 'viewer');
own.x = 0;
assert.equal(viewer.state.pos.x, 12.345, 'the row is detached from the simulation');
const stranger = captureWorldSnapshot({ tick: 1, serverTimeMs: 0, viewerId: 'stranger', entities: [viewer, hidden], canObserve });
assert.deepEqual(stranger.entities.map((entry) => entry.id), ['viewer'], 'a viewer outside the roster sees only what the policy grants');
const many = Array.from({ length: 40 }, (_, index) => tank(`t${index}`));
assert.equal(captureWorldSnapshot({ tick: 1, serverTimeMs: 0, viewerId: 't0', entities: many }).entities.length, 32, 'the roster is bounded');
assert.throws(() => captureWorldSnapshot({ tick: -1, serverTimeMs: 0 }), /unsigned/);
assert.throws(() => captureWorldSnapshot({ tick: 1, serverTimeMs: -5 }), /non-negative/);
console.log('worldSnapshot.selftest: quantized rows, the spotting boundary before serialization, bounds and detachment');
