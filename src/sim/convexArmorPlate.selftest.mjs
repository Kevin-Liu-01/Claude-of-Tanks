import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { traceTank } from './armor.ts';
import { assertArmorTraceBounds, assertConvexArmorOutline } from './armorOutline.test-support.mjs';

const pose = { pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
const ring = Array.from({ length: 48 }, (_, i) => {
  const a = i * Math.PI * 2 / 48;
  return [Math.cos(a), Math.sin(a), 0];
});
const face = { name: 'one physical cap', kind: 'spaced', convexPolygon: true,
  verts: ring, physicalMm: 420, keMm: 420, ceMm: 420 };
assertConvexArmorOutline(ring, 'native 48-edge cap');
assert.throws(() => assertConvexArmorOutline([[0, 0, 0], [1, 0, 0]], 'missing face'));
assert.throws(() => assertConvexArmorOutline(ring.map((v, i) => i === 24 ? [v[0], v[1], .001] : v), 'twisted face'));
assert.throws(() => assertConvexArmorOutline([[0, 0, 0], [2, 0, 0], [1, .3, 0], [2, 2, 0], [0, 2, 0]], 'concave face'));
assert.throws(() => assertConvexArmorOutline([...ring, ring[0]], 'duplicate boundary'));
for (const edges of [[-1], [48], [.5], [0, 0]])
  assert.throws(() => assertConvexArmorOutline(ring, 'invalid boundary ownership', edges));
function hits(plates, x, y, start = 2, end = -2) {
  return traceTank(new Vector3(x, y, start), new Vector3(x, y, end), pose,
    { hullPlates: plates }).filter(hit => hit.kind === 'plate');
}

assert.equal(hits([face], 0, 0).length, 1, 'cap center is one layer, not 48 fan triangles');
for (let i = 0; i < 48; i++) {
  const a = i * Math.PI * 2 / 48;
  assert.equal(hits([face], .8 * Math.cos(a), .8 * Math.sin(a)).length, 1,
    'radial triangulation seams are not additional armor');
  assert.equal(hits([face], 1.001 * Math.cos(a), 1.001 * Math.sin(a)).length, 0,
    'outside the true cap remains empty');
}
assert.equal(hits([face], .95, .95).length, 0, 'bounding-square corner is not armor');
assert.equal(hits([face], 0, 0, -2, 2).length, 0, 'backface remains culled');
assert.equal(hits([{ ...face, verts: [...ring].reverse() }], 0, 0).length, 0,
  'winding determines the outward normal');
const behind = { ...face, verts: ring.map(([x, y]) => [x, y, -.5]) };
assert.equal(hits([face, behind], 0, 0).length, 2,
  'distinct physical layers are retained even with the same name');

const narrow = { ...face, verts: [[0, 0, 0], [.00001, 0, 0], [.00001, 1, 0], [0, 1, 0]] };
assertConvexArmorOutline(narrow.verts, 'valid narrow clipped armor strip');
assert.equal(hits([narrow], .000005, -.05).length, 0,
  'a 10-micrometre edge must not admit a shot 50 millimetres outside the sheet');
assert.equal(hits([narrow], .000005, .5).length, 1, 'the actual narrow stock is still hittable');
for (const width of [.00001, .001, 1, 100]) {
  const scaled = { ...face, verts: [[0, 0, 0], [width, 0, 0], [width, 1, 0], [0, 1, 0]] };
  assert.equal(hits([scaled], width / 2, -.000001).length, 0,
    'one-micrometre exterior gap is not widened by short or long polygon edges');
  assert.equal(hits([scaled], width / 2, 0).length, 1, 'exact physical edge stays included');
}

const cover = { ...face, surfaceGroup: 'installed exposed layer',
  verts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] };
const backing = { ...cover, openEdges: [2],
  verts: [[0, -1, -.005], [1, -1, -.005], [1, 0, -.005], [0, 0, -.005]] };
assert.equal(hits([cover, { ...backing, openEdges: undefined }], .5, 0).length, 2,
  'closed boundaries at distinct depths demonstrate the exact projected seam');
for (const y of [-.5, -.000001, -.00000001, 0, .00000001, .000001, .5]) {
  const actual = hits([cover, backing], .5, y);
  assert.equal(actual.length, 1, 'half-open cut ownership covers the edge once without a gap');
  assert.equal(actual[0].plate, y < -1e-7 ? backing : cover, 'outboard cover owns the boundary tolerance');
}
assert.equal(hits([backing], .5, -1).length, 1, 'unshared physical backing edge remains closed');
assert.equal(hits([backing], .5, 0).length, 0, 'only the explicitly owned cut edge is open');

const left = { ...face, surfaceGroup: 'one folded sheet',
  verts: [[-1, -1, 0], [0, -1, 0], [0, 1, 0], [-1, 1, 0]] };
const right = { ...left, verts: [[0, -1, 0], [1, -1, -.2], [1, 1, -.2], [0, 1, 0]] };
assert.equal(hits([left, right], 0, 0).length, 1, 'one folded-sheet seam charges once');
assert.equal(hits([{ ...left, surfaceGroup: undefined }, { ...right, surfaceGroup: undefined }], 0, 0).length, 2,
  'legacy unmarked facets retain their prior behavior');
assert.equal(hits([left, { ...right, surfaceGroup: 'another physical sheet' }], 0, 0).length, 2,
  'different physical sheets are not merged');
assert.equal(hits([left, { ...right, verts: right.verts.map(([x, y, z]) => [x, y, z - .001]) }], 0, 0).length, 2,
  'even a one-millimetre distinct layer survives');
assert.equal(hits([left, right], 0, 0, 5000, -5000).length, 1,
  'contact tolerance is physical rather than range-scaled');
assert.equal(hits([left, { ...right, gunFollow: true }], 0, 0).length, 2,
  'different moving owners are not merged');
for (const x of [-.9, -.1, .1, .9]) assert.equal(hits([left, right], x, 0).length, 1,
  'sheet interiors remain covered on both sides of the crease');

const quad = { ...face, convexPolygon: undefined,
  verts: [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]] };
assert.equal(hits([quad], .95, .95).length, 1, 'legacy quads retain their exact square coverage');
assert.equal(hits([{ ...quad, openEdges: [0, 1, 2, 3] }], 1, 0).length, 1,
  'half-open semantics cannot change an unopted legacy quad');
assert.equal(hits([{ ...quad, traceBounds: { min: [20, 20, 20], max: [21, 21, 21] } }], 0, 0).length, 1,
  'optional acceleration bounds cannot change an unopted legacy quad');
for (let x = -1.1; x <= 1.1; x += .11) for (let y = -1.1; y <= 1.1; y += .11) {
  const old = hits([quad], x, y);
  const opted = hits([{ ...quad, convexPolygon: true }], x, y);
  assert.equal(opted.length, old.length, 'quad and convex-quad boundaries agree');
  if (old.length) {
    assert.equal(opted[0].t, old[0].t);
    assert.deepEqual(opted[0].point.toArray(), old[0].point.toArray());
    assert.deepEqual(opted[0].normal.toArray(), old[0].normal.toArray());
  }
}

// A conservatively padded hand-authored envelope verifies only the tracer
// API here. The production envelope constructor has independent acute-corner
// and nonplanar-fallback tests; this does not certify naïve vertex bounds.
const bounds = { min: [-2, -2, -1], max: [2, 2, .001] };
assertArmorTraceBounds(ring, bounds, 'conservative cap envelope');
for (const invalid of [{ min: [0, 0, 0], max: [1, 1, 0] },
  { min: [0, 0, 0], max: [-1, 1, 0] }, { min: [-2, -2, -1], max: [NaN, 2, 1] }])
  assert.throws(() => assertArmorTraceBounds(ring, invalid, 'invalid bounds'));
const summary = result => JSON.stringify(result, (key, value) => key === 'traceBounds' ? undefined : value);
for (const plates of [[face], [narrow], [cover, backing], [left, right],
  [left, { ...right, gunFollow: true }], [face, behind]]) {
  const accelerated = plates.map(plate => ({ ...plate, traceBounds: bounds }));
  for (const x of [-4, -1.000001, -1, -.000001, 0, .000005, .5, .99999999, 1, 1.000001, 4])
    for (const y of [-4, -1, -.000001, -1e-8, 0, 1e-8, .5, 1, 1.000001, 4])
      for (const [start, end] of [[2, -2], [-2, 2], [5000, -5000], [.0001, -.0001]]) {
        const exact = summary(hits(plates, x, y, start, end));
        assert.equal(summary(hits(accelerated, x, y, start, end)), exact,
          'bounds preserve every hit field, layer, owner, seam and boundary result');
      }
}
console.log('convexArmorPlate: PASS — cap, sheet seams/air, owners/layers, conservative bounds and unchanged legacy quad coverage');
