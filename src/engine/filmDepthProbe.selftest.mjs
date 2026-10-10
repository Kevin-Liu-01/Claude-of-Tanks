import assert from 'node:assert/strict';
import * as THREE from 'three';
import { nearSurfacePoints, viewDistanceFromDepth } from './filmDepthProbe.ts';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// The probe's depth linearisation inverts the camera's own projection (standard depth: 0 near, 1 far).
const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 4000);
camera.position.set(12, 1.1, -30);
camera.lookAt(20, 1.6, -10);
camera.updateMatrixWorld();
camera.updateProjectionMatrix();
for (const d of [0.6, 1.5, 4, 25, 300, 3500]) {
  const ndcZ = new THREE.Vector4(0, 0, -d, 1).applyMatrix4(camera.projectionMatrix);
  const depth = (ndcZ.z / ndcZ.w + 1) / 2;
  close(viewDistanceFromDepth(depth, camera.near, camera.far), d, d * 1e-5, `a surface ${d} m along the view axis`);
}
assert.equal(viewDistanceFromDepth(1, camera.near, camera.far), 0, 'the far plane (sky) holds no surface');

// A cell's surface comes back as the world point on the cell centre's ray at that view distance.
const cols = 16, rows = 9, depth = new Float32Array(cols * rows * 4);
depth[(2 * cols + 13) * 4] = 1.8;   // a bush brushing the lens, low right
depth[(6 * cols + 4) * 4] = 22;     // a hull, upper left
depth[(7 * cols + 7) * 4] = 140;    // a hillside: beyond the 80 m the terrain probe covers
const out = new Float32Array(cols * rows * 3);
const n = nearSurfacePoints(depth, cols, rows, camera, 80, out);
assert.equal(n, 2, 'two cells hold a surface nearer than 80 m');
const check = (k, col, row, viewZ) => {
  const p = new THREE.Vector3(out[k * 3], out[k * 3 + 1], out[k * 3 + 2]);
  const view = p.clone().applyMatrix4(camera.matrixWorldInverse);
  close(-view.z, viewZ, 1e-3, `cell ${col},${row}: the surface's distance along the view axis`);
  const ndc = p.clone().project(camera);
  close(ndc.x, ((col + 0.5) / cols) * 2 - 1, 1e-4, `cell ${col},${row}: on the cell centre's ray (x)`);
  close(ndc.y, ((row + 0.5) / rows) * 2 - 1, 1e-4, `cell ${col},${row}: on the cell centre's ray (y)`);
};
check(0, 13, 2, 1.8);
check(1, 4, 6, 22);
assert.equal(nearSurfacePoints(new Float32Array(cols * rows * 4), cols, rows, camera, 80, out), 0, 'an empty frame has no near surface');

console.log('filmDepthProbe selftest: ok');
