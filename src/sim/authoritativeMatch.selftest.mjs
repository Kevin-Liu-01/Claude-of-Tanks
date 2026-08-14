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

const wall = {
  min: [-12, -100, -35.5],
  max: [12, 100, -34.5],
  shape2: { kind: 'obb', cx: 0, cz: -35, hw: 12, hl: 0.5, yaw: 0 },
};
const collisionWorld = {
  mapId: 'verdant',
  getObstacles: () => [wall],
  queryObstacles: (_minX, _minZ, _maxX, _maxZ, out) => {
    out.length = 0;
    out.push(wall);
    return out;
  },
  raycast(origin, dir, maxDist) {
    if (Math.abs(dir.z) < 1e-9) return null;
    const distance = (-35 - origin.z) / dir.z;
    if (distance < 0 || distance > maxDist) return null;
    const x = origin.x + dir.x * distance;
    const y = origin.y + dir.y * distance;
    return Math.abs(x) <= 12 && y >= -100 && y <= 100
      ? { dist: distance, kind: 'prop' } : null;
  },
};
const collisionMatch = createAuthoritativeMatch({
  mapId: 'verdant',
  countdownS: 0,
  worldCollision: collisionWorld,
  players: [
    { id: 'wall-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'wall-b', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
  ],
});
collisionMatch.onMatchReady();
const wallDrive = new Map([['wall-a', {
  throttle: 1, steer: 0, brake: false, fire: true,
  aimYaw: 0, aimPitch: 0, shellSlot: 0,
}]]);
for (let i = 0; i < 360; i++) collisionMatch.step({ dt: 1 / 60, inputs: wallDrive });
assert.ok(collisionMatch.entityById.get('wall-a').state.pos.z < -38,
  'rendered world obstacle stops the authoritative hull footprint');
const collisionEvents = collisionMatch.snapshot({
  tick: 360, serverTimeMs: 6000, viewerId: 'wall-a', ackInputSeq: 1,
}).events;
assert.ok(collisionEvents.some((event) => event.type === 'shell_impact' && event.kind === 'prop'),
  'rendered world collider blocks authoritative shells');

const crushWall = {
  ...wall,
  min: wall.min.slice(),
  max: wall.max.slice(),
  shape2: { ...wall.shape2 },
  crushable: true,
  kind: 'fence',
};
const crushWorld = {
  mapId: 'verdant',
  getObstacles: () => [crushWall],
  queryObstacles: (_minX, _minZ, _maxX, _maxZ, out) => {
    out.length = 0;
    out.push(crushWall);
    return out;
  },
  raycast: () => null,
  crushObstacle(obstacle) { obstacle.crushed = true; return true; },
};
const crushMatch = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0, worldCollision: crushWorld,
  players: [
    { id: 'crush-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'crush-b', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
  ],
});
crushMatch.onMatchReady();
const crushDrive = new Map([['crush-a', {
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0,
}]]);
for (let i = 0; i < 360; i++) crushMatch.step({ dt: 1 / 60, inputs: crushDrive });
assert.equal(crushWall.crushed, true, 'authority owns destructible world state');
assert.ok(crushMatch.entityById.get('crush-a').state.pos.z > -30,
  'crushable cover yields to a moving tank');
assert.ok(crushMatch.snapshot({ tick: 360, serverTimeMs: 6000,
  viewerId: 'crush-a', ackInputSeq: 1 }).events
  .some((event) => event.type === 'world_prop_destroyed' && event.kind === 'fence'),
'destruction replication event identifies the authored obstacle');

const botMatch = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0, seed: 123,
  players: [
    { id: 'human-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -120, yaw: 0 } },
    { id: 'bot-b', specId: 't90m', team: 'bravo', bot: true,
      spawn: { x: 0, z: 120, yaw: Math.PI } },
  ],
});
assert.deepEqual(botMatch.requiredPeerIds, ['human-a'], 'bots never block the ready barrier');
botMatch.onMatchReady();
const botStart = botMatch.entityById.get('bot-b').state.pos.clone();
for (let i = 0; i < 1200; i++) botMatch.step({ dt: 1 / 60, inputs: new Map() });
assert.ok(botMatch.entityById.get('bot-b').state.pos.distanceTo(botStart) > 5,
  'seeded traversability bot advances under authority');

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

console.log('authoritativeMatch.selftest: identity, movement, world collision, privacy, armor, and events passed');
