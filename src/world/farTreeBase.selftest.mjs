import assert from 'node:assert/strict';
import * as THREE from 'three';
import { shapeFarTreeBase } from './farTreeBase.ts';

for (const [top, radius, height] of [[.32,.55,2.9],[.22,.40,2.2],[.06,.16,5.4],[.23,.34,1.8]]) {
  for (const phase of [.7,1.9,2.8]) {
    const before = new THREE.CylinderGeometry(top, radius, height, 5, 1);
    const after = before.clone(), repeat = before.clone();
    shapeFarTreeBase(after, phase); shapeFarTreeBase(repeat, phase);
    assert.deepEqual(after.index.array, before.index.array, 'topology and triangle budget stay identical');
    assert.deepEqual(after.attributes.uv.array, before.attributes.uv.array, 'UV layout stays identical');
    assert.deepEqual(after.attributes.position.array, repeat.attributes.position.array, 'deterministic shape');
    const a = after.attributes.position, b = before.attributes.position;
    assert.equal(a.count, b.count, 'vertex budget stays identical');
    const radii = [];
    for (let i=0; i<a.count; i++) {
      assert.equal(a.getY(i), b.getY(i), 'terrain seat and height do not move');
      if (b.getY(i) > -height/2 + 1e-6) {
        assert.equal(a.getX(i), b.getX(i)); assert.equal(a.getZ(i), b.getZ(i));
      } else if (Math.hypot(b.getX(i), b.getZ(i)) > 1e-6) {
        radii.push(Math.hypot(a.getX(i), a.getZ(i)));
      }
    }
    assert(Math.max(...radii) - Math.min(...radii) > radius * .1, 'foot has an irregular outline');
    assert(Math.max(...radii) <= radius * 1.281, 'flare stays bounded inside the near-root envelope');
    assert([...after.attributes.normal.array].every(Number.isFinite), 'new normals are finite');
    before.dispose(); after.dispose(); repeat.dispose();
  }
}
console.log('farTreeBase: deterministic flared feet, exact topology/UV budgets, preserved height/seat and upper stem PASS');
