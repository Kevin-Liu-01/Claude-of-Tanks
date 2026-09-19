import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

// Independent source Object_29 sections and Object_40 outer-plane calipers.
// Original source and measurement hashes live in the Kurg reference packet.
function visibleHit(root, origin, direction) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction))
    .intersectObject(root, true).find(hit => {
      for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
      const material = Array.isArray(hit.object.material)
        ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
      return material?.visible !== false && material?.colorWrite !== false;
    });
}
function verifyMasts(root) {
  for (const [x, z, y, radius] of [
    [-.019845, -2.66298, 3.85, .0409],
    [-.638995, -2.84023, 3.98, .0186],
    [-.783995, -1.23913, 3.85, .01605],
    [-.292545, -1.22183, 3.61, .0865],
  ]) {
    const hit = visibleHit(root, [x + .15, y, z], [-1, 0, 0]);
    assert(hit, 'source-measured upper stock must exist');
    assert.equal(hit.object.name, 'turretDetail');
    assert(Math.abs(hit.point.x - (x + radius)) < .0017, 'actual exposed radius follows source section');
  }
  for (const [x, z, top] of [[-.019845,-2.66298,3.93775],[-.638995,-2.84023,4.11555],[-.783995,-1.23913,4.17415],[-.292545,-1.22183,3.69945]]) {
    // Tiny off-axis samples avoid the exact shared axial fan edge.
    const hit = visibleHit(root, [x + .0001, 4.5, z + .0001], [0, -1, 0]);
    assert(hit && Math.abs(hit.point.y - top) < .002, 'four independent source crown heights');
  }
  for (const x of [-.87,.87]) assert.equal(visibleHit(root, [x + .10,3.9,-2.20],[-1,0,0])?.point.x > x - .02, false,
    'former generic whip stations remain clear');
}
let count = 0;
for (const quality of ['high','low']) {
  const tank = createTank('kurganets25_x', null, { proceduralOnly:true, quality, geometryReceipt:true, camoSeed:4242 });
  try {
    tank.root.updateMatrixWorld(true);verifyMasts(tank.root);
    for (const side of [-1,1]) for (const z of [-2.82,-1.70,-.58,.54,1.66,2.76]) for (const y of [1.08,1.62]) {
      const hit = visibleHit(tank.root,[side*3,y,z],[-side,0,0]);
      assert(hit && Math.abs(Math.abs(hit.point.x)-2.0645)<.001, 'flush source side armor, no fabricated overhanging bolts');count++;
    }
    const detail=tank.root.getObjectByName('turretDetail'),original=detail.position.x;
    try {detail.position.x+=.04;tank.root.updateMatrixWorld(true);assert.throws(()=>verifyMasts(tank.root),/actual exposed radius|must exist/);}
    finally {detail.position.x=original;tank.root.updateMatrixWorld(true);}
    verifyMasts(tank.root);
  } finally {tank.dispose();}
}
console.log(`kurganetsRoofFittings: HIGH/LOW four measured masts, source side planes (${count} rays), and displacement negative pass`);
