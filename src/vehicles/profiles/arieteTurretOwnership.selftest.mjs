import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

// Gallery packets from 2026-09-29. These are actual rendered face bounds in
// rig_hull's neutral frame, not metadata assertions or unstable face indices.
const patches = [
  ['right fore bin', [1.1704, 1.7864, 1.023], [1.5796, 2.1736, 1.023]],
  ['left aft bin', [-1.606, 1.7864, -.4026], [-1.606, 2.2726, .2706]],
  ['left fore bin', [-1.606, 1.7864, .3674], [-1.606, 2.1736, .9966]],
  ['left stack', [-.9405, 1.74812, -.03388], [-.9405, 2.65188, .16588]],
  ['left cheek ramp', [-.935, 1.7325, 1.155], [-.528, 2.255, 1.826]],
];
function descendantOf(object, parent) {
  for (let at = object; at; at = at.parent) if (at === parent) return true;
  return false;
}
function faceMatches(root, frame, min, max) {
  const matches = [];
  const frameInverse = frame.matrixWorld.clone().invert();
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.shadowOnly) return;
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const matrix = frameInverse.clone().multiply(mesh.matrixWorld);
    for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
      const vertices = [0, 1, 2].map(k => new THREE.Vector3()
        .fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(matrix));
      const bounds = new THREE.Box3().setFromPoints(vertices);
      if (!bounds.min.toArray().every((v, k) => Math.abs(v - min[k]) < .0001)
        || !bounds.max.toArray().every((v, k) => Math.abs(v - max[k]) < .0001)) continue;
      const centroid = vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1 / 3);
      matches.push({ mesh, point: mesh.worldToLocal(frame.localToWorld(centroid)) });
    }
  });
  return matches;
}

for (const id of ['ariete_c1', 'ariete_c2']) {
  await ensureInteriorFills(id);
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality });
    const hull = tank.root.getObjectByName('rig_hull');
    const turret = tank.root.getObjectByName('rig_turret');
    tank.root.updateMatrixWorld(true);
    // Old cached/generated hull fills must not recreate the fixed towers.
    for (const name of ['hull', 'hullInteriorFill']) {
      const mesh = hull.getObjectByName(name);
      if (!mesh) continue;
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        assert.ok(positions.getY(i) < 2.075,
          `${id}/${quality}: ${name} must not contain the former turret towers`);
      }
    }
    const samples = [];
    for (const [label, min, max] of patches) {
      const matches = faceMatches(tank.root, hull, min, max);
      assert.ok(matches.length, `${id}/${quality}: ${label} survives the ownership repair`);
      for (const sample of matches) {
        assert.ok(descendantOf(sample.mesh, turret), `${id}/${quality}: ${label} cannot remain on the hull`);
        samples.push({ ...sample, label, turretPoint: turret.worldToLocal(sample.mesh.localToWorld(sample.point.clone())) });
      }
    }
    // The lid used to be buried underneath both its own box and the crown.
    const rayOrigin = hull.localToWorld(new THREE.Vector3(-.6215, 3.2, .022));
    const ray = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0));
    const lid = ray.intersectObject(tank.root, true).find(hit =>
      hit.object.isMesh && !hit.object.userData.shadowOnly && hit.object.visible);
    assert.ok(lid && descendantOf(lid.object, turret), `${id}/${quality}: visible roof cover rotates`);
    const lidHeight = hull.worldToLocal(lid.point.clone()).y;
    assert.ok(Math.abs(lidHeight - 2.5465) < .001,
      `${id}/${quality}: cover is visible above the crown (actual ${lidHeight})`);

    const fixedDeck = hull.localToWorld(new THREE.Vector3(0, 1.76, -2.6));
    for (const degrees of [-66, -8, 2, 90, 180]) {
      turret.rotation.y = THREE.MathUtils.degToRad(degrees);
      tank.root.updateMatrixWorld(true);
      for (const sample of samples) {
        const actual = sample.mesh.localToWorld(sample.point.clone());
        const expected = turret.localToWorld(sample.turretPoint.clone());
        assert.ok(actual.distanceTo(expected) < 1e-6, `${id}/${quality}: ${sample.label} follows yaw ${degrees}`);
      }
      assert.ok(hull.localToWorld(new THREE.Vector3(0, 1.76, -2.6)).distanceTo(fixedDeck) < 1e-6,
        `${id}/${quality}: chassis stays fixed during yaw`);
    }
    tank.dispose();
  }
}
console.log('arieteTurretOwnership: marked bins, stack, fairing and visible roof lid follow both prototype turrets at high/low quality');
