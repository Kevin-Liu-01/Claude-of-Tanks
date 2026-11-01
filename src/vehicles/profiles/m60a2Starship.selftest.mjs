import {assertHollowMuzzle} from '../../../tools/physical-muzzle.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShell, guideShellToward } from '../../sim/ballistics.ts';
import { createCombatState, startReload } from '../../sim/damage.ts';
import {
  SPECIAL_ACTION_KINDS,
  createSpecialActionState,
  specialActionKind,
} from '../../sim/specialActions.ts';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const spec = getSpec('m60a2');
assert.equal(spec.gun.caliberMm, 152, 'Starship retains the 152 mm gun/launcher');
assert.equal(spec.gun.shells.every((round) => round.caliberMm === 152), true,
  'Starship never inherits the donor Patton 105 mm ammunition');

const missileSlot = spec.gun.shells.findIndex((round) => round.guided === true);
assert.notEqual(missileSlot, -1, 'MGM-51C Shillelagh is present in the launcher loadout');
const missile = spec.gun.shells[missileSlot];
assert.match(missile.name, /MGM-51C Shillelagh/i);
assert.equal(missile.count, 10, 'Starship carries its dedicated missile allotment');
assert.equal(missile.soundProfile, 'shillelagh-launch');
assert.equal(specialActionKind(spec), SPECIAL_ACTION_KINDS.GUIDED_MISSILE,
  'the ATGM action selects the Starship missile channel');
assert.equal(createSpecialActionState(spec).missileSlot, missileSlot);
assert.ok(spec.armor.modules.some((module) => module.module === 'missileRack'),
  'combat anatomy exposes the launcher missile stowage as a damageable module');

const guidedShell = createShell(
  missile, 'm60a2', true, new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 60,
);
const guidedSpeed = guidedShell.vel.length();
assert.equal(guideShellToward(guidedShell, new THREE.Vector3(20, 0, 80), 1 / 60), true);
assert.ok(guidedShell.vel.x > 0, 'the Shillelagh steers toward the authority-owned sight point');
assert.ok(Math.abs(guidedShell.vel.length() - guidedSpeed) < 1e-9,
  'guided steering preserves the authored missile speed');

const conventionalSlot = spec.gun.shells.findIndex(
  (round) => round.type === 'HEAT' && round.guided !== true,
);
assert.notEqual(conventionalSlot, -1, 'Starship retains a conventional 152 mm HEAT-MP round');
const combat = createCombatState(spec);
combat.modules.missileRack.state = 'yellow';
combat.shellSlot = conventionalSlot;
startReload(combat, spec);
assert.equal(combat.reload.totalS, spec.gun.shells[conventionalSlot].reloadS,
  'missile-rack damage does not penalize conventional HEAT-MP loading');
combat.shellSlot = missileSlot;
startReload(combat, spec);
assert.equal(combat.reload.totalS, missile.reloadS * 1.4,
  'missile-rack damage applies only to the guided Shillelagh cycle');

const tank = createTank('m60a2', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  assert.ok(hullRig, 'Starship retains the canonical hull rig');
  assert.ok(turretRig, 'Starship retains the canonical turret rig');
  assert.ok(gunRig, 'Starship retains the canonical gun rig');
  // Release 266 (the M60 batch, Main's ruling 2026-10-28): the M60s are rebuilt at true size off the owner's models
  // (pattonCast.ts buildM60CastSteps), so the 0.9 compact envelope and the old builder's ERA, side-cassette, glacis,
  // searchlight and shoulder-closure receipts are gone with it; the rebuilt hull's closure is the fleet's contiguity
  // ledger's, its gun's clearance pattonGunClearance's.
  assert.equal(hullRig.scale.x, 1, 'Starship hull at true size');
  assert.equal(turretRig.scale.x, 1, 'Starship turret, launcher and equipment at true size');
  for (const key of ['m60CompactScaleReceipt', 'm60SideCassetteReceipt', 'm60GlacisArmorReceipt']) {
    assert.equal(hullRig.userData[key], undefined, `the retired builder's ${key} is not published`);
  }
  assert.equal(turretRig.userData.m60a2EraGridReceipt, undefined, 'the rebuilt Starship carries no turret ERA (the owner\'s model)');

  // Owner 2026-09-22 ("holes are added, not carved; the muzzle marker is the tube end"): the firing anchor sits on the
  // 152 mm launcher's real tube end; the marker, the authority barrel and the flush terminal-cap seat meet on its face.
  tank.root.updateMatrixWorld(true);
  const muzzleWorld = tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3());
  const tubeEndZ = new THREE.Box3().setFromObject(tank.root.getObjectByName('gun')).max.z;
  assert.ok(Math.abs(muzzleWorld.z - tubeEndZ) < 1e-3, `muzzle marker is the tube end: ${muzzleWorld.z} vs ${tubeEndZ}`);
  const authorityMuzzleZ = spec.armor.turretPivot[2] + spec.armor.gunPivot[2] + spec.armor.gunBarrel.lengthM;
  assert.ok(Math.abs(authorityMuzzleZ - tubeEndZ) < 2e-3,
    `authority barrel (turretPivot + gunPivot + gunBarrel.lengthM) reaches the same tube end: ${authorityMuzzleZ} vs ${tubeEndZ}`);
  const mouth = tank.root.getObjectByName('muzzleBoreShadowFallback');
  assert.ok(mouth?.userData.muzzleSeatReceipt, 'the added hole publishes its seat');
  assert.ok(mouth.userData.muzzleSeatReceipt.markerGapM < 0.003, 'the marker is on the launcher\'s face, so no clamped throat is needed');
  assert.ok(!tank.root.getObjectByName('muzzleBoreShadowFallbackThroat'), 'no dark throat sleeve stands proud of the launcher');
  const seat = mouth.userData.muzzleSeatReceipt;
  assert.ok(Math.abs(seat.innerRadiusM - .076) < 1e-9, 'true 152 mm bore');
  assert.ok(seat.supportOuterRadiusM > seat.innerRadiusM, 'the bore sits inside the launcher\'s lip');
  assertHollowMuzzle(tank.root);
  const lining = mouth.getObjectByName('muzzleBoreInnerWallAndBackstop');
  assert.ok(Math.abs(lining.getWorldScale(new THREE.Vector3()).x * .076 - .076) < 1e-6, 'true scale keeps the 152 mm bore in world space');
} finally {
  tank.dispose();
}

console.log('m60a2Starship.selftest: true-size rebuilt Starship, its 152 mm muzzle seat and the Shillelagh channel verified');
