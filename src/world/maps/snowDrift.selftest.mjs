import assert from 'node:assert/strict';
import { SphereGeometry } from 'three';
import { createSnowDrift } from './snowDrift.ts';

const original = new SphereGeometry(1, 24, 10);
for (const slope of [0, 0.05, -0.12]) {
  let queries = 0;
  const ground = (x, z) => -2 + slope * x + slope * 0.3 * z;
  const field = { getHeightAt(x, z) { queries++; return ground(x, z); } };
  const drift = createSnowDrift(field, 30, -70, 12, 2, 0.2, -0.6);
  assert.equal(queries, 25, 'construction support is bounded to center + one perimeter ring');
  assert.equal(drift.attributes.position.count, 97);
  assert.equal(drift.index.count / 3, 168);
  assert.ok(drift.index.count < original.index.count / 2, 'fewer than half the old sphere triangles');
  const p = drift.attributes.position, n = drift.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const clearance = p.getY(i) - ground(p.getX(i), p.getZ(i));
    assert.ok(clearance >= -0.026 && clearance <= 0.201);
    assert.ok(n.getY(i) > 0, 'upper surface faces upward; no flipped fans');
    if (i > 72) assert.ok(Math.abs(clearance + 0.025) < 1e-5, 'outer rim is buried, not outlined above ice');
  }
  const radii = [];
  const ca = Math.cos(-0.6), sa = Math.sin(-0.6);
  for (let i = 73; i < 97; i++) {
    const dx = p.getX(i) - 30, dz = p.getZ(i) + 70;
    radii.push(Math.hypot((ca * dx - sa * dz) / 12, (sa * dx + ca * dz) / 2));
  }
  assert.ok(Math.max(...radii) - Math.min(...radii) > 0.2, 'outline is not another scaled ellipse');
  const repeat = createSnowDrift(field, 30, -70, 12, 2, 0.2, -0.6);
  assert.deepEqual(drift.attributes.position.array, repeat.attributes.position.array);
  drift.dispose(); repeat.dispose();
}
original.dispose();
console.log('snowDrift.selftest: irregular buried rims, upward faces, 168 triangles vs 432; deterministic planar support');
