import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { PLAYER_ACTION_BITS } from '../net/protocol.ts';
import { MAP_IDS } from '../world/maps/index.ts';
import { PLAYABLE_HALF_EXTENT_M } from '../world/battlefieldBounds.ts';
import { tankContactRect } from './tankContactShape.ts';

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

const boundaryMatch = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0,
  players: [
    { id: 'edge-a', specId: 'm1a2', team: 'alpha', spawn: { x: 468, z: 0, yaw: Math.PI / 2 } },
    { id: 'edge-b', specId: 'm1a2', team: 'bravo', spawn: { x: -300, z: 300, yaw: 0 } },
  ],
});
boundaryMatch.onMatchReady();
const edgeDrive = new Map([['edge-a', {
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: Math.PI / 2, aimPitch: 0, shellSlot: 0,
}]]);
for (let index = 0; index < 600; index++) {
  boundaryMatch.step({ dt: 1 / 60, tick: index + 1, inputs: edgeDrive });
}
const edgeEntity = boundaryMatch.entityById.get('edge-a');
const edgeRect = tankContactRect(edgeEntity.spec);
const edgeFx = Math.sin(edgeEntity.state.yaw);
const edgeFz = Math.cos(edgeEntity.state.yaw);
const edgeRx = edgeFz;
const edgeRz = -edgeFx;
const edgeCenterX = edgeEntity.state.pos.x + edgeRx * edgeRect.centerX + edgeFx * edgeRect.centerZ;
const edgeCenterZ = edgeEntity.state.pos.z + edgeRz * edgeRect.centerX + edgeFz * edgeRect.centerZ;
const edgeExtentX = Math.abs(edgeFx) * edgeRect.halfLength + Math.abs(edgeRx) * edgeRect.halfWidth;
const edgeExtentZ = Math.abs(edgeFz) * edgeRect.halfLength + Math.abs(edgeRz) * edgeRect.halfWidth;
assert.ok(Math.abs(edgeCenterX) + edgeExtentX <= PLAYABLE_HALF_EXTENT_M + 1e-6
  && Math.abs(edgeCenterZ) + edgeExtentZ <= PLAYABLE_HALF_EXTENT_M + 1e-6,
'authoritative collision keeps the complete moving hull inside the battlefield');

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
const structureImpact = collisionEvents.find((event) => event.type === 'shell_impact' && event.kind === 'prop');
assert.ok(structureImpact, 'rendered world collider blocks authoritative shells');
assert.equal(structureImpact.shellType, 'APFSDS',
  'authoritative structure impacts preserve their shell presentation class');
assert.ok(structureImpact.caliberMm > 0 && Number.isFinite(structureImpact.ny),
  'authoritative structure impacts carry caliber and a usable surface normal');

const shellTree = {
  min: [-1, -100, -35.5],
  max: [1, 100, -34.5],
  shape2: { kind: 'circle', cx: 0, cz: -35, r: 1 },
  crushable: true,
  treeIdx: 17,
  kind: 'tree',
};
let treeCrushReceipt = null;
const treeWorld = {
  mapId: 'verdant',
  getObstacles: () => [shellTree],
  queryObstacles: (_minX, _minZ, _maxX, _maxZ, out) => {
    out.length = 0;
    out.push(shellTree);
    return out;
  },
  raycast(origin, dir, maxDist) {
    if (Math.abs(dir.z) < 1e-9) return null;
    const distance = (-35 - origin.z) / dir.z;
    if (distance < 0 || distance > maxDist) return null;
    return {
      dist: distance,
      kind: 'prop',
      record: shellTree,
      normal: new Vector3(0, 0, -1),
    };
  },
  crushObstacle(obstacle, directionX, directionZ, speedMps) {
    treeCrushReceipt = { obstacle, directionX, directionZ, speedMps };
    obstacle.crushed = true;
    return true;
  },
};
const treeMatch = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0, worldCollision: treeWorld,
  players: [
    { id: 'tree-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'tree-b', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
  ],
});
treeMatch.onMatchReady();
const treeFire = new Map([['tree-a', {
  throttle: 0, steer: 0, brake: false, fire: true,
  aimYaw: 0, aimPitch: 0, shellSlot: 0,
}]]);
for (let index = 0; index < 90; index++) treeMatch.step({ dt: 1 / 60, inputs: treeFire });
const treeEvents = treeMatch.snapshot({
  tick: 90, serverTimeMs: 1500, viewerId: 'tree-a', ackInputSeq: 1,
}).events;
assert.equal(shellTree.crushed, true, 'authoritative shell impact destroys a registered tree');
assert.equal(treeCrushReceipt?.obstacle, shellTree, 'tree destruction reaches the world collision owner');
assert.ok(treeCrushReceipt?.directionZ > 0 && treeCrushReceipt?.speedMps > 100,
  'tree receives the shell travel direction and impact speed for its fall');
assert.ok(treeEvents.some((event) => event.type === 'world_prop_destroyed'
  && event.treeIdx === 17 && event.kind === 'tree' && event.cause === 'shell'),
'tree shell destruction replicates with stable owner binding');
assert.ok(!treeEvents.some((event) => event.type === 'shell_impact'
  && event.surfaceKind === 'tree'),
'a yielding tree never consumes the authoritative projectile');
assert.ok(treeEvents.some((event) => event.type === 'shell_hit'
  && event.targetId === 'tree-b'),
'the same authoritative projectile continues through a toppled tree into the tank behind it');

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
assert.equal(guidedEvent.weaponSound, 'spike-launch',
  'authority routes the guided round to its launcher report');
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
assert.equal(ordinaryEvent.weaponSound, 'mk30-2',
  'authority routes the belt round to the Puma autocannon report');
assert.ok(ordinaryBore.dot(new Vector3(
  ordinaryEvent.dx, ordinaryEvent.dy, ordinaryEvent.dz,
)) > 1 - 1e-10, 'ordinary network shot leaves exactly on the articulated bore');

// Gun hold must survive the complete network-authority path: the server keeps
// receiving the live sight ray while the physical turret and gun stay at their
// current lay. Releasing the hold lets the articulation chase that latest ray.
guidedInput.get('guided-a').fire = false;
guidedInput.get('guided-a').aimLocked = true;
const authorityHeldYaw = guidedShooter.state.turretYaw;
const authorityHeldPitch = guidedShooter.state.gunPitch;
const authorityOldAim = guidedShooter.input.aimPoint.clone();
guidedInput.get('guided-a').aimYaw = -0.75;
guidedInput.get('guided-a').aimPitch = 0.12;
for (let i = 0; i < 30; i++) guidedMatch.step({ dt: 1 / 60, inputs: guidedInput });
assert.equal(guidedShooter.input.aimLocked, true,
  'authority copies the held gun state from network input');
assert.ok(guidedShooter.input.aimPoint.distanceTo(authorityOldAim) > 100,
  'authority continues updating the live sight ray during gun hold');
assert.ok(Math.abs(guidedShooter.state.turretYaw - authorityHeldYaw) < 1e-12,
  'authority preserves turret rotation during gun hold');
assert.ok(Math.abs(guidedShooter.state.gunPitch - authorityHeldPitch) < 1e-12,
  'authority preserves gun elevation during gun hold');
guidedInput.get('guided-a').aimLocked = false;
for (let i = 0; i < 30; i++) guidedMatch.step({ dt: 1 / 60, inputs: guidedInput });
assert.ok(Math.abs(guidedShooter.state.turretYaw - authorityHeldYaw) > 0.05,
  'authority releases the turret toward the current live sight');

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
// Base M1A2 now carries fitted reactive zones that can change which armor
// surface the opening ray encounters. Keep the trigger held through one
// reload so this general authority-path test remains about eventual shared
// armor damage; exact ERA activation/depletion is covered by its dedicated
// fitted-surface audit.
const followUpWindow = Math.ceil((match.entityById.get('alpha-1').spec.gun.reloadS + 3) * 60);
for (let i = 0; i < followUpWindow && match.entityById.get('bravo-1').combat.hp === hp0; i++) {
  match.step({ dt: 1 / 60, tick: ++tick, inputs: firing });
}
assert.ok(match.entityById.get('bravo-1').combat.hp < hp0,
  'shared armor and damage model resolves a follow-up authoritative hit');

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

kitEntity.state.visualRoll = Math.PI - 0.02;
kitEntity.state._spring.roll = kitEntity.state.visualRoll;
kitEntity.state._spring.rollV = 0;
kitEntity.state.overturned = true;
kitEntity.state.grounded = true;
kitEntity.state._body.tumbling = true;
kitEntity.state._body.autoRighting = false;
kitInput.get('kit-a').actionBits = PLAYER_ACTION_BITS.SELF_RIGHT;
consumableMatch.step({ dt: 1 / 60, inputs: kitInput });
assert.equal(kitEntity.state._body.autoRighting, true,
  'self-right input is validated and applied by match authority');
assert.ok(kitEntity.state.verticalSpeed > 0,
  'authority starts the recovery with a physical vertical shove');
assert.ok(consumableMatch.snapshot({
  tick: 3, serverTimeMs: 50, viewerId: 'kit-a', ackInputSeq: 3,
}).events.some((event) => event.type === 'tank_self_right' && event.id === 'kit-a'),
'self-right recovery is replicated to the requesting client');

const botSupportMatch = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'support-a', specId: 'm1a2', team: 'alpha', bot: true,
      spawn: { x: -100, z: -350, yaw: 0 } },
    { id: 'support-b', specId: 'm1a2', team: 'bravo', bot: true,
      spawn: { x: 100, z: 350, yaw: Math.PI } },
  ],
});
botSupportMatch.onMatchReady();
for (const id of ['support-a', 'support-b']) {
  const bot = botSupportMatch.entityById.get(id);
  bot.combat.fire = { burning: true, tickTimer: 0, ticksLeft: 5 };
  bot.combat.modules.engine.hp = 0;
  bot.combat.modules.engine.state = 'red';
  bot.combat.crew.gunner = false;
}
botSupportMatch.step({ dt: 1 / 60, inputs: new Map() });
for (const id of ['support-a', 'support-b']) {
  const bot = botSupportMatch.entityById.get(id);
  assert.equal(bot.combat.fire.burning, false, `${id}: bot authority consumes extinguisher request`);
  assert.ok(bot.consumableReadyAt[2] > 0, `${id}: extinguisher cooldown is authority-owned`);
}
botSupportMatch.step({ dt: 1 / 60, inputs: new Map() });
botSupportMatch.step({ dt: 1 / 60, inputs: new Map() });
for (const id of ['support-a', 'support-b']) {
  const bot = botSupportMatch.entityById.get(id);
  assert.equal(bot.combat.modules.engine.state, 'ok', `${id}: bot authority consumes repair request`);
  assert.equal(bot.combat.crew.gunner, true, `${id}: bot authority consumes first-aid request`);
  assert.ok(bot.consumableReadyAt[0] > 0 && bot.consumableReadyAt[1] > 0,
    `${id}: support cooldowns are symmetric and authoritative`);
}

const autoloaderMatch = createAuthoritativeMatch({
  countdownS: 0,
  players: [
    { id: 'auto-a', specId: 'pl01_105', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
    { id: 'auto-b', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
  ],
});
autoloaderMatch.onMatchReady();
const autoEntity = autoloaderMatch.entityById.get('auto-a');
const autoInput = new Map([['auto-a', {
  throttle: 0, steer: 0, brake: true, fire: true,
  aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0,
}]]);
autoloaderMatch.step({ dt: 1 / 60, inputs: autoInput });
assert.equal(autoEntity.combat.magazine.rounds, 3,
  'authority consumes one ready-rack round after firing');
assert.equal(autoEntity.combat.reload.kind, 'intraClip',
  'authority starts the short intra-magazine cycle');
autoInput.get('auto-a').fire = false;
for (let i = 0; i < 130; i++) autoloaderMatch.step({ dt: 1 / 60, inputs: autoInput });
assert.equal(autoEntity.combat.reload.kind, 'ready');
autoInput.get('auto-a').actionBits = PLAYER_ACTION_BITS.RELOAD_MAGAZINE;
autoloaderMatch.step({ dt: 1 / 60, inputs: autoInput });
assert.equal(autoEntity.combat.magazine.rounds, 0,
  'manual reload discards the authority-owned partial magazine');
assert.equal(autoEntity.combat.reload.kind, 'magazine');
assert.ok(autoloaderMatch.snapshot({ tick: 132, serverTimeMs: 2200,
  viewerId: 'auto-a', ackInputSeq: 1 }).events.some((event) =>
  event.type === 'magazine_reload'), 'manual magazine reload is replicated');
autoInput.get('auto-a').actionBits = PLAYER_ACTION_BITS.RELOAD_MAGAZINE;
autoloaderMatch.step({ dt: 1 / 60, inputs: autoInput });
assert.ok(autoloaderMatch.snapshot({ tick: 133, serverTimeMs: 2217,
  viewerId: 'auto-a', ackInputSeq: 2 }).events.some((event) =>
  event.type === 'magazine_reload_denied' && event.reason === 'MAGAZINE_RELOADING'),
'authority replicates the exact active-reload denial to the requesting client');

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

// Airborne hulls use the same three-dimensional contact pass in dedicated/
// private authority as solo play. A roof landing stays vertical, carries its
// angular impulse into the shared pose, and replicates as airborne/tumbling
// rather than being shoved sideways by the legacy 2D capsule path.
const stackMatch = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0,
  players: [
    { id: 'stack-base', specId: 'm1a2', team: 'alpha', spawn: { x: -20, z: -20, yaw: 0 } },
    { id: 'stack-top', specId: 'm1a2', team: 'bravo', spawn: { x: 20, z: 20, yaw: 0 } },
  ],
});
stackMatch.onMatchReady();
const stackBase = stackMatch.entityById.get('stack-base');
const stackTop = stackMatch.entityById.get('stack-top');
const stackHullY = stackBase.spec.armor.bodyContactPoints.hull;
const stackTurretY = stackBase.spec.armor.bodyContactPoints.turret;
const stackPivotY = stackBase.spec.armor.turretPivot[1];
let stackMinY = Infinity;
let stackMaxY = -Infinity;
for (let index = 1; index < stackHullY.length; index += 3) {
  stackMinY = Math.min(stackMinY, stackHullY[index]);
  stackMaxY = Math.max(stackMaxY, stackHullY[index]);
}
for (let index = 1; index < stackTurretY.length; index += 3) {
  stackMinY = Math.min(stackMinY, stackPivotY + stackTurretY[index]);
  stackMaxY = Math.max(stackMaxY, stackPivotY + stackTurretY[index]);
}
const stackBodyHeight = stackMaxY - stackMinY;
stackTop.state.pos.set(
  stackBase.state.pos.x + 0.8,
  stackBase.state.pos.y + stackBodyHeight - 0.15,
  stackBase.state.pos.z + 0.45,
);
stackTop.state._ride.y = stackTop.state.pos.y;
stackTop.state._ride.v = -6;
stackTop.state.verticalSpeed = -6;
stackTop.state.grounded = false;
stackTop.state._ride.grounded = false;
stackMatch.step({ dt: 1 / 60, tick: 1, inputs: new Map() });
assert.ok(stackTop.state.pos.y >= stackBase.state.pos.y + stackBodyHeight - 0.03,
  'authoritative roof landing seats the upper hull above the lower tank');
assert.ok(Math.abs(stackTop.state._spring.pitchV) + Math.abs(stackTop.state._spring.rollV) > 0.1,
  'authoritative off-center landing preserves rollover angular impulse');
assert.equal(stackTop.state._body.dynamicSupport, true,
  'tank roof is represented as dynamic support in shared authority');
assert.ok(stackMatch.snapshot({ tick: 1, serverTimeMs: 17,
  viewerId: 'stack-top', ackInputSeq: 0 }).events.some((event) => event.type === 'tank_ram'),
'vertical tank contact emits the same replicated ram event');

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
const replicatedHit = eventSnapA.events.find((event) =>
  event.type === 'shell_hit' && event.targetId === 'bravo-1');
assert.ok(replicatedHit?.impactFrame,
  'authoritative hit replication retains its exact articulation frame');
assert.equal(replicatedHit?.impactLocalPos?.length, 3,
  'authoritative hit replication retains exact frame-local contact coordinates');
assert.equal(replicatedHit?.impactLocalDir?.length, 3,
  'authoritative hit replication retains exact frame-local shot direction');
match.afterSnapshotBroadcast();
assert.equal(match.snapshot({ tick: tick + 1, serverTimeMs: (tick + 1) * 1000 / 60,
  viewerId: 'alpha-1', ackInputSeq: 4 }).events.length, 0);

for (const mapId of MAP_IDS) {
  const deployment = createAuthoritativeMatch({
    mapId,
    players: [
      { id: `${mapId}-a`, specId: 'm1a2', team: 'alpha' },
      { id: `${mapId}-b`, specId: 'm1a2', team: 'bravo' },
    ],
  });
  const alpha = deployment.entities[0].state;
  const bravo = deployment.entities[1].state;
  const dx = bravo.pos.x - alpha.pos.x;
  const dz = bravo.pos.z - alpha.pos.z;
  const distance = Math.hypot(dx, dz);
  const alphaDot = Math.sin(alpha.yaw) * dx / distance + Math.cos(alpha.yaw) * dz / distance;
  const bravoDot = Math.sin(bravo.yaw) * -dx / distance + Math.cos(bravo.yaw) * -dz / distance;
  assert.ok(alphaDot > 0.96, `${mapId}: Alpha spawn faces the opposing zone`);
  assert.ok(bravoDot > 0.96, `${mapId}: Bravo spawn faces the opposing zone`);
}

console.log('authoritativeMatch.selftest: identity, deployment, movement, world, combat authority, and events passed');
