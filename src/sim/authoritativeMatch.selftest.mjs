import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import '../vehicles/tankFactory.js'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.js';
import { PLAYER_ACTION_BITS } from '../net/protocol.js';

function articulatedGunDirection(entity) {
  const state = entity.state;
  const hull = new Quaternion().setFromEuler(new Euler(
    -state.visualPitch, state.yaw, state.visualRoll, 'YXZ',
  ));
  return new Vector3(
    Math.sin(state.turretYaw) * Math.cos(state.gunPitch),
    Math.sin(state.gunPitch),
    Math.cos(state.turretYaw) * Math.cos(state.gunPitch),
  ).applyQuaternion(hull).normalize();
}

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
const crushSnapshot = crushMatch.snapshot({ tick: 360, serverTimeMs: 6000,
  viewerId: 'crush-a', ackInputSeq: 1 });
assert.ok(crushSnapshot.events
  .some((event) => event.type === 'world_prop_destroyed' && event.kind === 'fence'),
'destruction replication event identifies the authored obstacle');
assert.equal(crushSnapshot.meta.destructibleRevision, 1,
  'destructible state carries a persistent monotonic revision');
assert.deepEqual(crushSnapshot.meta.destroyedObstacleIndices, [0],
  'keyframes can reconstruct destroyed collision state after reconnect');

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

const timedMatch = createAuthoritativeMatch({
  countdownS: 0,
  battleLimitS: 1,
  players: [
    { id: 'time-a', specId: 'm1a2', team: 'alpha', spawn: { x: -400, z: -400, yaw: 0 } },
    { id: 'time-b', specId: 'm1a2', team: 'bravo', spawn: { x: 400, z: 400, yaw: Math.PI } },
  ],
});
timedMatch.onMatchReady();
for (let i = 0; i < 60; i++) timedMatch.step({ dt: 1 / 60, inputs: new Map() });
assert.equal(timedMatch.resultReason, 'time_limit');
assert.equal(timedMatch.snapshot({ tick: 60, serverTimeMs: 1000,
  viewerId: 'time-a', ackInputSeq: 0 }).meta.resultReason, 'time_limit');

const eliminatedMatch = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'elim-a', specId: 'm1a2', team: 'alpha' },
    { id: 'elim-b', specId: 'm1a2', team: 'bravo' },
  ],
});
eliminatedMatch.onMatchReady();
eliminatedMatch.entityById.get('elim-b').combat.destroyed = true;
eliminatedMatch.step({ dt: 1 / 60, inputs: new Map() });
assert.equal(eliminatedMatch.resultReason, 'elimination');
assert.ok(eliminatedMatch.snapshot({ tick: 1, serverTimeMs: 1000 / 60,
  viewerId: 'elim-a', ackInputSeq: 0 }).events.some((event) =>
  event.type === 'match_ended' && event.reason === 'elimination'));

const guidedMatch = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'guided-a', specId: 'spz_puma', team: 'alpha',
      spawn: { x: 0, z: -100, yaw: 0 } },
    { id: 'guided-b', specId: 'm1a2', team: 'bravo',
      spawn: { x: 0, z: 100, yaw: Math.PI } },
  ],
});
guidedMatch.onMatchReady();
const guidedInput = new Map([['guided-a', {
  throttle: 0, steer: 0, brake: true, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 1,
}]]);
for (let i = 0; i < 240; i++) {
  guidedMatch.step({ dt: 1 / 60, inputs: guidedInput });
}
const guidedShooter = guidedMatch.entityById.get('guided-a');
guidedShooter.combat.reload.t = 0;
const guidedAccuracy = guidedShooter.spec.gun.baseAccuracy;
guidedShooter.spec.gun.baseAccuracy = 0;
guidedInput.get('guided-a').fire = true;
guidedMatch.step({ dt: 1 / 60, inputs: guidedInput });
guidedShooter.spec.gun.baseAccuracy = guidedAccuracy;
const guidedEvent = guidedMatch.snapshot({
  tick: 241, serverTimeMs: 241000 / 60, viewerId: 'guided-a', ackInputSeq: 1,
}).events.find((event) => event.type === 'shell_fired' && event.shooterId === 'guided-a');
assert.ok(guidedEvent, 'authority emits the controlled guided shot');
const guidedEntity = guidedMatch.entityById.get('guided-a');
const guidedDirect = guidedEntity.input.aimPoint.clone().sub(new Vector3(
  guidedEvent.x, guidedEvent.y, guidedEvent.z,
)).normalize();
assert.ok(guidedDirect.dot(new Vector3(
  guidedEvent.dx, guidedEvent.dy, guidedEvent.dz,
)) > 1 - 1e-10, 'authoritative guided shot launches through the center plus');

// An ordinary multiplayer round must also leave on the visible articulated
// bore. The authority rebuilds the input ray at 1,000 m; the former trigger-
// time ballistic correction treated that synthetic range as a real target and
// pitched slow shells visibly high. Gravity acts only after muzzle exit.
guidedInput.get('guided-a').fire = false;
guidedInput.get('guided-a').shellSlot = 0;
guidedMatch.step({ dt: 1 / 60, inputs: guidedInput });
guidedShooter.combat.reload.t = 0;
guidedShooter.spec.gun.baseAccuracy = 0;
const ordinaryBore = articulatedGunDirection(guidedShooter);
guidedInput.get('guided-a').fire = true;
guidedMatch.step({ dt: 1 / 60, inputs: guidedInput });
guidedShooter.spec.gun.baseAccuracy = guidedAccuracy;
const ordinaryEvent = guidedMatch.snapshot({
  tick: 243, serverTimeMs: 243000 / 60, viewerId: 'guided-a', ackInputSeq: 2,
}).events.find((event) => event.type === 'shell_fired' &&
  event.shooterId === 'guided-a' && event.shellName !== guidedEvent.shellName);
assert.ok(ordinaryEvent, 'authority emits the controlled ordinary shot');
assert.ok(ordinaryBore.dot(new Vector3(
  ordinaryEvent.dx, ordinaryEvent.dy, ordinaryEvent.dz,
)) > 1 - 1e-10, 'ordinary network shot leaves exactly on the articulated bore');

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

const consumableMatch = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'kit-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'kit-b', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
  ],
});
consumableMatch.onMatchReady();
const kitEntity = consumableMatch.entityById.get('kit-a');
kitEntity.combat.modules.engine.hp = kitEntity.combat.modules.engine.maxHp * 0.5;
kitEntity.combat.modules.engine.state = 'yellow';
const kitInput = new Map([['kit-a', {
  throttle: 0, steer: 0, brake: true, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: PLAYER_ACTION_BITS.REPAIR,
}]]);
consumableMatch.step({ dt: 1 / 60, inputs: kitInput });
assert.equal(kitEntity.combat.modules.engine.state, 'ok',
  'repair kit state changes are owned by authority');
consumableMatch.step({ dt: 1 / 60, inputs: kitInput });
const kitEvents = consumableMatch.snapshot({
  tick: 2, serverTimeMs: 1000 / 30, viewerId: 'kit-a', ackInputSeq: 2,
}).events;
assert.ok(kitEvents.some((event) => event.type === 'consumable_used' && event.slot === 0));
assert.ok(kitEvents.some((event) => event.type === 'consumable_denied' &&
  event.reason === 'COOLDOWN'), 'authority enforces reusable-kit cooldowns');

const ramMatch = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'ram-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -10, yaw: 0 } },
    { id: 'ram-b', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 10, yaw: Math.PI } },
  ],
});
ramMatch.onMatchReady();
const ramHp = ramMatch.entityById.get('ram-a').combat.hp;
const ramInputs = new Map([
  ['ram-a', { throttle: 1, steer: 0, brake: false, fire: false,
    aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 }],
  ['ram-b', { throttle: 1, steer: 0, brake: false, fire: false,
    aimYaw: Math.PI, aimPitch: 0, shellSlot: 0, actionBits: 0 }],
]);
for (let i = 0; i < 240; i++) ramMatch.step({ dt: 1 / 60, inputs: ramInputs });
assert.ok(ramMatch.entityById.get('ram-a').combat.hp < ramHp,
  'hull contact applies mass-weighted authoritative ram damage');
assert.ok(ramMatch.snapshot({ tick: 240, serverTimeMs: 4000,
  viewerId: 'ram-a', ackInputSeq: 1 }).events.some((event) => event.type === 'tank_ram'),
'ram feedback is replicated');

const heMatch = createAuthoritativeMatch({
  countdownS: 0,
  seed: 19,
  players: [
    { id: 'he-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -25, yaw: 0 } },
    { id: 'he-direct', specId: 'leichttraktor', team: 'bravo', spawn: { x: 0, z: 0, yaw: Math.PI } },
    { id: 'he-splash', specId: 'leichttraktor', team: 'bravo', spawn: { x: 3.2, z: 0, yaw: Math.PI } },
  ],
});
heMatch.onMatchReady();
const splashTarget = heMatch.entityById.get('he-splash');
const splashHp = splashTarget.combat.hp;
heMatch.entityById.get('he-a').combat.shellSlot = 2;
heMatch.entityById.get('he-a').input.shellSlot = 2;
const heInputs = new Map([['he-a', {
  throttle: 0, steer: 0, brake: true, fire: true,
  aimYaw: 0, aimPitch: 0, shellSlot: 2, actionBits: 0,
}]]);
for (let i = 0; i < 120 && splashTarget.combat.hp === splashHp; i++) {
  heMatch.step({ dt: 1 / 60, inputs: heInputs });
  heInputs.get('he-a').fire = false;
}
assert.ok(splashTarget.combat.hp < splashHp,
  'HE direct impacts apply authoritative area splash to nearby armor');
assert.ok(heMatch.snapshot({ tick: 120, serverTimeMs: 2000,
  viewerId: 'he-a', ackInputSeq: 1 }).events.some((event) =>
  event.type === 'shell_hit' && event.kind === 'he_splash' && event.targetId === 'he-splash'),
'HE splash outcomes are replicated per target');

const eventSnapA = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60,
  viewerId: 'alpha-1', ackInputSeq: 4 });
const eventSnapB = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60,
  viewerId: 'bravo-1', ackInputSeq: 8 });
assert.ok(eventSnapA.events.length > 0 && eventSnapB.events.length > 0,
  'one snapshot cycle serves every viewer before events clear');
match.afterSnapshotBroadcast();
assert.equal(match.snapshot({ tick: tick + 1, serverTimeMs: (tick + 1) * 1000 / 60,
  viewerId: 'alpha-1', ackInputSeq: 4 }).events.length, 0);

console.log('authoritativeMatch.selftest: identity, movement, world, combat authority, and events passed');
