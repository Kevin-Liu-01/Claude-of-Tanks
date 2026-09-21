import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTankState } from '../sim/movement.ts';
import { verifyGunCradleSeats } from './gunCradleSeats.test-support.mjs';

export const hasExplicitFixedLauncher = spec => spec.gun.fixedLaunchCanisters === true
  && Array.isArray(spec.gun.launcherMuzzles) && spec.gun.launcherMuzzles.length > 0;

function visibleMeshes(root) {
  const meshes = [];
  root.traverseVisible(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.shadowOnly || mesh.userData.authoredShadowProxy) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.every(material => material.visible && material.colorWrite && material.opacity > 0)) meshes.push(mesh);
  });
  return meshes;
}

function mouthStock(gun, meshes, axis, radius) {
  const cast = (start, direction, far) => new THREE.Raycaster(
    gun.localToWorld(new THREE.Vector3(...start)),
    new THREE.Vector3(...direction).transformDirection(gun.matrixWorld), 0, far,
  ).intersectObjects(meshes, false)[0];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const hit = cast([axis.x + dx * radius * 1.23, axis.y + dy * radius * 1.23, axis.z + .03], [0, 0, -1], .06);
    assert(hit && hit.object.name === 'gunMount', 'actual annular mouth remains pitching structural stock');
    assert(Math.abs(gun.worldToLocal(hit.point.clone()).z - axis.z) < .001, 'physical terminal rim coincides with firing anchor');
  }
  for (const depth of [.08, .20]) {
    const hit = cast([axis.x, axis.y, axis.z - depth], [1, 0, 0], radius + .03);
    assert(hit, 'actual sleeve continues behind each terminal mouth');
    assert(Math.abs(gun.worldToLocal(hit.point.clone()).x - axis.x - radius) < .001,
      'finite inner sleeve preserves declared clear bore; no floating rim or filled opening');
  }
}

/** Fixed explicit batteries own physical terminal mouths on gunG, not a
 * fictitious recoil barrel. Legacy gun.muzzles configurations are unchanged. */
export function verifyFixedLauncherSeats(tank, spec) {
  assert(hasExplicitFixedLauncher(spec), 'requires explicit fixed-canister axes');
  const root = tank.root, gun = root.getObjectByName('rig_gun'), recoil = root.getObjectByName('rig_recoil');
  root.updateMatrixWorld(true);
  const axes = spec.gun.launcherMuzzles, tips = [];
  root.traverse(object => { if (/^rig_launcher_tip_\d+$/.test(object.name)) tips.push(object); });
  assert.equal(tips.length, axes.length, 'one actual anchor for every declared physical tube');
  assert.equal(new Set(axes.map(axis => JSON.stringify(axis))).size, axes.length, 'distinct physical tube axes');
  assert(spec.gun.shells.every(round => round.launcherTubes === axes.length), 'weapon census shares the actual fixed rack');
  assert.equal(visibleMeshes(recoil).length, 0, 'fixed explicit battery has no fictitious recoiling cannon');
  const meshes = visibleMeshes(gun), radius = spec.gun.caliberMm / 2000;
  axes.forEach((axis, index) => {
    const tip = root.getObjectByName(`rig_launcher_tip_${index}`);
    assert(tip && tip.parent === gun, 'each terminal anchor belongs directly to pitching gunG');
    const local = new THREE.Vector3(axis.x, axis.y, axis.z);
    assert(tip.position.distanceTo(local) < 1e-8, 'actual tip agrees with declared physical axis');
    const expected = gun.localToWorld(local);
    assert(tank.gunMuzzleWorld(new THREE.Vector3(), index).distanceTo(expected) < 1e-8,
      'live firing API returns each posed terminal mouth');
    mouthStock(gun, meshes, axis, radius);
  });
  const cradle = verifyGunCradleSeats(root);
  assert(cradle && cradle.stations === 2 && cradle.rays === 18,
    'fixed battery connects through two actual finite receiving supports');
  return { tips: tips.length, rimRays: axes.length * 4, sleeveRays: axes.length * 2, cradle };
}

export function verifyFixedLauncherNoRecoil(tank, spec, pitchDeg) {
  const gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
  const state = createTankState(spec, new THREE.Vector3(), 0); state.gunPitch = pitchDeg * Math.PI / 180;
  tank.syncFromState(state, 0); tank.root.updateMatrixWorld(true);
  const before = gun.matrixWorld.clone(), rest = recoil.matrix.clone();
  for (let index = 0; index < spec.gun.launcherMuzzles.length; index++) {
    assert.equal(tank.recoilKick(0, 1, index), index, 'firing selects the requested fixed tube');
    tank.syncFromState(state, .035); tank.root.updateMatrixWorld(true);
    assert(gun.matrixWorld.equals(before) && recoil.matrix.equals(rest), 'fixed launch never moves the pack or empty recoil frame');
  }
}

export function fixedLauncherNegatives(tank, spec) {
  const gun = tank.root.getObjectByName('rig_gun'), mount = gun.getObjectByName('gunMount');
  const tip = gun.getObjectByName('rig_launcher_tip_0');
  const support = tank.root.getObjectByName('turretEquipment') ?? tank.root.getObjectByName('turretDetail');
  assert(support, 'actual fixed receiving support mesh exists');
  assert.throws(() => verifyFixedLauncherSeats(tank, { ...spec, gun: { ...spec.gun, fixedLaunchCanisters: false } }), assert.AssertionError);
  gun.remove(tip);
  try { assert.throws(() => verifyFixedLauncherSeats(tank, spec), assert.AssertionError, 'missing actual terminal fails'); }
  finally { gun.add(tip); }
  tip.position.x += .04;
  try { assert.throws(() => verifyFixedLauncherSeats(tank, spec), assert.AssertionError, 'shifted terminal fails'); }
  finally { tip.position.x -= .04; }
  mount.position.z += .10;
  try { assert.throws(() => verifyFixedLauncherSeats(tank, spec), assert.AssertionError, 'mouth stock detached from firing tip fails'); }
  finally { mount.position.z -= .10; }
  support.position.y += .30;
  try { assert.throws(() => verifyFixedLauncherSeats(tank, spec), assert.AssertionError, 'disconnected receiving support fails'); }
  finally { support.position.y -= .30; tank.root.updateMatrixWorld(true); }
}
