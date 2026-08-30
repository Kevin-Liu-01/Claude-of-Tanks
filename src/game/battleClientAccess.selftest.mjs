import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBattleClientAccess } from './battleClientAccess.ts';

let attempts = 0;
let aimUpdates = 0;
const terrainHit = { kind: 'terrain', dist: 3 };
const dependencies = {
  worldRaycast: () => terrainHit,
};
const runtime = {
  createAimController: () => ({
    raycast: () => ({ kind: 'tank', dist: 2 }),
    gunCenterRay: () => 11,
    muzzlePathBlockDist: () => 12,
    update: () => { aimUpdates += 1; },
  }),
  computeDispersionRadM: () => 1,
  shotRecoilScale: () => 2,
  tankPoseFromState: () => 3,
  traceTank: () => 4,
  selectShell: () => 5,
  resolveShellHit: () => 6,
  createCombatState: () => 7,
  repairAllModules: () => 8,
  magazineReloadDenialReason: () => 'MAGAZINE_FULL',
  startMagazineReload: () => 9,
  createShell: () => 10,
  activateSpecialAction: () => 13,
  guidedMissileSlot: () => 14,
  specialActionKind: () => 15,
  isPostwarVehicleEra: () => 16,
};
const access = createBattleClientAccess(
  () => dependencies,
  async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('transient transfer');
    return runtime;
  },
);

assert.equal(access.isReady(), false);
assert.equal(access.aimController.raycast(
  new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 10,
), terrainHit, 'garage raycast uses the terrain fallback without loading combat');
access.aimController.update({});
assert.equal(aimUpdates, 0, 'preload-only aim updates fail closed');
assert.throws(() => access.createShell(), /not ready/);
await assert.rejects(access.preload(), /transient transfer/);
await access.preload();
assert.equal(attempts, 2, 'a rejected battle transfer remains retryable');
assert.equal(access.isReady(), true);
assert.equal(access.computeDispersionRadM(), 1);
assert.equal(access.magazineReloadDenialReason(), 'MAGAZINE_FULL');
assert.equal(access.createShell(), 10);
assert.equal(access.guidedMissileSlot(), 14);
assert.equal(access.shellAmmunitionCapacity({ type: 'HE' }), 12);
assert.equal(access.hasAmmunition({ ammo: [0, 2] }, 1), true);
assert.equal(access.aimController.raycast(
  new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 10,
).kind, 'tank');
access.aimController.update({});
assert.equal(aimUpdates, 1);

console.log('battleClientAccess.selftest: garage isolation, retry and proxy forwarding pass');
