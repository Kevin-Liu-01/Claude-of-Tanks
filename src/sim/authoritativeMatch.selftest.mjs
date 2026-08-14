import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from './authoritativeMatch.js';

const match = createAuthoritativeMatch({
  mapId: 'verdant',
  seed: 9,
  countdownS: 0,
  players: [
    { id: 'alpha-1', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'bravo-1', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
  ],
});
match.onMatchReady();

assert.equal(match.entities.length, 2);
assert.equal(match.entities[0].specId, match.entities[1].specId, 'duplicate vehicles are valid');
assert.notEqual(match.entities[0].id, match.entities[1].id, 'identity is not a vehicle spec');

let tick = 0;
const drive = new Map([['alpha-1', {
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0,
}]]);
const z0 = match.entityById.get('alpha-1').state.pos.z;
for (let i = 0; i < 120; i++) match.step({ dt: 1 / 60, tick: ++tick, inputs: drive });
assert.ok(match.entityById.get('alpha-1').state.pos.z > z0 + 1, 'shared movement model advances');

const hiddenMatch = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'near-a', specId: 'm1a2', team: 'alpha', spawn: { x: -400, z: -400, yaw: 0 } },
    { id: 'far-b', specId: 'm1a2', team: 'bravo', spawn: { x: 400, z: 400, yaw: Math.PI } },
  ],
});
hiddenMatch.onMatchReady();
const privateSnap = hiddenMatch.snapshot({ tick: 0, serverTimeMs: 0, viewerId: 'near-a', ackInputSeq: 0 });
assert.deepEqual(privateSnap.entities.map((entity) => entity.id), ['near-a'],
  'unspotted enemy coordinates never serialize');

const firing = new Map([
  ['alpha-1', {
    throttle: 0, steer: 0, brake: true, fire: true,
    aimYaw: 0, aimPitch: 0, shellSlot: 0,
  }],
  ['bravo-1', {
    throttle: 0, steer: 0, brake: true, fire: false,
    aimYaw: Math.PI, aimPitch: 0, shellSlot: 0,
  }],
]);
const hp0 = match.entityById.get('bravo-1').combat.hp;
for (let i = 0; i < 180 && match.entityById.get('bravo-1').combat.hp === hp0; i++) {
  match.step({ dt: 1 / 60, tick: ++tick, inputs: firing });
  if (i === 0) firing.get('alpha-1').fire = false;
}
assert.ok(match.entityById.get('bravo-1').combat.hp < hp0,
  'shared armor and damage model resolves an authoritative hit');

const eventSnapA = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60,
  viewerId: 'alpha-1', ackInputSeq: 4 });
const eventSnapB = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60,
  viewerId: 'bravo-1', ackInputSeq: 8 });
assert.ok(eventSnapA.events.length > 0 && eventSnapB.events.length > 0,
  'one snapshot cycle serves every viewer before events clear');
match.afterSnapshotBroadcast();
assert.equal(match.snapshot({ tick: tick + 1, serverTimeMs: (tick + 1) * 1000 / 60,
  viewerId: 'alpha-1', ackInputSeq: 4 }).events.length, 0);

console.log('authoritativeMatch.selftest: identity, movement, privacy, armor, and events passed');
