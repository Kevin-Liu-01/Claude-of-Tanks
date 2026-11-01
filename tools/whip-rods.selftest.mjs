// The whip-rod census's geometry (267, Main 2026-10-31: tag every whip rod, found by geometry; tools/whip-rods.mjs): a
// whip stands clear of everything round its tip, a rack post ends at its rail (a rail's long top counts over the post,
// not only at its far corners), a whip beside a taller fitting is found by its mirror twin, a whip tagged over all but a
// short mount at its foot is tagged and one with a tall untagged base is not; two real builds tagged in 267 read tagged.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './tank-surface-collect.mjs'; // node canvas shim: builders paint their canvas textures as in the browser
import { NOT_WHIPS, notWhip, whipRods } from './whip-rods.mjs';

const isRenderNode = (o) => (o.isMesh || o.isInstancedMesh) && o.geometry;
const mesh = (geometry, x, y, z, parent) => { const m = new THREE.Mesh(geometry); m.position.set(x, y, z); parent.add(m); return m; };
/** A tank stand-in: a 2 x 0.5 x 2 roof block (top 2.25) under `root`. */
function roof() {
  const root = new THREE.Group();
  mesh(new THREE.BoxGeometry(2, 0.5, 2), 0, 2.0, 0, root);
  return root;
}
const rodsOf = (root) => whipRods(root, { isRenderNode, rods: true });
const whipsOf = (root) => whipRods(root, { isRenderNode });

// a 1 m whip on the roof: a whip, untagged; the antenna seat role over all of it: tagged
{
  const root = roof();
  mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 8), 0.6, 2.75, 0.4, root);
  const [whip] = whipsOf(root);
  assert.ok(whip && !whip.tagged && whip.proudM > 0.9, 'a lone 1 m rod on the roof is an untagged whip');
  const tagged = roof();
  const rod = mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 8), 0.6, 2.75, 0.4, tagged);
  rod.userData.seatRoleRanges = [{ start: 0, count: rod.geometry.index.count, role: 'antenna' }];
  assert.equal(whipsOf(tagged)[0]?.tagged, true, 'the antenna role over every triangle tags it');
}
// a whip on its mount, one piece: tagged above a 0.1 m mount reads tagged; above a 0.3 m base it does not
for (const [rows, tagged] of [[1, true], [3, false]]) {
  const root = roof(), g = new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8, 11);
  const rod = mesh(g, -0.6, 2.25 + 0.55, -0.4, root);
  // three's torso runs radial segment by segment, each its 11 rows top to bottom (6 indices a row), then the top cap and
  // the bottom cap: the antenna role over each segment's upper rows and the top cap leaves the lowest `rows` untagged
  const torso = 11 * 8 * 6;
  rod.userData.seatRoleRanges = [...Array.from({ length: 8 }, (_, x) => ({ start: x * 66, count: (11 - rows) * 6, role: 'antenna' })),
    { start: torso, count: 8 * 3, role: 'antenna' }];
  assert.equal(whipsOf(root)[0]?.tagged, tagged, `a whip untagged over its lowest ${rows * 0.1} m reads ${tagged ? 'tagged' : 'untagged'}`);
}
// rack posts under a rail (the rail's corners lie past the 0.5 m reach): not whips; without the rail, the middle one is
for (const rail of [true, false]) {
  const root = roof();
  for (const x of [-0.8, 0, 0.8]) mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), x, 2.55, -0.9, root);
  if (rail) mesh(new THREE.BoxGeometry(1.8, 0.04, 0.04), 0, 2.86, -0.9, root);
  const whips = whipsOf(root).map((w) => Math.round(w.measure.foot[0] * 10) / 10 + 0).sort((p, q) => p - q);
  if (rail) assert.deepEqual(whips, [], 'posts that end at a rail are a rack, not whips');
  else assert.deepEqual(whips, [-0.8, 0, 0.8], 'free posts standing clear read as whips');
}
// a mirrored pair: the left whip beside a taller mast box is found by its twin; a lone such rod is not
for (const pair of [true, false]) {
  const root = roof();
  mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 8), -0.7, 2.65, 0.5, root);
  mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), -0.7, 2.85, 0.75, root);
  if (pair) mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 8), 0.7, 2.65, 0.5, root);
  const left = rodsOf(root).find((r) => r.measure.foot[0] < 0);
  assert.ok(left.proudM < 0, 'the left rod stands under the taller box beside it');
  assert.equal(left.whip, pair, pair ? 'its mirror twin makes it a whip' : 'alone it is not');
  if (pair) assert.equal(left.twin, true);
}
// the reviewed list answers by foot (5 cm), and only for its id
assert.ok(NOT_WHIPS.x1a2_carcara.length && notWhip('x1a2_carcara', [-0.06, 2.46, -0.33]));
assert.equal(notWhip('x1a2_carcara', [0.4, 2.45, -0.32]), null);
assert.equal(notWhip('m41a3', [-0.06, 2.45, -0.32]), null);

// two builds tagged in 267: the M41's bustle whips, and the T-90MS's rear whip (its tip within 0.2 m of the stowage beside
// it, so it reads as a rod, not a whip: its tag is held by its foot) beside its tagged 2.3 m whip
const { createTank } = await import('../src/vehicles/tankFactory.ts');
for (const [id, count, feet] of [['m41a3', 2, []], ['t90ms_tagil', 1, [[-0.796, 2.107, -2.345]]]]) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  try {
    const rods = rodsOf(tank.root), whips = rods.filter((r) => r.whip);
    assert.ok(whips.length >= count, `${id}: ${whips.length} whips found, ${count} expected`);
    assert.deepEqual(whips.filter((w) => !w.tagged).map((w) => w.path), [], `${id}: every whip tagged`);
    for (const foot of feet) {
      const rod = rods.find((r) => r.measure.foot.every((v, a) => Math.abs(v - foot[a]) <= 0.05));
      assert.equal(rod?.tagged, true, `${id}: the rod at ${foot} is tagged`);
    }
  } finally {
    tank.dispose?.();
  }
}
console.log('whip-rods.selftest: a whip stands clear, a rack ends at its rail, a twin finds its pair, a tagged whip keeps its mount, the reviewed list by foot, and the M41 and T-90MS whips tagged pass');
