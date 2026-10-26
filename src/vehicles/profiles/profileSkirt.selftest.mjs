import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitsInSkirt, profileSkirtGeometry, skirtBand, skirtBottomAt, skirtSegment, skirtTopAt } from './profileSkirt.ts';

// A skirt whose top runs level, then comes down an upper glacis, with a raked front and rear.
const skirt = { inner: 1.50, outer: 1.60, stations: [
  [-3.0, 1.10, 1.11], [-2.8, 0.80, 1.40], [1.5, 0.70, 1.45], [2.4, 0.75, 1.20], [2.8, 1.10, 1.11],
] };
for (const side of [1, -1]) {
  const geometry = profileSkirtGeometry(skirt, side);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  assert.ok(Math.abs(min.z + 3.0) < 1e-6 && Math.abs(max.z - 2.8) < 1e-6, 'spans its stations');
  assert.ok(Math.abs(max.y - 1.45) < 1e-6 && Math.abs(min.y - 0.70) < 1e-6, 'its top and bottom lines bound it');
  assert.ok(side > 0 ? min.x > 1.49 && max.x < 1.61 : max.x < -1.49 && min.x > -1.61, 'the plate on its own side');
  // closed and outward: the signed volume is positive (a sealed, correctly wound solid)
  const pos = geometry.getAttribute('position'), index = geometry.index;
  const count = index ? index.count : pos.count, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let k = 0; k < count; k += 3) {
    a.fromBufferAttribute(pos, index ? index.getX(k) : k);
    b.fromBufferAttribute(pos, index ? index.getX(k + 1) : k + 1);
    c.fromBufferAttribute(pos, index ? index.getX(k + 2) : k + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  assert.ok(volume > 0.2 && volume < 0.4, `a closed outward solid (${volume})`);
}
assert.equal(skirtTopAt(skirt, 1.95), 1.325);
assert.equal(skirtBottomAt(skirt, -0.65), 0.75);
assert.equal(skirtTopAt(skirt, 9), 1.11, 'held past the ends');
assert.ok(fitsInSkirt(skirt, -1, 0, 0.9, 1.3), 'a cassette on the level run fits');
assert.ok(!fitsInSkirt(skirt, 2.0, 2.4, 0.9, 1.3), 'one standing over the glacis line does not');
assert.ok(!fitsInSkirt(skirt, 2.5, 2.79, 0.9, 1.0), 'nor one past the raked front');
const rail = skirtBand(skirt, 0.02, 0.06, 1.60, 1.62);
assert.equal(rail.outer, 1.62);
assert.ok(Math.abs(skirtTopAt(rail, 1.5) - 1.43) < 1e-9 && Math.abs(skirtBottomAt(rail, 1.5) - 1.37) < 1e-9, 'a rail under the top line');
assert.equal(skirtBottomAt(rail, -3.0), 1.10, 'never below the bottom line at a raked end');
const field = skirtBand(skirt, 0.09, 9);
assert.ok(fitsInSkirt(field, -1, 0, 0.9, 1.3) && !fitsInSkirt(field, -1, 0, 0.9, 1.35), 'armour keeps under the rail');
const panel = skirtSegment(skirt, 1.0, 2.6, 1.55, 1.60);
assert.deepEqual(panel.stations.map(([z]) => z), [1.0, 1.5, 2.4, 2.6], 'a panel keeps the run\'s stations inside it');
assert.ok(Math.abs(skirtTopAt(panel, 1.95) - skirtTopAt(skirt, 1.95)) < 1e-9 && panel.inner === 1.55, 'on the run\'s lines');
assert.throws(() => profileSkirtGeometry({ ...skirt, stations: [[0, 1, 2], [0, 1, 2]] }, 1), /rear to front/);
console.log('profileSkirt selftest: swept closed skirts on both sides, profile lines, bands, segments and fit checks');
