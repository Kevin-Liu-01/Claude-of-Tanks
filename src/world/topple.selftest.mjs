/**
 * Regression test for ram-direction hinge math.
 * Run with: node src/world/topple.selftest.mjs
 */

import { Quaternion, Vector3 } from 'three';
import { setToppleAxis } from './topple.js';

const axis = new Vector3();
const up = new Vector3(0, 1, 0);
const q = new Quaternion();

for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [3, 4]]) {
  setToppleAxis(axis, dx, dz);
  q.setFromAxisAngle(axis, Math.PI / 2);
  const fallen = up.clone().applyQuaternion(q);
  const l = Math.hypot(dx, dz);
  const ex = dx / l, ez = dz / l;
  if (Math.abs(fallen.x - ex) > 1e-9 || Math.abs(fallen.z - ez) > 1e-9) {
    throw new Error(
      `topple direction (${dx}, ${dz}) fell toward (${fallen.x}, ${fallen.z})`
    );
  }
}
