// Hitbox fit gate (hitbox-fit-274; the owner, 2026-11-18: "some hitboxes of tanks seem to be incorrect, because i can see
// hitmarks that are floating in air ... some tanks like abrams x just have a floating hit box"). Three parts:
//  1. the census's own measure on synthetic geometry (drawn faces count, a hidden part does not);
//  2. crop, fit, drop or hold (tools/gen-combat-anatomy.mjs lists, combatAnatomy.ts applyPlateFits applies): a layer
//     overhanging its drawn part is cropped to it, one standing off its drawn part is fitted onto it, one whose part is not
//     drawn (only the structural wall near it) is dropped, one whose part is drawn but not as one sheet (fused into the
//     hull's solid block) is held where it stands, and a layer is never fitted onto the main shell or the running gear;
//  3. the pinned vehicles (the Abrams X's inherited bustle rack, the worst offenders of the 2026-11-18 census) built and
//     measured: no plate or housing they trace may float, but for a layer the receipts hold.
// The whole fleet runs as the manual `fleet` suite's command (node tools/hitbox-fit-census.mjs --all).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FLOAT_TOL_M, hitboxFitCensus, plateFitReceipts, plateKey, polygonSamples, surfaceDistance, visibleTriangles,
} from './hitbox-fit-census-lib.mjs';
import { applyPlateFits } from '../src/vehicles/combatAnatomy.ts';

// 1. The measure. A 2 x 1 x 4 m hull (x ±1, y 0..1, z ±2); a drawn right skirt sheet (x 1.3, y 0.5..1, z ±1.5); road
//    wheels on the left (x -1.0..-1.1); a hidden rack behind.
const root = new THREE.Group();
const add = (w, h, d, x, y, z, visible = true, name = '') => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z); mesh.visible = visible; mesh.name = name; root.add(mesh); return mesh;
};
add(2, 1, 4, 0, 0.5, 0, true, 'hull');
add(0.02, 0.5, 3, 1.3, 0.75, 0, true, 'skirtR');
add(0.1, 0.5, 3, -1.15, 0.35, 0, true, 'gearRoadWheelsL');
add(1.6, 0.6, 0.1, 0, 0.5, -2.6, false, 'rack');
const T = visibleTriangles(root);
assert.equal(T.length / 9, 36, 'only drawn parts count: the hidden rack is not geometry the player sees');
assert.equal(T.gear.reduce((s, g) => s + g, 0), 12, 'the running gear is flagged');
const distance = surfaceDistance(T);
assert.ok(distance(1, 0.5, 0) < 1e-9 && Math.abs(distance(0, 1.3, 0) - 0.3) < 1e-9, 'distance to the nearest drawn face');
const square = polygonSamples([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]);
assert.ok(Math.abs(square.area - 1) < 1e-9 && square.points[0].every((v, i) => Math.abs(v - [0.5, 0, 0.5][i]) < 1e-9), 'area centroid first');
assert.ok(Math.abs(square.weights.reduce((s, w) => s + w, 0) - 1) < 1e-9 && square.points.length > 40, 'the samples cover the area');

// 2. Crop, fit, drop. Every layer faces out (+x on the right, -x on the left); the hull's one cell is the box itself.
const quad = (name, kind, x, y0, y1, z0, z1) => ({ name, kind, physicalMm: 10, keMm: 10, ceMm: 10,
  verts: x > 0 ? [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]] : [[x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1]] });
const boxCell = { vertices: [[-1, 0, -2], [1, 0, -2], [1, 1, -2], [-1, 1, -2], [-1, 0, 2], [1, 0, 2], [1, 1, 2], [-1, 1, 2]],
  faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]].map((indices) => ({ indices })) };
const armor = {
  turretPivot: [0, 0, 0],
  hullPlates: [
    quad('hull_side_R', 'main', 1, 0, 1, -2, 2),
    quad('skirt_on', 'spaced', 1.31 + FLOAT_TOL_M / 4, 0.5, 1, -1.5, 1.5), // on its skirt: stays
    quad('skirt_overhang', 'spaced', 1.31, -0.4, 1, -1.5, 1.5), // reaches 90 cm under its skirt: cropped
    quad('skirt_off', 'spaced', 1.45, 0.55, 0.95, -1.4, 1.4), // 15 cm proud of its skirt: fitted onto it
    quad('skirt_missing', 'spaced', -1.15, 0.55, 0.95, -1.5, 1.5), // no left skirt drawn: never fitted to the hull side 15 cm in
    quad('skirt_over_wheels', 'spaced', -1.32, 0.15, 0.55, -1.4, 1.4), // nor onto the road wheels 12 cm in
    quad('skirt_era', 'era', -1.4, 0.1, 0.9, -1.5, 1.5), // an ERA layer is measured like any other: no cassette drawn, dropped
    quad('hull_side_L', 'main', -1, 0, 1, -2, 2), // the structural wall the missing skirt finds
  ],
  turretPlates: [{ name: 'bustle_rack', kind: 'external', physicalMm: 10, keMm: 10, ceMm: 10,
    verts: [[0.8, 0.2, -2.6], [-0.8, 0.2, -2.6], [-0.8, 0.8, -2.6], [0.8, 0.8, -2.6]] }],
  collisionShells: { hull: [boxCell], turret: [] },
};
const fits = plateFitReceipts(armor, T);
const actions = Object.fromEntries(fits.map((fit) => [fit.name, fit.action]));
assert.deepEqual(actions, { skirt_overhang: 'crop', skirt_off: 'fit', skirt_missing: 'drop', skirt_over_wheels: 'drop', skirt_era: 'drop', bustle_rack: 'drop' },
  'an overhang is cropped, a stand-off fitted, a missing part dropped; main plates and layers on their parts left alone');
const byName = Object.fromEntries(fits.map((fit) => [fit.name, fit]));
assert.deepEqual(['skirt_missing', 'skirt_over_wheels', 'skirt_era', 'bustle_rack'].map((name) => byName[name].why), Array(4).fill('notDrawn'),
  'a layer that finds only the hull wall (its main plate) or the running gear has no part drawn');
const ys = byName.skirt_overhang.pieces[0].map((p) => p[1]);
assert.ok(Math.min(...ys) > 0.45 && Math.min(...ys) < 0.52 && Math.max(...ys) >= 0.99, 'the overhang is cut at the skirt\'s foot');
assert.ok(byName.skirt_off.pieces.flat().every((p) => Math.abs(p[0] - 1.31) < 0.02), 'the stand-off lies on the skirt\'s outer face');
assert.ok(fits.every((fit) => fit.gapM > 0 && fit.offShare > 0) && byName.bustle_rack.at.join() === plateKey(armor.turretPlates[0].verts).join(),
  'each receipt carries its reason and names its plate by its place');

const finalized = structuredClone(armor);
finalized.hullPlates.push(quad('skirt_missing', 'spaced', 1.31, 0.5, 1, -1.5, 1.5)); // a namesake elsewhere stays
applyPlateFits(finalized, fits);
assert.deepEqual(finalized.hullPlates.map((p) => p.name),
  ['hull_side_R', 'skirt_on', 'skirt_overhang', 'skirt_off', 'hull_side_L', 'skirt_missing'], 'drops by name and place only');
assert.deepEqual(finalized.hullPlates[2].verts, byName.skirt_overhang.pieces[0], 'a cropped layer takes its receipt\'s outline');
assert.deepEqual(finalized.turretPlates, [], 'the floating rack is dropped');
applyPlateFits(finalized, [{ owner: 'hull', name: 'hull_side_R', kind: 'main', at: plateKey(armor.hullPlates[0].verts), gapM: 0.6, offShare: 1, action: 'drop' }]);
assert.equal(finalized.hullPlates[0].name, 'hull_side_R', 'a main plate is never dropped');
const after = plateFitReceipts(finalized, T);
assert.deepEqual(after, [], 'once applied, every layer lies on the drawn build');
// A skirt merged into the hull's own mesh (one draw, as a builder merges its bucket) is still a layer's part: a sheet with
// the road wheels behind it. The layer is fitted onto it, never onto the solid hull wall beside it.
{
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const merged = new THREE.Group();
  const geometry = mergeGeometries([new THREE.BoxGeometry(2, 1, 4).translate(0, 0.5, 0), new THREE.BoxGeometry(0.03, 0.5, 3).translate(1.4, 0.75, 0)]);
  merged.add(Object.assign(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()), { name: 'hull' }));
  const wheels = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 3), new THREE.MeshBasicMaterial()), { name: 'gearRoadWheelsR' });
  wheels.position.set(1.15, 0.35, 0); merged.add(wheels);
  const left = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 3), new THREE.MeshBasicMaterial()), { name: 'gearRoadWheelsL' });
  left.position.set(-1.15, 0.35, 0); merged.add(left);
  const Tm = visibleTriangles(merged);
  // its cell is hulled from the whole mesh, skirt included (as the generator's are): the skirt lies on the shell's cells
  const hulled = { ...boxCell, vertices: boxCell.vertices.map(([x, y, z]) => [x > 0 ? 1.415 : x, y, z]) };
  const mergedArmor = { turretPivot: [0, 0, 0], turretPlates: [], collisionShells: { hull: [hulled], turret: [] },
    hullPlates: [quad('skirt_merged', 'spaced', 1.55, 0.55, 0.95, -1.4, 1.4), quad('skirt_by_the_wall', 'spaced', 1.15 - 2.3, 0.6, 0.95, -1.4, 1.4),
      quad('hull_side_L', 'main', -1, 0, 1, -2, 2)] };
  const mergedFits = Object.fromEntries(plateFitReceipts(mergedArmor, Tm).map((fit) => [fit.name, fit]));
  assert.equal(mergedFits.skirt_merged?.action, 'fit', 'a layer is fitted onto its part merged into the hull\'s mesh');
  assert.ok(mergedFits.skirt_merged.pieces.flat().every((p) => Math.abs(p[0] - 1.415) < 0.02), 'onto the skirt\'s outer face');
  assert.equal(mergedFits.skirt_by_the_wall?.action, 'drop', 'and never onto the solid hull wall');
}
// A skirt drawn fused into the hull's solid block (70 cm of stock, no sheet's back face) is the part the layer stands off,
// but no sheet to fit it to: the layer is held where it stands (a visible skirt keeps its value), and applying the
// receipts leaves it there.
{
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const fused = new THREE.Group();
  fused.add(Object.assign(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(2, 1, 4).translate(0, 0.5, 0),
    new THREE.BoxGeometry(0.7, 0.5, 3).translate(-1.35, 0.75, 0)]), new THREE.MeshBasicMaterial()), { name: 'hull' }));
  const hulled = { ...boxCell, vertices: boxCell.vertices.map(([x, y, z]) => [x < 0 ? -1.7 : x, y, z]) };
  const fusedArmor = { turretPivot: [0, 0, 0], turretPlates: [], collisionShells: { hull: [hulled], turret: [] },
    hullPlates: [quad('hull_side_L', 'main', -1, 0, 1, -2, 2), quad('skirt_fused', 'spaced', -1.85, 0.55, 0.95, -1.4, 1.4)] };
  const fusedFits = plateFitReceipts(fusedArmor, visibleTriangles(fused));
  assert.deepEqual(fusedFits.map((fit) => [fit.name, fit.action, fit.why]), [['skirt_fused', 'hold', 'unfitted']],
    'a layer standing off a part drawn fused into the hull\'s solid block is held');
  const applied = structuredClone(fusedArmor);
  applyPlateFits(applied, fusedFits);
  assert.deepEqual(applied.hullPlates, fusedArmor.hullPlates, 'a held layer stays where it stands');
}
console.log('hitbox-fit-census.selftest: the measure and crop, fit, drop or hold passed');

// 3. The pinned vehicles: abramsx (the owner's report) and the worst offenders of the 2026-11-18 census: the Abrams
//    family's inherited rack (m1a1), a T-72 donor's rubber skirts on an ERA hull (t72b3_zhuque), the Leopard 2's
//    overhanging skirts and wedges (leo2a5), the M1A3's stand-off skirts and cages, and the T-90M's rear slat cage.
const PINNED = ['abramsx', 'm1a1', 't72b3_zhuque', 'leo2a5', 'm1a3', 't90m'];
for (const id of PINNED) {
  const row = await hitboxFitCensus(id);
  const floating = row.rows.filter((r) => r.floating && r.type !== 'cell' && !r.held);
  assert.deepEqual(floating.map((r) => `${r.frame} ${r.name} (${r.kind}) ${r.centreM} m off`), [],
    `${id}: every plate and housing it traces sits on its drawn build, or is held (its part drawn, not as one sheet)`);
}
console.log(`hitbox-fit-census.selftest: ${PINNED.join(', ')} trace no floating plate or housing but held layers`);
