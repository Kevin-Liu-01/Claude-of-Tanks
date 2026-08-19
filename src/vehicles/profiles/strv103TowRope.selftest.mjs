import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const visual = createTank('strv103', null, {
  proceduralOnly: true,
  quality: 'high',
  geometryReceipt: true,
});
const hull = visual.root.getObjectByName('rig_hull');
const rope = visual.root.getObjectByName('strv103_side_tow_rope');

assert.ok(hull && rope, 'Strv 103B owns a named recovery rope on the hull rig');
assert.equal(rope.parent, hull, 'recovery rope follows the fixed hull rather than a virtual turret');
assert.equal(rope.userData.orientation, 'longitudinal', 'recovery rope records its intended side orientation');

visual.root.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(rope);
const size = bounds.getSize(new THREE.Vector3());
const center = bounds.getCenter(new THREE.Vector3());

assert.ok(size.z > 4.25, `recovery rope runs fore-aft along the side (z span ${size.z.toFixed(3)} m)`);
assert.ok(size.z > size.y * 20, 'recovery rope cannot rotate into a vertical hanging line');
assert.ok(size.y < 0.10, `recovery rope keeps a shallow supported sag (y span ${size.y.toFixed(3)} m)`);
assert.ok(center.x > 1.84 && center.x < 1.90,
  `recovery rope is flush with the starboard skirt face (x ${center.x.toFixed(3)} m)`);
assert.ok(bounds.min.y > 1.40 && bounds.max.y < 1.50,
  'recovery rope remains seated at the fender/skirt seam above the running gear');

console.log('strv103TowRope.selftest: longitudinal side seating passed');
