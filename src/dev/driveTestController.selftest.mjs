import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDriveTestController } from './driveTestController.ts';

function makeTank(id, team, z, isPlayer = false) {
  const state = {
    pos: new THREE.Vector3(0, 0, z),
    yaw: 0,
    speed: 0,
    turretYaw: 0,
    gunPitch: 0,
    bloomF: 1,
  };
  const visual = {
    syncCount: 0,
    destroyedCount: 0,
    gunPivotWorld(out) { out.copy(state.pos).add(new THREE.Vector3(0, 1, 0)); },
    gunMuzzleWorld(out) { out.copy(state.pos).add(new THREE.Vector3(0, 1, 0)); },
    gunDirWorld(out) { out.set(0, 0, 1); },
    syncFromState() { this.syncCount++; },
    setDestroyed() { this.destroyedCount++; },
  };
  return {
    id,
    specId: id,
    team,
    isPlayer,
    state,
    combat: {
      destroyed: false,
      shellSlot: 0,
      reload: { t: 0 },
      hp: 100,
      fire: { burning: false },
    },
    spec: {
      dims: { heightM: 3 },
      armor: { boundingRadiusM: 5 },
      gun: { baseAccuracy: 0.3, shells: [{
        type: 'APFSDS', name: 'test dart', caliberMm: 120, velocityMps: 1600,
      }] },
    },
    visual,
    input: { aimPoint: new THREE.Vector3(0, 1.5, 100), fire: false },
  };
}

const player = makeTank('player', 'ally', 0, true);
const ally = makeTank('ally', 'ally', 40);
const enemy = makeTank('enemy', 'enemy', 100);
const game = {
  phase: 'battle',
  timeS: 0,
  player,
  tanks: [player, ally, enemy],
  tankById: new Map([[player.id, player], [ally.id, ally], [enemy.id, enemy]]),
  shells: [],
  nextShellId: 1,
};
const events = [];
const rigCalls = [];
let resetPoses = 0;
let resetAccumulator = 0;
const controller = createDriveTestController({
  getGame: () => game,
  getWorld: () => ({
    heightField: { getHeightAt: () => 0 },
    raycast: () => null,
  }),
  getRig: () => ({
    aimDist: 100,
    snapSniper: (...args) => rigCalls.push(args),
  }),
  getCollider: () => ({ id: 'collider' }),
  bus: { emit: (type, payload) => events.push({ type, payload }) },
  input: { isDown: () => false },
  aimController: {
    gunCenterRay: (_player, _aimPoint, origin, direction, target) => {
      origin.set(0, 1, 0);
      direction.set(0, 0, 1);
      target.set(0, 1.5, 100);
      return 100;
    },
    muzzlePathBlockDist: (_origin, target) => target.z === 100 ? null : 25,
  },
  debugFlags: { forceFire: true },
  playerShellLog: [],
  heightField: { getHeightAt: () => 0 },
  simStep: (state) => { state.timeS += 1 / 60; },
  resetPresentationPoses: () => { resetPoses++; },
  resetSimAccumulator: () => { resetAccumulator++; },
});

assert.deepEqual(controller.aimAtNearest(), { id: 'enemy', distM: Math.hypot(100, 0.5) });
assert.equal(controller.aimTargetId, 'enemy');
assert.equal(rigCalls.length, 1, 'nearest target selection must use the real rig port');
assert.equal(controller.aimState().blockedDistM, null,
  'aim-error scratch must not overwrite the controller-owned muzzle target');

const time = controller.fastForward(2 / 60);
assert.equal(time, 2 / 60);
assert.equal(player.input.fire, true, 'force-fire must follow the rendered drive-test contract');
assert.equal(player.visual.syncCount, 2);
assert.equal(enemy.visual.syncCount, 2);
assert.equal(resetPoses, 1);
assert.equal(resetAccumulator, 1);

controller.slayEnemies();
assert.equal(enemy.combat.destroyed, true);
assert.equal(enemy.visual.destroyedCount, 1);
assert.equal(ally.combat.destroyed, false, 'test victory must never destroy allied tanks');
assert.deepEqual(events.map((event) => event.type), ['tank:destroyed']);

controller.resetAim();
assert.equal(controller.aimTargetId, null);
assert.throws(() => createDriveTestController({}), /every runtime port/);

console.log('driveTestController.selftest: targeting, stepping and team-safe victory pass');
