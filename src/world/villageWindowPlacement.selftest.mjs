import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { makeFarmhouse, makeAlpine } from './maps/villageKit.ts';

// Frozen before pane seating repair. Every non-pane vertex/UV/index remains
// byte-identical; dimensions, RNG consumption and draw-bucket counts stay fixed.
const cases = [
  ['farmhouse', 17, 13, 946911448, 816, 1116, '98d6a05cecc342f01ed8b7f97291e88069574c9abcf3afb1f09d3316eff3d507'],
  ['farmhouse', 42, 12, 2146095206, 888, 1224, '63d464048b2fabd59c783fd9d11a5d622b05286d87107c05aae5450d4e409975'],
  ['farmhouse', 2026, 13, -1139468979, 1008, 1404, 'fc3e1122f621d24d0bd5d880f227075f13270bf8de5ac78b97e2484389e2ec25'],
  ['alpine', 17, 11, -2104269770, 1032, 1476, '12a42a4b4059364b8694102e1ae58ab600255feb835bd75f15402538e7436b6e'],
  ['alpine', 42, 11, -630489501, 984, 1404, '798658768cf4bc44c1d833ff3550fd51f6d62040503ff0e1e4560c61c763a1a7'],
  ['alpine', 2026, 11, 192796963, 1032, 1476, '9e53b7fc7002eada98cb47b2fb2f34f591f2331a9df25c28a8e3c2f3f2e0522c'],
];
function isPane(id, bucket, geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return id === 'farmhouse' ? bucket === 'glass' || bucket === 'curtain'
    : ['dark', 'curtain'].includes(bucket) && Math.abs(size.x - .6) < 1e-5
      && Math.abs(size.y - .72) < 1e-5 && Math.abs(size.z - .06) < 1e-5;
}
function hashPart(hash, bucket, geometry) {
  hash.update(bucket);
  for (const name of ['position', 'normal', 'uv']) {
    const array = geometry.getAttribute(name)?.array;
    if (array) hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  if (geometry.index) {
    const array = geometry.index.array;
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
}
function assertPaneContact(root, mesh, id) {
  const bounds = mesh.geometry.boundingBox, center = bounds.getCenter(new THREE.Vector3());
  const normal = id === 'farmhouse' ? new THREE.Vector3(Math.sign(center.x), 0, 0) : new THREE.Vector3(0, 0, 1);
  const halfDepth = id === 'farmhouse' ? (bounds.max.x - bounds.min.x) / 2 : (bounds.max.z - bounds.min.z) / 2;
  const point = center.clone().addScaledVector(normal, halfDepth);
  const ray = new THREE.Raycaster(point.clone().addScaledVector(normal, .15), normal.clone().negate(), .001, .2);
  assert(ray.intersectObject(root, true)[0]?.object === mesh, `${id}: actual aperture must be exposed, not behind backing/cladding`);
  ray.set(point.clone().addScaledVector(normal, .002), normal.clone().negate()); ray.far = .08;
  const support = ray.intersectObject(root, true).find(hit => hit.object !== mesh);
  assert(support && support.distance >= .001 && support.distance < .015,
    `${id}: aperture stays within 13 mm of original backing, not floating`);
}
let checked = 0;
for (const [id, seed, expectedCalls, expectedState, vertices, indices, digest] of cases) {
  let state = seed, calls = 0;
  const rng = () => { calls++; state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  const buckets = Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'].map(key => [key, []]));
  ({ farmhouse: makeFarmhouse, alpine: makeAlpine })[id](rng, buckets, 'plaster');
  assert.equal(calls, expectedCalls); assert.equal(state, expectedState);
  const parts = Object.values(buckets).flat();
  assert.equal(parts.reduce((sum, part) => sum + part.getAttribute('position').count, 0), vertices);
  assert.equal(parts.reduce((sum, part) => sum + (part.index?.count ?? 0), 0), indices);
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial(), panes = [], hash = createHash('sha256');
  for (const [bucket, geometries] of Object.entries(buckets)) for (const geometry of geometries) {
    const mesh = new THREE.Mesh(geometry, material); root.add(mesh);
    if (isPane(id, bucket, geometry)) panes.push(mesh); else hashPart(hash, bucket, geometry);
  }
  assert.equal(hash.digest('hex'), digest, `${id}/${seed}: all non-pane geometry, UVs, normals, indices and bucket ordering unchanged`);
  root.updateMatrixWorld(true);
  for (const pane of panes) { assertPaneContact(root, pane, id); checked++; }
  for (const part of parts) part.dispose(); material.dispose();
}
assert(checked > 10);
console.log(`villageWindowPlacement: ${checked} exposed supported panes; non-pane byte parity, RNG and geometry budgets PASS`);
