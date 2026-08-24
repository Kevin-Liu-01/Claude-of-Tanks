import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  findCoplanarSurfaceOverlaps,
  triangleIntersectionArea2D,
} from './coplanar-surface-overlap.js';

assert.equal(triangleIntersectionArea2D(
  [[0, 0], [2, 0], [0, 2]],
  [[0, 0], [1, 0], [0, 1]],
), 0.5, 'contained triangle area is measured exactly');
assert.equal(triangleIntersectionArea2D(
  [[0, 0], [1, 0], [0, 1]],
  [[1, 1], [2, 1], [1, 2]],
), 0, 'separated triangles do not overlap');

const materialA = new THREE.MeshBasicMaterial({ name: 'armor' });
const materialB = new THREE.MeshBasicMaterial({ name: 'detail' });
const root = new THREE.Group();
root.name = 'testRoot';
const armor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materialA);
armor.name = 'armor';
const detail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialB);
detail.name = 'detail';
root.add(armor, detail);
let audit = findCoplanarSurfaceOverlaps(root);
assert.equal(audit.findings.length, 1, 'same-facing coplanar surfaces are detected');
assert.ok(Math.abs(audit.findings[0].areaM2 - 1) < 1e-8,
  'overlap area is not double counted across triangle seams');

detail.position.z = 0.002;
audit = findCoplanarSurfaceOverlaps(root);
assert.equal(audit.findings.length, 0, 'separated visible surfaces pass');

detail.position.z = 0;
detail.rotation.y = Math.PI;
audit = findCoplanarSurfaceOverlaps(root);
assert.equal(audit.findings.length, 0, 'opposite-facing contact backs do not false-positive');

detail.rotation.y = 0;
materialB.polygonOffset = true;
audit = findCoplanarSurfaceOverlaps(root);
assert.equal(audit.findings.length, 0, 'explicit polygon-offset overlays are treated as mitigated');
assert.equal(audit.mitigatedFindings.length, 1,
  'mitigated overlap remains measurable instead of disappearing from the audit');

console.log('coplanar-surface-overlap.selftest: overlap area, separation, facing and mitigation pass');
