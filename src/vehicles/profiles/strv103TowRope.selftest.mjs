// 274: the Strv 103 family's recovery rope (profiles/strv103Equipment.ts hullFittings): three short longitudinal runs on the
// right fender plate between the bins and the lip, strapped at both ends, on the 103B and the 103A alike (the concept carries none: its
// composite modules stand there). The 103A's own copy of this receipt is strv103ATowRope.selftest.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

export function assertStrv103Rope(id) {
  const visual = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true });
  const hull = visual.root.getObjectByName('rig_hull');
  const rope = visual.root.getObjectByName('strv103_side_tow_rope');
  assert.ok(hull && rope, `${id} owns a named recovery rope on the hull rig`);
  assert.ok(rope.parent === hull, `${id}: the rope follows the fixed hull, not a virtual turret`);
  assert.equal(rope.userData.orientation, 'longitudinal', `${id}: the rope records its side orientation`);
  assert.equal(rope.userData.fixedToFender, true, `${id}: the rope is a fixed fender assembly`);
  assert.equal(rope.children.length, 3, `${id}: three longitudinal runs, one under each right bin`);
  assert.ok(rope.children.every((c) => c.name === 'strv103_side_tow_rope_segment'), `${id}: no free spline geometry`);
  visual.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(rope);
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  assert.ok(size.z > 3.8, `${id}: the rope runs fore-aft along the bins (z span ${size.z.toFixed(3)} m)`);
  assert.ok(size.y < 0.05, `${id}: the rope lies flat on the plate (y span ${size.y.toFixed(3)} m)`);
  assert.ok(center.x > 1.74 && center.x < 1.78, `${id}: the rope lies on the right fender plate (x ${center.x.toFixed(3)} m)`);
  assert.ok(bounds.min.y > 1.52 && bounds.max.y < 1.60, `${id}: the rope stays over the fender, clear of the running gear`);
  return visual;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertStrv103Rope('strv103b');
  const concept = createTank('strv103e', null, { proceduralOnly: true, quality: 'high', geometryReceipt: true });
  assert.equal(concept.root.getObjectByName('strv103_side_tow_rope'), undefined,
    'the concept carries composite modules where the bins and their rope stand');
  console.log('strv103TowRope.selftest: the 103B rope is seated on its fender, the concept carries none');
}
