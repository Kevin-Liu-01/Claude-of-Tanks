import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const visual = createTank('strv103a', null, {
  proceduralOnly: true,
  quality: 'high',
  geometryReceipt: true,
});
const hull = visual.root.getObjectByName('rig_hull');
const rope = visual.root.getObjectByName('strv103a_side_tow_rope');

assert.ok(hull && rope, 'Strv 103A owns a named recovery rope on the hull rig');
assert.equal(rope.parent, hull, 'recovery rope follows the fixed hull rather than a virtual turret');
assert.equal(rope.userData.orientation, 'longitudinal', 'recovery rope records its intended side orientation');

visual.root.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(rope);
const size = bounds.getSize(new THREE.Vector3());
const center = bounds.getCenter(new THREE.Vector3());

assert.ok(size.z > 4.85, `recovery rope runs fore-aft along the side (z span ${size.z.toFixed(3)} m)`);
assert.ok(size.z > size.y * 30, 'recovery rope cannot rotate into a vertical hanging line');
assert.ok(size.y < 0.09, `recovery rope keeps a shallow supported sag (y span ${size.y.toFixed(3)} m)`);
assert.ok(center.x > 1.75 && center.x < 1.81,
  `recovery rope is flush with the starboard fender/skirt seam (x ${center.x.toFixed(3)} m)`);
assert.ok(bounds.min.y > 1.46 && bounds.max.y < 1.54,
  'recovery rope remains seated above the running gear instead of crossing the tracks');

console.log('strv103ATowRope.selftest: longitudinal side seating passed');
