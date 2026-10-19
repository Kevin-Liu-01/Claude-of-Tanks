// uprightPlates.selftest.mjs — no debris plate rests on its edge, no remnant stands over the building as drawn
// (destruction-slabs 227 round 4; the owner: "these weird ugly boxes/surfaces still randomly come up ... its with many
// buildings sometimes after shooting or impacts").
//
// Synthetic and deterministic: a resting drawing of a thick block with a 4 x 3 m plate standing upright beside it (one
// geometry, two pieces — a body's clump and the dark plate behind its cell) has only the plate laid on its broad side, its
// foot where it stood, the block untouched; a plate lying flat and a small upright tile stay; a body-frame geometry under a
// matrix lays the same plate in world space. A remnant pier 4 m tall where the building was drawn 2 m is cut to 2.5 m about
// its foot; one wholly over the drawn height (a held storey's member) and one where the drawn form is not known stand.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clampPieceTops, layUprightPlates } from './uprightPlates.ts';

const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
function box(x0, y0, z0, x1, y1, z1) {
  const p = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  return [
    ...quad(p(0), p(1), p(3), p(2)), ...quad(p(4), p(6), p(7), p(5)), ...quad(p(0), p(4), p(5), p(1)),
    ...quad(p(2), p(3), p(7), p(6)), ...quad(p(0), p(2), p(6), p(4)), ...quad(p(1), p(5), p(7), p(3)),
  ];
}
function geometryOf(tris) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return g;
}
/** Each 36-vertex box's y range and its least extent's axis, read back. */
function boxes(g, matrix = null) {
  const pos = g.getAttribute('position'), out = [];
  const v = new THREE.Vector3();
  for (let b = 0; b < pos.count / 36; b++) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = b * 36; i < b * 36 + 36; i++) {
      v.fromBufferAttribute(pos, i);
      if (matrix) v.applyMatrix4(matrix);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v.getComponent(k)); hi[k] = Math.max(hi[k], v.getComponent(k)); }
    }
    const ext = hi.map((h, k) => h - lo[k]);
    out.push({ lo, hi, ext, thin: ext.indexOf(Math.min(...ext)) });
  }
  return out;
}

// a block (1.6 m cube) and, apart from it, a plate 4 m along x, 3 m up, 0.08 m thick, its foot on the ground (y 0)
const block = box(0, 0, 0, 1.6, 1.6, 1.6);
const plate = box(3, 0, 0, 7, 3, 0.08);
const g = geometryOf([...block, ...plate]);
const before = boxes(g);
assert.equal(layUprightPlates(g), 1, 'one piece laid: the upright plate');
const after = boxes(g);
assert.deepEqual(after[0].lo.map((x) => +x.toFixed(4)), before[0].lo.map((x) => +x.toFixed(4)), 'the block is untouched');
assert.equal(after[1].thin, 1, 'the plate lies on its broad side (its least extent vertical)');
assert.ok(Math.abs(after[1].lo[1] - 0.02) < 1e-3, `its foot where it stood (lowest point ${after[1].lo[1].toFixed(3)} m)`);
assert.ok(after[1].ext[1] < 0.1, `flat: ${after[1].ext[1].toFixed(3)} m high`);
assert.equal(layUprightPlates(g), 0, 'laid once: nothing upright the second time');

// a plate lying flat and a small upright tile stay
const g2 = geometryOf([...box(0, 0, 0, 4, 0.08, 3), ...box(6, 0, 0, 7, 1, 0.05)]);
const b2 = boxes(g2);
assert.equal(layUprightPlates(g2), 0, 'a flat plate and a tile under 1.4 m are left alone');
assert.deepEqual(boxes(g2).map((b) => b.lo.map((x) => +x.toFixed(4))), b2.map((b) => b.lo.map((x) => +x.toFixed(4))));

// body frame under a matrix: a plate lying flat in its frame, turned upright by the body's pose, is laid in world space
const g3 = geometryOf(box(-2, -0.04, -1.5, 2, 0.04, 1.5));
const m = new THREE.Matrix4().compose(new THREE.Vector3(10, 1.5, 4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
assert.equal(layUprightPlates(g3, m), 1, 'the upright body plate laid');
const w3 = boxes(g3, m)[0];
assert.equal(w3.thin, 1, 'flat in the world');
assert.ok(Math.abs(w3.lo[1] - (1.5 - 1.5 + 0.02)) < 1e-3, `its world foot kept (${w3.lo[1].toFixed(3)} m)`);

// deterministic: the same drawing lays the same way
const g4 = geometryOf([...block, ...plate]);
layUprightPlates(g4);
assert.deepEqual(Array.from(g4.getAttribute('position').array), Array.from(g.getAttribute('position').array), 'bit-identical');

// remnant tops: a pier 4 m tall drawn 2 m at its spot is cut to 2.5 m about its foot; a held member wholly over the drawn
// height stands, and so does a pier where the drawn form is not known
const piers = geometryOf([...box(0, 0, 0, 0.6, 4, 0.6), ...box(5, 6, 0, 5.3, 7.5, 0.3), ...box(10, 0, 0, 10.6, 4, 0.6)]);
const topAt = (x) => (x < 3 ? 2 : x < 8 ? 2 : NaN);
assert.equal(clampPieceTops(piers, topAt, 0.5), 1, 'one pier cut down');
const pb = boxes(piers);
assert.ok(Math.abs(pb[0].hi[1] - 2.5) < 1e-4 && Math.abs(pb[0].lo[1]) < 1e-6, `the pier's top at 2.5 m, its foot kept (${pb[0].lo[1]}..${pb[0].hi[1]})`);
assert.ok(Math.abs(pb[1].hi[1] - 7.5) < 1e-6, 'the held member stands as drawn');
assert.ok(Math.abs(pb[2].hi[1] - 4) < 1e-6, 'unknown drawn form: as drawn');

console.log('uprightPlates selftest: an upright plate beside a block laid on its broad side at its foot (the block untouched), '
  + 'flat plates and tiles left alone, a body plate laid in world space, deterministic; a remnant pier cut to half a metre over '
  + 'the drawn form, a held member and an unknown spot left as drawn');
