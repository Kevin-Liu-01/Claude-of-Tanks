import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAimController } from './aimController.ts';

let now = 1000;
let blockPath = false;
let shellCards = ['shell'];
const player = {
  id: 'player', team: 'ally', isPlayer: true,
  state: { pos: new THREE.Vector3(), speed: 0, atGunLimit: false, gunLimitSpec: false },
  combat: {
    destroyed: false, eraSpent: new Set(), shellSlot: 0,
    reload: { t: 1, totalS: 6, kind: 'single' },
    magazine: { rounds: 0, capacity: 0 },
  },
  spec: {
    dims: { heightM: 2.5 }, armor: { boundingRadiusM: 4 },
    gun: { shells: [{}] },
  },
  visual: {
    gunMuzzleWorld(out) { out.set(0, 2, 0); },
    gunDirWorld(out) { out.set(0, 0, 1); },
  },
};
const softEnemy = {
  id: 'enemy', team: 'enemy', isPlayer: false,
  state: { pos: new THREE.Vector3(2, 0, 20), speed: 0, yaw: 0, turretYaw: 0, gunPitch: 0 },
  combat: {
    destroyed: false, eraSpent: new Set(), shellSlot: 0,
    reload: { t: 0, totalS: 1 },
  },
  spec: {
    dims: { heightM: 2 }, armor: { boundingRadiusM: 2, collisionShells: {} },
    gun: { shells: [{}] },
  },
  visual: player.visual,
};
const game = { player, tanks: [player, softEnemy] };
const rig = { aimPoint: new THREE.Vector3(0, 2, 100), aimDist: 100, mode: 'CHASE', zoom: 1 };
const controller = createAimController({
  getGame: () => game,
  getRig: () => rig,
  worldRaycast(origin, dir, maxDist) {
    if (!blockPath || maxDist >= 799) return null;
    return {
      point: origin.clone().addScaledVector(dir, 5), normal: null, dist: 5, kind: 'terrain',
    };
  },
  targetVisible: () => true,
  getShellCards: () => shellCards,
  computeDispersion: () => 0.2,
  now: () => now,
});

const soft = controller.raycast(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 100);
assert.equal(soft.kind, 'tank-soft');
assert.equal(soft.dist, 20);

const frame = {
  singleReticle: false,
  point: new THREE.Vector3(),
  distM: 0,
  dispersionRadM: 0,
  gunLimitSpec: false,
  reload: { t: 0, totalS: 0 },
  magazine: { rounds: 0, capacity: 0 },
  shellSlot: 0,
  shells: null,
  zoom: 1,
  gunDistM: 0,
  gunTargetId: null,
  gunMarker: new THREE.Vector3(),
  blockedDistM: null,
  blockedLabel: false,
  penRatio: null,
};
blockPath = true;
controller.update(frame);
assert.equal(frame.blockedDistM, 5);
assert.equal(frame.blockedLabel, false);
assert.deepEqual(frame.gunMarker.toArray(), [0, 2, 100]);
assert.deepEqual(frame.shells, ['shell']);
now += 501;
controller.update(frame);
assert.equal(frame.blockedLabel, true, 'continuous close obstruction gains the delayed label');

const muzzle = new THREE.Vector3();
const bore = new THREE.Vector3();
const target = new THREE.Vector3();
assert.equal(controller.gunCenterRay(player, rig.aimPoint, muzzle, bore, target), 100);
assert.deepEqual(muzzle.toArray(), [0, 2, 0]);
assert.deepEqual(bore.toArray(), [0, 0, 1]);
assert.deepEqual(target.toArray(), [0, 2, 100]);
assert.equal(controller.muzzlePathBlockDist(muzzle, target, 0.2), 5);

// Dispersion describes possible shell spread, not the physical centerline of
// the gun. A lower spread-fringe ray used to create false PATH BLOCKED alerts
// whenever the aim circle grazed terrain while the bore itself was clear.
const clearBoreController = createAimController({
  getGame: () => game,
  getRig: () => rig,
  worldRaycast(origin, dir) {
    if (dir.y >= -0.001) return null;
    return {
      point: origin.clone().addScaledVector(dir, 5), normal: null, dist: 5, kind: 'terrain',
    };
  },
  targetVisible: () => true,
  getShellCards: () => ['shell'],
  computeDispersion: () => 8,
  now: () => now,
});
assert.equal(clearBoreController.muzzlePathBlockDist(muzzle, target, 8), null,
  'a clear physical bore must not inherit a false warning from shell dispersion');

// The controller can be acquired during covered battle preparation while the
// shared session still has no live player. That lifecycle edge must stay a
// harmless no-op instead of requiring a composition-root assertion.
const idleFrame = { ...frame, point: frame.point.clone(), gunMarker: frame.gunMarker.clone() };
const idleController = createAimController({
  getGame: () => ({ player: null, tanks: [] }),
  getRig: () => rig,
  worldRaycast: () => null,
  targetVisible: () => false,
  getShellCards: () => [],
  computeDispersion: () => 0,
});
assert.doesNotThrow(() => idleController.update(idleFrame),
  'battle preparation without a live player is a valid lifecycle state');
assert.throws(
  () => idleController.gunCenterRay({ ...player, visual: null }, rig.aimPoint, muzzle, bore, target),
  /active tank visual/,
  'physical-bore queries still fail clearly when a caller violates the live-visual contract',
);

// A real pending network selection changes only the requested HUD card. Its
// old snapshot's canonical reload/ammo remain untouched until authority agrees.
shellCards = [{ type: 'APFSDS' }, { type: 'ATGM' }, { type: 'HE' }];
player._networkShellSlot = 0;
player.input = { shellSlot: 1 };
player.combat.ammo = [24, 4, 0];
player.combat.reload.t = 0;
controller.update(frame);
assert.equal(frame.shellSlot, 1);
assert.equal(frame.ammoSelectionPending, true);
assert.equal(frame.reload.t, 0, 'HUD must not fabricate an authoritative countdown');
assert.equal(frame.shells[1].count, 4);
assert.equal(player.combat.shellSlot, 0);
assert.equal(player.input.shellSlot, 1);
assert.deepEqual(player.combat.ammo, [24, 4, 0]);
player._networkShellSlot = 1;
player.combat.shellSlot = 1;
player.combat.reload.t = 2.8;
controller.update(frame);
assert.equal(frame.ammoSelectionPending, false);
assert.equal(frame.reload.t, 2.8, 'matching authority supplies the real remaining load time');
player._networkAmmoSelectionPending = true;
controller.update(frame);
assert.equal(frame.ammoSelectionPending, true,
  'an explicit outstanding cancellation cannot flash ready merely because slots match');
player._networkAmmoSelectionPending = false;
player._networkShellSlot = 0;
player.combat.shellSlot = 0;
player.combat.ammo[1] = 0;
controller.update(frame);
assert.equal(frame.ammoSelectionPending, false, 'depleted/denied request clears presentation');
assert.equal(frame.shellSlot, 0, 'rejected request returns highlight to authoritative ammo');
frame.ammoSelectionPending = true;
idleController.update(frame);
assert.equal(frame.ammoSelectionPending, false, 'an absent player clears stale presentation state');

console.log('aimController.selftest: shared camera/bore aim owner passed');
