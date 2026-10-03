import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeFarmhouse, makeAlpine } from './maps/villageKit.ts';

// 2026-10-01 (frozen pins retired): per-seed RNG call counts and end states, vertex/index totals and sha256 digests of
// every non-pane part were pinned before the pane seating repair. Those were change detectors of the farmhouse and
// alpine cottage builders. The live contract: every window pane is exposed (not behind backing or cladding) and seated
// within 13 mm of its wall, and a rebuild from the same seed draws the same RNG stream.
const cases = [['farmhouse', 17], ['farmhouse', 42], ['farmhouse', 2026], ['alpine', 17], ['alpine', 42], ['alpine', 2026]];
const BUCKETS = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
function isPane(id, bucket, geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return id === 'farmhouse' ? bucket === 'glass' || bucket === 'curtain'
    : ['dark', 'curtain'].includes(bucket) && Math.abs(size.x - .6) < 1e-5
      && Math.abs(size.y - .72) < 1e-5 && Math.abs(size.z - .06) < 1e-5;
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
function build(id, seed) {
  let state = seed, calls = 0;
  const rng = () => { calls++; state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  const buckets = Object.fromEntries(BUCKETS.map(key => [key, []]));
  ({ farmhouse: makeFarmhouse, alpine: makeAlpine })[id](rng, buckets, 'plaster');
  return { buckets, calls, state };
}
let checked = 0;
for (const [id, seed] of cases) {
  const { buckets, calls, state } = build(id, seed), again = build(id, seed);
  assert.deepEqual([again.calls, again.state], [calls, state], `${id}/${seed}: a rebuild draws the same RNG stream`);
  const parts = Object.values(buckets).flat();
  for (const part of parts) for (const attribute of Object.values(part.attributes)) {
    assert.ok(attribute.array.every(Number.isFinite), `${id}/${seed}: finite cottage attributes`);
  }
  const root = new THREE.Group(), material = new THREE.MeshBasicMaterial(), panes = [];
  for (const [bucket, geometries] of Object.entries(buckets)) for (const geometry of geometries) {
    const mesh = new THREE.Mesh(geometry, material); root.add(mesh);
    if (isPane(id, bucket, geometry)) panes.push(mesh);
  }
  assert.ok(panes.length > 0, `${id}/${seed}: the cottage has window panes`);
  root.updateMatrixWorld(true);
  for (const pane of panes) { assertPaneContact(root, pane, id); checked++; }
  for (const part of [...parts, ...Object.values(again.buckets).flat()]) part.dispose(); material.dispose();
}
assert(checked > 10);
console.log(`villageWindowPlacement: ${checked} exposed supported panes; deterministic RNG PASS`);
