// Stowage leaves the geometry gate's body on both sides (267, Main 2026-10-31; tools/body-height-parts.mjs stowageParts):
// a build's tagged part on a mesh of its own leaves whole and a merged bucket's span is cut, so a hull with a stern rack
// measures the hull alone while a longer hull still measures longer; the roof-fitting bodies leave the stowage out too; a
// source names its stowage by node (drums, fuel storage, baskets; never tracks, barrels, ammunition boxes or jerry cans)
// or a fused source by registered boxes (FUSED_STOWAGE_BOXES), whose triangles leave its body.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ORACLE_ROOF_FITTING_NODES, ORACLE_STOWAGE_NODES, bodyGeometryWithout, isAntennaTag, roofFittingParts, stowageParts } from './body-height-parts.mjs';
import { FUSED_STOWAGE_BOXES } from './fused-roof-gun-boxes.mjs';
import { stowagePart } from '../src/vehicles/profiles/stowagePart.ts';

const isRenderNode = (o) => (o.isMesh || o.isInstancedMesh) && o.geometry;
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** A merged bucket as the factory leaves it: the parts' index spans of the tagged ones in userData.stowageRanges. */
function bucket(parts) {
  const mesh = new THREE.Mesh(mergeGeometries(parts.map(([g]) => g)));
  let start = 0;
  const ranges = [];
  for (const [g, tagged] of parts) { if (tagged) ranges.push({ start, count: g.index.count }); start += g.index.count; }
  if (ranges.length) mesh.userData.stowageRanges = ranges;
  return mesh;
}
/** The z extent of `root`'s render nodes with the stowage cut and its own meshes left out (the gate's body). */
function bodyLength(root, parts) {
  const all = new THREE.Box3();
  root.traverse((o) => {
    if (!isRenderNode(o) || parts.nodes.has(o)) return;
    const cut = parts.ranges.get(o);
    const g = cut ? bodyGeometryWithout(o.geometry, cut) : o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    all.union(g.boundingBox);
  });
  return all.max.z - all.min.z;
}
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);

// the tag: on the part's geometry, no seat role (the spare-track seats read the part as before)
const tagged = stowagePart(new THREE.BoxGeometry(1, 1, 1));
assert.equal(tagged.userData.stowage, true);
assert.equal(tagged.userData.seatRole, undefined, 'stowage is not a seat role');

// a hull with a stern drum rack in its bucket and a drum on a mesh of its own: the body is the hull; a longer hull is longer
for (const hullLength of [6.0, 6.3]) {
  const root = new THREE.Group();
  root.add(bucket([[box(3, 1.2, hullLength, 0, 0.9, 0), false], [box(1.8, 0.5, 0.5, 0, 1.4, -hullLength / 2 - 0.25), true]]));
  root.add(new THREE.Mesh(stowagePart(new THREE.CylinderGeometry(0.29, 0.29, 0.9, 16).rotateZ(Math.PI / 2).translate(0, 1.7, -hullLength / 2 - 0.3))));
  const parts = stowageParts(root, { isRenderNode });
  assert.equal(parts.nodes.size, 1, 'the drum on a mesh of its own leaves whole');
  assert.equal(parts.ranges.size, 1, 'the rack leaves its merged bucket by its span');
  close(bodyLength(root, parts), hullLength, `the ${hullLength} m hull measures itself, not its rack or drum`);
  close(bodyLength(root, { nodes: new Map(), ranges: new Map() }), hullLength + 0.59, 'untagged, the drum (0.29 m round, 0.3 m behind) sets the span');
}

// a merged mesh with a whip and a rack: the roof-fitting body leaves both out (the page's withBodyOnly swaps it in)
{
  const root = new THREE.Group();
  const whip = box(0.02, 1.2, 0.02, 0.5, 2.1, 0);
  const mesh = bucket([[box(3, 1.2, 6, 0, 0.9, 0), false], [whip, false], [box(1.8, 0.5, 0.5, 0, 1.4, -3.25), true]]);
  const whipStart = 36;
  mesh.userData.seatRoleRanges = [{ start: whipStart, count: whip.index.count, role: 'antenna' }];
  root.add(mesh);
  const parts = stowageParts(root, { isRenderNode });
  const { trimmed } = roofFittingParts(root, { isRenderNode, cut: parts.ranges });
  const body = trimmed.get(mesh);
  assert.ok(body, 'the whip makes a trimmed body');
  close(body.boundingBox.max.y, 1.5, 'no whip in it');
  close(body.boundingBox.min.z, -3, 'no rack in it');
}

// a source names its stowage by node; a fused source by its boxes
for (const name of ['EXtra fuel storage', 'EXtra fuel storage_source', 'Rear turret basket.001', 'fuel_drum_left', 'vehicle#stowage_3'])
  assert.ok(ORACLE_STOWAGE_NODES.test(name), `${name} is stowage`);
for (const name of ['track_1', 'Track (Left)', 'gun_barrel_44', 'Main barrel', 'ammobox_ares_rws_4_0', 'jerrycan01', 'mgbox', 'chasis'])
  assert.ok(!ORACLE_STOWAGE_NODES.test(name), `${name} is not stowage`);
{
  const root = new THREE.Group();
  const named = new THREE.Mesh(box(1, 1, 1, 0, 1.5, -3.6)); named.name = 'EXtra fuel storage';
  const fused = new THREE.Mesh(mergeGeometries([box(3, 1.2, 6, 0, 0.9, 0), box(1.8, 0.6, 0.6, 0, 1.5, -3.4)]));
  root.add(named, fused);
  fused.name = 'hull_mesh';
  const outside = new THREE.Mesh(box(0.4, 0.4, 0.4, 0, 1.5, -3.4)); outside.name = 'tow_box';
  root.add(outside);
  const parts = stowageParts(root, { isRenderNode, oracle: true, named: /^tow_never$/,
    parts: [{ within: /^hull_mesh$/, boxes: [[-1, 1.15, -3.75, 1, 1.85, -3.05]] }] });
  assert.deepEqual([...parts.nodes.values()], ['node:EXtra fuel storage']);
  assert.equal(parts.ranges.get(fused)?.length, 12, 'the boxes take the fused drum\'s 12 triangles and none of the hull\'s');
  assert.equal(parts.ranges.has(outside), false, 'a box cuts only within the node its part names');
  close(bodyLength({ traverse: (f) => [named, fused].forEach(f) }, parts), 6, 'the source\'s body is its hull');
  const byName = stowageParts(root, { isRenderNode, oracle: true, named: /^tow_box$/ });
  assert.equal(byName.nodes.get(outside), 'node:tow_box', 'a registration names a whole stowage node the generic names miss');
}

// the T-90M print names its whip Anthena: a whip, never stowage
assert.ok(ORACLE_ROOF_FITTING_NODES.test('Anthena_source') && isAntennaTag('node:Anthena') && !ORACLE_STOWAGE_NODES.test('Anthena'));

// the registered sources: finite boxes with volume, each part within a named node, the triangles its boxes take
for (const [id, entry] of Object.entries(FUSED_STOWAGE_BOXES)) {
  assert.ok(Number.isInteger(entry.triangles) && entry.triangles >= 0, `${id}: the triangles its boxes take`);
  assert.ok(entry.parts.length || entry.nodes instanceof RegExp, `${id}: names a node or boxes a part`);
  for (const { within, boxes } of entry.parts) {
    assert.ok(within instanceof RegExp && boxes.length, `${id}: a part names its node and boxes`);
    for (const b of boxes) assert.ok(b.length === 6 && b.every(Number.isFinite) && b[0] < b[3] && b[1] < b[4] && b[2] < b[5], `${id}: [x0, y0, z0, x1, y1, z1] with volume`);
  }
}
console.log('gate-stowage.selftest: tagged stowage leaves the build\'s body whole or by span, a longer hull still measures longer, the roof-fitting bodies leave it out, a source names or boxes its own');
