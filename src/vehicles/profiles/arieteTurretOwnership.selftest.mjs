import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

// Actual rendered face bounds in rig_hull's neutral frame, not metadata assertions or unstable face indices.
// 269 (the owner, 2026-11-03: "make the c1 arietee proto annd c2 ariete hhave completeely new turrets"): the old turret's
// bins, stack and cheek ramp are gone with it; the patches are the new turret's (profiles/arieteProtoTurret.ts, shared
// by both marks): its right wall, its left cheek face, the rear stowage box's rear face and the two rear-roof eave boxes,
// measured on the r269 build (r269/turrets/scripts/patchprobe.mjs), identical at high and low quality.
const patches = [
  ['right wall', [-1.408, 1.87, -2.255], [-1.408, 2.486, 0.385]],
  ['left cheek face', [0.605, 1.8065, 1.51119], [1.353, 2.40612, 2.2518]],
  ['rear stowage box', [-1.276, 1.969, -2.805], [1.276, 2.442, -2.805]],
  ['right eave box', [-1.375, 2.607, -2.2], [-1.122, 2.64, -1.155]],
  ['left eave box', [1.122, 2.607, -2.145], [1.375, 2.64, -1.265]],
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

for (const id of ['c1_ariete_proto_serie1', 'c2_ariete_proto']) {
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
    // 269: the roof's crown between the hatches is the first thing a ray down meets there, on the turret (it was the old
    // turret's roof cover, buried under its box and the crown before release 231)
    const rayOrigin = hull.localToWorld(new THREE.Vector3(0, 3.2, -.44));
    const ray = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0));
    const lid = ray.intersectObject(tank.root, true).find(hit =>
      hit.object.isMesh && !hit.object.userData.shadowOnly && hit.object.visible);
    assert.ok(lid && descendantOf(lid.object, turret), `${id}/${quality}: visible roof rotates`);
    const lidHeight = hull.worldToLocal(lid.point.clone()).y;
    // (269: the new roof's crown, 0.86 m over the ring seat in the builder's frame: (1.44 + 0.86) x 1.10)
    assert.ok(Math.abs(lidHeight - 2.53) < .001,
      `${id}/${quality}: the roof's crown is visible (actual ${lidHeight})`);

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
console.log('arieteTurretOwnership: the new turrets\' walls, cheek, rear box, roof boxes and visible roof follow both prototype turrets at high/low quality');
