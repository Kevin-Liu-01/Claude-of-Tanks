// shrubClearance.selftest — the shrubs kept out of the solids (the scenery lane, b12; Fjord, gauntlet wave 74: foliage
// cards through a boulder). Pinned: a shrub whose core the predicate finds blocked draws nothing (its basis zero, its
// translation and slot kept); the others are untouched; the core is 0.45 of the crown the instance's scale gives; only
// the bushes and the understorey are touched; the world wires it after the ground cover's seal, with the same predicate;
// and the vegetation tags the meshes it means.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { clearShrubsFromSolids, SHRUB_CORE } from './shrubClearance.ts';

const geometry = new THREE.BoxGeometry(2, 2, 2).translate(0, 1, 0); // crown radius 1, height 2 in unit space
const shrubs = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 3);
shrubs.userData.bush = true;
const m = new THREE.Matrix4();
const seats = [[0, 0, 1.5], [5, 0, 2], [10, 0, 1]];
seats.forEach(([x, z, scale], i) => shrubs.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.5, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale * 1.2, scale))));
const understorey = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1);
understorey.userData.understorey = true;
understorey.setMatrixAt(0, m.compose(new THREE.Vector3(5, 0.5, 0.5), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
const rocks = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1); // not a shrub: never touched
rocks.setMatrixAt(0, m.compose(new THREE.Vector3(5, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
const root = new THREE.Group();
root.add(shrubs, understorey, rocks);
const before = { shrubs: Array.from(shrubs.instanceMatrix.array), rocks: Array.from(rocks.instanceMatrix.array) };
const asked = [];
// a boulder's footprint round (5, 0), 1.2 m across
const blocked = (x, y, z, height, radius) => { asked.push({ x, y, z, height, radius }); return Math.hypot(x - 5, z) < 1.2 + radius; };
const version = shrubs.instanceMatrix.version;
const cleared = clearShrubsFromSolids(root, blocked);
assert.equal(cleared, 2, 'the bush and the understorey in the boulder are cleared');
const a = shrubs.instanceMatrix.array;
assert.deepEqual(Array.from(a.slice(16, 28)), new Array(12).fill(0), 'the blocked shrub\'s basis is zero: it draws nothing');
assert.deepEqual([a[28], a[29], a[30], a[31]], [before.shrubs[28], before.shrubs[29], before.shrubs[30], 1], 'its place kept (the fade registry addresses its slot)');
assert.deepEqual(Array.from(a.slice(0, 16)), before.shrubs.slice(0, 16), 'a shrub clear of the solids is untouched');
assert.deepEqual(Array.from(a.slice(32, 48)), before.shrubs.slice(32, 48), 'and the far one');
assert.equal(shrubs.count, 3, 'no shrub moves or is compacted away');
assert.ok(shrubs.instanceMatrix.version > version, 'the instances are re-uploaded');
assert.deepEqual(Array.from(rocks.instanceMatrix.array), before.rocks, 'a mesh that is no shrub is never touched');
const first = asked.find((q) => Math.abs(q.x) < 1e-9 && Math.abs(q.z) < 1e-9);
assert.ok(first && Math.abs(first.radius - 1 * 1.5 * SHRUB_CORE) < 1e-5 && Math.abs(first.height - 2 * 1.8) < 1e-5 && Math.abs(first.y - 0.5) < 1e-6,
  'the predicate asks for the core (0.45 of the crown its scale gives) from the shrub\'s base, its full height');
assert.equal(clearShrubsFromSolids(root, blocked), 0, 'a cleared shrub is not counted again');

// the world: after the ground cover's seal, the same predicate (the props' solids and the scenery's holes)
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.match(map, /vegetation\.setGroundCoverClearance\(groundCoverClearance\(\)\);\n[\s\S]{0,260}group\.userData\.shrubsCleared = clearShrubsFromSolids\(vegetation\.group, groundCoverClearance\(\)\);/,
  'the shrubs are cleared right after the ground cover is sealed, from the same footprints');
// the vegetation tags the meshes the clearance means
const vegetation = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.ok(vegetation.includes('m.userData.bush = true;') && vegetation.includes('m.userData.understorey = true;'), 'the bushes and the understorey are tagged');

console.log('shrubClearance.selftest: a shrub inside a solid draws nothing, keeps its slot and its cover disc; the rest untouched; wired after the ground cover\'s seal');
