import assert from 'node:assert/strict';
import { sectionSolid } from './sectionSolid.ts';

const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const concave = [[-1, -1], [1, -1], [1, 0], [0, 0], [0, 1], [-1, 1]];
for (const [ring, expectedVolume] of [[square, 8], [concave, 6]]) {
  const geometry = sectionSolid([{ z: -1, ring }, { z: 1, ring }]);
  const p = geometry.getAttribute('position');
  const edges = new Map();
  let volume = 0;
  const point = (i) => [p.getX(i), p.getY(i), p.getZ(i)];
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [point(i), point(i + 1), point(i + 2)];
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const keys = [u.join(','), v.join(',')];
      const sign = keys[0] < keys[1] ? 1 : -1;
      const key = keys.sort().join('|');
      const row = edges.get(key) ?? { count: 0, winding: 0 };
      row.count++; row.winding += sign; edges.set(key, row);
    }
  }
  assert.ok(Math.abs(volume - expectedVolume) < 1e-6, 'outward closed volume');
  for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, winding: 0 });
  geometry.dispose();
}
assert.throws(() => sectionSolid([]), /two/);
assert.throws(() => sectionSolid([{ z: 1, ring: square }, { z: 0, ring: square }]), /increasing/);
assert.throws(() => sectionSolid([{ z: 0, ring: square }, { z: 1, ring: [...square].reverse() }]), /counter-clockwise/);
assert.throws(() => sectionSolid([{ z: 0, ring: square }, { z: 1, ring: concave }]), /correspondence/);
console.log('sectionSolid: convex/concave caps, watertight winding and invalid inputs passed');
