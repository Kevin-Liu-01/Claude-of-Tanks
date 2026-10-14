// Heavy plant breaks where a round stops on it, in both authorities (Lane C, item 7 on main, 2026-10-14; the owner,
// 2026-10-11: "some vehicles like the construuction vehicles and other stuff are not breaking on impact or being fired").
// A Haulpak haul truck (setpiece_haulpak: dense cover, maps/setPieceDestructibles.ts) stands across the line between two
// hulls. Run for real, the solo step (game/state.ts simStep) and the match authority (sim/authoritativeMatch.ts) both:
// stop every round on it (the tank behind takes no main-gun hit while it stands), leave it standing under machine-gun
// fire (collision.ts SET_PIECE_WRECK_MIN_CALIBER_MM), and wreck it with the first gun round that stops on it, once,
// along the round. The authority replicates it as a shell kill of the set piece. The rover (setpiece_lrv) is light cover.
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createTankState } from './movement.ts';
import { createCombatState } from './damage.ts';
import {
  DENSE_SET_PIECE_KINDS, SET_PIECE_WRECK_MIN_CALIBER_MM, createObstacleGrid, hullYieldingRecord, setObbShape,
  shellPassesThroughCollisionRecord, shellSparesStoppedRecord,
} from '../world/collision.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus, createGameState, simStep } from '../game/state.ts';

// ---- the law ---------------------------------------------------------------------------------------------------------
const truckKind = 'setpiece_haulpak';
assert.ok(DENSE_SET_PIECE_KINDS.has(truckKind), 'the haul truck is heavy plant');
assert.equal(shellPassesThroughCollisionRecord({ crushable: true, kind: truckKind }), false, 'it stops every round');
assert.equal(shellPassesThroughCollisionRecord({ crushable: true, kind: 'setpiece_lrv' }), true, 'a round breaks the rover and flies on');
assert.equal(hullYieldingRecord({ crushable: true, kind: truckKind }), true, 'a hull may still crush it (its crushMin and keep price the ram)');
assert.equal(SET_PIECE_WRECK_MIN_CALIBER_MM, 20);
for (const caliberMm of [7.62, 12.7, 14.5, undefined]) assert.equal(shellSparesStoppedRecord({ kind: truckKind }, caliberMm), true, `${caliberMm} mm leaves it standing`);
for (const caliberMm of [20, 30, 105, 125]) assert.equal(shellSparesStoppedRecord({ kind: truckKind }, caliberMm), false, `${caliberMm} mm wrecks it`);
for (const kind of ['wallstone', 'crate', 'setpiece_lrv', 'bunker', undefined]) {
  assert.equal(shellSparesStoppedRecord({ kind }, 12.7), false, `${kind}: the floor is heavy plant's only`);
}

const m1 = getSpec('m1a2');
const apfsds = m1.gun.shells[0];
assert.equal(apfsds.type, 'APFSDS');
const TRUCK = { cx: 0, cz: -35, hw: 2.3, hl: 3.95, h: 4.6 };
const FACE_Z = TRUCK.cz - TRUCK.hl;

/** A haul truck across the line at z -35 on ground `base`: its record, a world that rays its south face, the crushes. */
function truckWorld(base, mapId) {
  const record = setObbShape({ min: [0, base - 0.08, 0], max: [0, base + TRUCK.h, 0], crushable: true, crushed: false,
    propIdx: 0, kind: truckKind, crushMin: 4.5, crushKeep: 0.45 }, TRUCK.cx, TRUCK.cz, TRUCK.hw, TRUCK.hl, 0);
  const obstacles = [record];
  const crushes = [];
  const world = {
    mapId,
    getObstacles: () => obstacles,
    queryObstacles: createObstacleGrid(obstacles),
    raycast(origin, dir, maxDist) {
      if (record.crushed || Math.abs(dir.z) < 1e-9) return null;
      const distance = (FACE_Z - origin.z) / dir.z;
      if (distance < 0 || distance > maxDist) return null;
      const x = origin.x + dir.x * distance, y = origin.y + dir.y * distance;
      if (Math.abs(x) > TRUCK.hw || y > base + TRUCK.h) return null;
      return { dist: distance, kind: 'prop', record, point: new Vector3(x, y, FACE_Z), normal: new Vector3(0, 0, -1) };
    },
    crushObstacle(obstacle, directionX, directionZ, speedMps, cause) {
      crushes.push({ obstacle, directionZ, speedMps, cause });
      obstacle.crushed = true;
      return true;
    },
  };
  return { record, crushes, world };
}

// ---- the match authority, run for real --------------------------------------------------------------------------------
const MG_ROUND = { ...apfsds, name: 'M2 ball', type: 'AP', caliberMm: 12.7, velocityMps: 890 };
const probe = createAuthoritativeMatch({ mapId: 'verdant', seed: 1, countdownS: 0,
  players: [{ id: 'probe', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -140, yaw: 0 } }] });
let groundBase = Infinity;
for (let x = -3; x <= 3; x += 1) for (let z = -39; z <= -31; z += 1) groundBase = Math.min(groundBase, probe.heightField.getHeightAt(x, z));
/** A duel across the truck: the gun's main gun loaded with its own rounds, or (mg) with 12.7 mm ball only. */
function authorityDuel(mg) {
  const { record, crushes, world } = truckWorld(groundBase, 'verdant');
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed: 3, countdownS: 0, worldCollision: world,
    players: [
      { id: 'gun', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
      { id: 'behind', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
    ],
  });
  match.onMatchReady();
  if (mg) {
    const gun = match.entityById.get('gun');
    gun.spec = { ...gun.spec, gun: { ...gun.spec.gun, shells: gun.spec.gun.shells.map(() => MG_ROUND) } };
  }
  return { record, crushes, match };
}
{
  // 12.7 mm ball only: every bullet stops on the truck and it stands
  const { record, crushes, match } = authorityDuel(true);
  const fire = new Map([['gun', { throttle: 0, steer: 0, brake: false, fire: true, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
  const impacts = [];
  const seen = new Set();
  for (let i = 0; i < 60 * 10; i++) {
    match.step({ dt: 1 / 60, inputs: fire });
    for (const event of match.snapshot({ tick: i, serverTimeMs: i * 16, viewerId: 'gun', ackInputSeq: 1 }).events) {
      if (seen.has(event)) continue;
      seen.add(event);
      if (event.type === 'shell_impact' && event.surfaceKind === truckKind) impacts.push(event);
    }
  }
  assert.ok(impacts.length >= 2 && impacts.every((event) => event.caliberMm === 12.7), `the authority: 12.7 mm rounds stop on it (${impacts.length})`);
  assert.equal(record.crushed, false, 'the authority: and it stands');
  assert.equal(crushes.length, 0, 'the authority: nothing broke');
}
{
  const { record, crushes, match } = authorityDuel(false);
  const fire = new Map([['gun', { throttle: 0, steer: 0, brake: false, fire: true, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
  const impacts = [], destroyed = [], hitsBehind = [];
  const seen = new Set();
  let brokeStep = -1, impactsBeforeBreak = null;
  for (let i = 0; i < 60 * 20; i++) {
    const before = impacts.length;
    match.step({ dt: 1 / 60, inputs: fire });
    for (const event of match.snapshot({ tick: i, serverTimeMs: i * 16, viewerId: 'gun', ackInputSeq: 1 }).events) {
      if (seen.has(event)) continue;
      seen.add(event);
      if (event.type === 'shell_impact' && event.surfaceKind === truckKind) impacts.push(event);
      if (event.type === 'shell_hit' && event.targetId === 'behind' && event.caliberMm >= 100 && brokeStep < 0) hitsBehind.push(event);
      if (event.type === 'world_prop_destroyed') destroyed.push(event);
    }
    if (brokeStep < 0 && record.crushed) { brokeStep = i; impactsBeforeBreak = { spared: impacts.slice(0, before), breaking: impacts.slice(before) }; }
  }
  assert.ok(brokeStep >= 0, `the authority: a gun round wrecks the haul truck (${impacts.length} impacts on it)`);
  assert.ok(impactsBeforeBreak.spared.every((event) => event.caliberMm < SET_PIECE_WRECK_MIN_CALIBER_MM),
    `the authority: only machine-gun bullets stopped on it before (${impactsBeforeBreak.spared.map((e) => e.caliberMm)})`);
  assert.ok(impactsBeforeBreak.breaking.some((event) => event.caliberMm >= 100 && event.shellType === 'APFSDS'),
    `the authority: the first 120 mm round that stops on it wrecks it (${impactsBeforeBreak.breaking.map((e) => `${e.shellType} ${e.caliberMm}`)})`);
  assert.equal(hitsBehind.length, 0, 'the authority: the tank behind takes no main-gun hit while it stands');
  assert.equal(crushes.length, 1, 'the authority: wrecked once');
  assert.equal(crushes[0].cause, undefined, 'the authority: the world crush (map seam) as a destroyed obstacle');
  assert.ok(crushes[0].directionZ > 0.99, 'the authority: along the round');
  assert.deepEqual(destroyed.map((event) => [event.kind, event.cause]), [[truckKind, 'shell']], 'the authority: replicated as a shell kill of the set piece');
}

// ---- the solo step, run for real --------------------------------------------------------------------------------------
{
  const base = 0;
  const { record, crushes, world } = truckWorld(base, 'verdant');
  const up = new Vector3(0, 1, 0);
  world.heightField = { getHeightAt: () => base, getGroundType: () => 'hard', getNormalAt: () => up };
  const spec = m1, combat = createCombatState(spec), game = createGameState();
  const entity = { id: 'solo-gun', specId: spec.id, spec, isPlayer: false, team: 'player', combat,
    state: createTankState(spec, new Vector3(0, 0, -50), 0),
    input: { throttle: 0, steer: 0, brake: true, fire: true, shellSlot: 0, aimYaw: 0, aimPitch: 0, aimDistance: 300, actionBits: 0 },
    visual: { root: new Group(), gunMuzzleWorld: (out) => out.set(0, 2.2, -45), gunDirWorld: (out) => out.set(0, 0, 1),
      recoilKick() {}, setDestroyed() {} } };
  combat.equipMults = {};
  game.tanks = [entity]; game.allTanks = [entity]; game.tankById.set(entity.id, entity);
  const bus = createBus(() => {});
  const collider = { setSelf() {}, collide: () => false, pendingCrush: [], pendingRams: [], queueRam() {} };
  for (let i = 0; i < 60 * 12 && !record.crushed; i++) simStep(game, bus, world, null, collider);
  assert.equal(record.crushed, true, 'solo: a gun round wrecks the haul truck');
  assert.equal(crushes.length, 1, 'solo: wrecked once');
  assert.equal(crushes[0].cause, 'shell', 'solo: by a shell');
  assert.equal(crushes[0].speedMps, apfsds.velocityMps, `solo: by the 120 mm APFSDS round (${crushes[0].speedMps} m/s)`);
  assert.ok(crushes[0].directionZ > 0.99, 'solo: along the round');
  // a machine-gun bullet that stops on it leaves it standing (the same floor the authority asks)
  const spared = truckWorld(base, 'verdant');
  spared.world.heightField = world.heightField;
  const mgSpec = { ...apfsds, name: 'M2 ball', type: 'AP', caliberMm: 12.7, velocityMps: 890 };
  const gunner = { ...entity, id: 'solo-mg', combat: createCombatState(spec), state: createTankState(spec, new Vector3(0, 0, -50), 0),
    spec: { ...spec, gun: { ...spec.gun, shells: [mgSpec, ...spec.gun.shells.slice(1)] } } };
  gunner.combat.equipMults = {};
  const mgGame = createGameState();
  mgGame.tanks = [gunner]; mgGame.allTanks = [gunner]; mgGame.tankById.set(gunner.id, gunner);
  for (let i = 0; i < 60 * 6; i++) simStep(mgGame, bus, spared.world, null, collider);
  assert.equal(spared.record.crushed, false, 'solo: 12.7 mm rounds stop on it and leave it standing');
  assert.equal(spared.crushes.length, 0, 'solo: nothing broke');
}

console.log('setPieceShellBreak: heavy plant stops every round; a machine-gun bullet leaves it standing; the first gun round '
  + 'that stops on it wrecks it, once, along the round, in the solo step and the match authority (a replicated shell kill)');
