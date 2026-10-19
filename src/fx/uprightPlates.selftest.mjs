// uprightPlates.selftest.mjs — no debris plate rests on its edge, no remnant stands over the building as drawn
// (destruction-slabs 227 round 4; the owner: "these weird ugly boxes/surfaces still randomly come up ... its with many
// buildings sometimes after shooting or impacts").
//
// Synthetic and deterministic: a resting drawing of a thick block with a 4 x 3 m plate standing upright beside it (one
// geometry, two pieces — a body's clump and the dark plate behind its cell) has only the plate laid on its broad side, its
// foot where it stood, the block untouched; a plate lying flat and a small upright tile stay; a body-frame geometry under a
// matrix lays the same plate in world space; one standing 1.5 m up on the heap lies on the ground under it. A remnant pier 4 m tall where the building was drawn 2 m is cut to 2.5 m about
// its foot; one wholly over the drawn height (a held storey's member) and one where the drawn form is not known stand.
// Perched plates (round 4, third pass): a 4 x 3 m plate 1.7 m up, a third of it on a block and the rest over nothing, is
// tilted off the block's edge until its far side meets the ground; one wholly on its block, one a hold holds (a record,
// a body) and one lying on the ground stay; one over nothing at all is lowered flat onto the ground; a plate on another
// drawing (`also`) is held by it; deterministic.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clampPieceTops, layPerchedPlates, layUprightPlates } from './uprightPlates.ts';

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

// where the ground is known, onto the ground under where it lies (a plate standing on the heap 1.5 m up)
const g5 = geometryOf(box(0, 1.5, 0, 4, 4.5, 0.08));
assert.equal(layUprightPlates(g5, null, (x) => (x > 2 ? 0.3 : 0.1)), 1);
const b5 = boxes(g5)[0];
assert.ok(b5.lo[1] >= 0.12 - 1e-3 && b5.lo[1] <= 0.32 + 1e-3, `laid onto the ground under it (${b5.lo[1].toFixed(3)} m)`);

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


// perched plates: a plate 1.7 m up over a block (x 0..1.6), reaching to x 4.2: a third of it held, the rest over nothing
const flat0 = () => 0;
const perch = (tris) => { const gg = geometryOf(tris); return { g: gg, d: [{ geometry: gg, matrix: null }] }; };
const pc = perch([...box(0, 0, 0, 1.6, 1.6, 3), ...box(0.2, 1.62, 0, 4.2, 1.7, 3)]);
assert.equal(layPerchedPlates(pc.d, [], flat0), 1, 'the perched plate laid');
const pcb = boxes(pc.g);
assert.deepEqual(pcb[0].lo.map((x) => +x.toFixed(4)), [0, 0, 0], 'its block untouched');
assert.ok(pcb[1].lo[1] < 0.06 && pcb[1].lo[1] > -0.01, `tilted until its far side meets the ground (lowest ${pcb[1].lo[1].toFixed(3)} m)`);
assert.ok(pcb[1].hi[1] > 1.5, `still on the block's edge (highest ${pcb[1].hi[1].toFixed(3)} m)`);
assert.equal(layPerchedPlates(pc.d, [], flat0), 0, 'laid once: not perched the second time');
// wholly on its block, held by a hold, or on the ground: left alone
const onBlock = perch([...box(0, 0, 0, 4, 1.6, 3), ...box(0, 1.62, 0, 4, 1.7, 3)]);
assert.equal(layPerchedPlates(onBlock.d, [], flat0), 0, 'a plate on its block stays');
const held = perch(box(0.2, 1.62, 0, 4.2, 1.7, 3));
const hold = { prepare() {}, held: (x) => x < 3.6 };
assert.equal(layPerchedPlates(held.d, [], flat0, hold), 0, 'a plate a record holds stays');
const ground = perch(box(0, 0, 0, 4, 0.08, 3));
assert.equal(layPerchedPlates(ground.d, [], flat0), 0, 'a plate on the ground stays');
// over nothing at all: lowered flat onto the ground under it
const air = perch(box(0, 2, 0, 4, 2.08, 3));
assert.equal(layPerchedPlates(air.d, [], () => 0.25), 1);
const ab = boxes(air.g)[0];
assert.ok(Math.abs(ab.lo[1] - 0.27) < 1e-3 && ab.ext[1] < 0.1, `lowered flat onto the ground (${ab.lo[1].toFixed(3)} m)`);
// a plate lying on another drawing (the heap: `also`) is held by it
const onHeap = perch(box(0, 1.62, 0, 4, 1.7, 3));
const heap = geometryOf(box(-0.5, 0, -0.5, 4.5, 1.6, 3.5));
assert.equal(layPerchedPlates(onHeap.d, [{ geometry: heap, matrix: null }], flat0), 0, 'held by the heap drawn under it');
// a chunk 0.45 m thick (an open piece the slab check reads facet by facet), perched the same way, is laid too
const chunk = perch([...box(0, 0, 0, 1.4, 1.3, 2.8), ...box(0.1, 1.32, 0, 3.9, 1.77, 2.8)]);
assert.equal(layPerchedPlates(chunk.d, [], flat0), 1, 'the perched chunk laid');
assert.ok(boxes(chunk.g)[1].lo[1] < 0.06, `its far side on the ground (${boxes(chunk.g)[1].lo[1].toFixed(3)} m)`);
// deterministic
const pc2 = perch([...box(0, 0, 0, 1.6, 1.6, 3), ...box(0.2, 1.62, 0, 4.2, 1.7, 3)]);
layPerchedPlates(pc2.d, [], flat0);
assert.deepEqual(Array.from(pc2.g.getAttribute('position').array), Array.from(pc.g.getAttribute('position').array), 'perched: bit-identical');

console.log('uprightPlates selftest: an upright plate beside a block laid on its broad side at its foot (the block untouched), '
  + 'flat plates and tiles left alone, a body plate laid in world space, deterministic; a remnant pier cut to half a metre over '
  + 'the drawn form, a held member and an unknown spot left as drawn; a perched plate tilted off its block onto the ground, one over '
  + 'nothing lowered flat, plates held by their block, a hold, the ground or another drawing left alone');
