import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const MERKAVA_IDS = [
  'merkava1b', 'merkava2b', 'merkava2d',
  'merkava3c', 'merkava3d', 'merkava4b',
];

for (const id of MERKAVA_IDS) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const gun = visual.root.getObjectByName('rig_gun');
  assert.ok(gun, `${id}: articulated gun rig exists`);
  const mount = visual.root.getObjectByName('gunMountDark');
  assert.ok(mount?.geometry, `${id}: gun-owned housing detail exists`);
  mount.geometry.computeBoundingBox();
  const { min, max } = mount.geometry.boundingBox;
  const verticalSpan = max.y - min.y;
  assert.ok(verticalSpan < 1.2,
    `${id}: gun-housing fittings stay local (vertical span ${verticalSpan.toFixed(3)} m)`);
  assert.ok(Math.max(Math.abs(min.y), Math.abs(max.y)) < 0.8,
    `${id}: no fastener becomes a vertical line outside the mantlet`);

  for (const name of ['gunMount', 'gunMountDark']) {
    const component = visual.root.getObjectByName(name);
    assert.ok(component?.geometry, `${id}: ${name} exists`);
    let owner = component.parent;
    while (owner && owner !== gun) owner = owner.parent;
    assert.equal(owner, gun, `${id}: ${name} is owned by rig_gun`);
  }

  // Exercise the same raised-gun pose used by the surface-studio audit. A
  // point at the housing mouth must move in world space for every Merkava;
  // parked turret geometry would remain fixed and fail this assertion.
  mount.geometry.computeBoundingBox();
  const probeLocal = mount.geometry.boundingBox.getCenter(new THREE.Vector3());
  probeLocal.z = mount.geometry.boundingBox.max.z;
  visual.root.updateMatrixWorld(true);
  const level = mount.localToWorld(probeLocal.clone());
  gun.rotation.x = -THREE.MathUtils.degToRad(20);
  visual.root.updateMatrixWorld(true);
  const raised = mount.localToWorld(probeLocal.clone());
  assert.ok(level.distanceTo(raised) > 0.05,
    `${id}: complete gun housing follows a 20-degree elevation command`);

  if (id === 'merkava4b') {
    const hood = gun.userData.merkava4bArticulatedGunHoodReceipt;
    assert.ok(hood, 'merkava4b: former fixed gun-hood brick has an ownership receipt');
    assert.equal(hood.revision, 'complete-moving-gun-assembly-r1');
    assert.equal(hood.owner, 'rig_gun');
    assert.equal(hood.movesWithGunPitch, true);
    const expectedTopBounds = [[-0.1, 0.5, 2.05], [0.1, 0.5, 3.15]];
    for (const [bound, expected] of [
      [hood.turretLocalTopSurfaceBounds.min, expectedTopBounds[0]],
      [hood.turretLocalTopSurfaceBounds.max, expectedTopBounds[1]],
    ]) {
      assert.ok(bound.every((value, axis) => Math.abs(value - expected[axis]) < 1e-9),
        'merkava4b: receipt identifies the exact owner-marked top slab');
    }

    const fixedTurret = visual.root.getObjectByName('turret');
    const positions = fixedTurret.geometry.getAttribute('position');
    let fixedFrontCorners = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      if (Math.abs(Math.abs(positions.getX(vertex)) - 0.1) < 1e-5
        && Math.abs(positions.getY(vertex) - 0.5) < 1e-5
        && Math.abs(positions.getZ(vertex) - 3.15) < 1e-5) fixedFrontCorners++;
    }
    assert.equal(fixedFrontCorners, 0,
      'merkava4b: marked hood corners no longer remain in the fixed turret mesh');
  }

  visual.dispose?.();
}

console.log('merkavaGunCradle.selftest: all six complete gun housings elevate with rig_gun');
