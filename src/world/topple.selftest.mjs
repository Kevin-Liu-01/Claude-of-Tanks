/**
 * Regression test for ram-direction hinge math.
 * Run with: node src/world/topple.selftest.mjs
 */

import { Quaternion, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { setToppleAxis, settledToppleAngle } from './topple.js';

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

const flat = { getHeightAt: () => 0 };
const uphill = { getHeightAt: (x) => x * 0.12 };
const downhill = { getHeightAt: (x) => -x * 0.12 };
const flatAng = settledToppleAngle(flat, 0, 0, 0, 1, 0, 7, 0.12);
const upAng = settledToppleAngle(uphill, 0, 0, 0, 1, 0, 7, 0.12);
const downAng = settledToppleAngle(downhill, 0, 0, 0, 1, 0, 7, 0.12);
if (flatAng < 1.50 || flatAng > Math.PI / 2) {
  throw new Error(`level-ground object did not settle nearly flat (${flatAng})`);
}
if (!(upAng < flatAng)) throw new Error('uphill ground should stop a fall earlier');
if (!(downAng > flatAng)) throw new Error('downhill ground should let a fall lean farther');

// These pose functions execute once per active destruction animation per RAF
// frame. Keep their transform composition allocation-free as the world grows.
const propsSource = readFileSync(new URL('./props.js', import.meta.url), 'utf8');
for (const [name, endNeedle] of [
  ['poseToppled', 'function pushCrushAnim('],
  ['poseTossed', 'const _looseQ'],
]) {
  const start = propsSource.indexOf(`function ${name}(`);
  const end = propsSource.indexOf(endNeedle, start);
  if (start < 0 || end < 0) throw new Error(`missing ${name} hot-path source`);
  const body = propsSource.slice(start, end);
  if (body.includes('new THREE.Matrix4')) {
    throw new Error(`${name} allocates Matrix4 inside the per-frame world update`);
  }
}
