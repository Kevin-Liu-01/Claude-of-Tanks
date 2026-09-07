import assert from 'node:assert/strict';
import { calibrationOrientationPoint, stockCollisionCoverCandidates, stockCollisionFaceCovered } from './calibrationStockGeometry.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';

const tetra = {
  min: [0, 0, 0], max: [1, 1, 1],
  vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
  faces: [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]],
};
assert.deepEqual(calibrationOrientationPoint(tetra), [.5, .5, .5], 'legacy arithmetic unchanged');
assert.throws(() => calibrationOrientationPoint({ ...tetra, sourceStock: 'incomplete' }), /missing its interior/);
assert.deepEqual(calibrationOrientationPoint({ ...tetra, interiorPoint: [.25, .25, .25] }),
  [.25, .25, .25], 'new wedge orientation uses an actually interior point');
assert.throws(() => calibrationOrientationPoint({ ...tetra, interiorPoint: [.5, .5, .5] }),
  /vertex-mean/, 'outside AABB midpoint is not accepted as an interior witness');
for (const interiorPoint of [[NaN, 0, 0], [Infinity, 0, 0], [0, 0], []]) {
  assert.throws(() => calibrationOrientationPoint({ ...tetra, interiorPoint }), /vertex-mean/);
}
const thin = { ...tetra, max: [1e-5, 1, 1], vertices: tetra.vertices.map(p => [p[0] * 1e-5, p[1], p[2]]) };
assert.deepEqual(calibrationOrientationPoint({ ...thin, interiorPoint: [2.5e-6, .25, .25] }),
  [2.5e-6, .25, .25]);

function box(min, max) {
  const vertices = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
    .map(p => p.map((v, i) => v ? max[i] : min[i]));
  const sides = [
    [[0,3,2,1], [0,0,-1]], [[4,5,6,7], [0,0,1]],
    [[0,4,7,3], [-1,0,0]], [[1,2,6,5], [1,0,0]],
    [[0,1,5,4], [0,-1,0]], [[3,7,6,2], [0,1,0]],
  ];
  const faces = sides.flatMap(([q, normal]) => [[q[0],q[1],q[2]], [q[0],q[2],q[3]]].map(indices => ({
    indices, normal, constant: -normal.reduce((sum, n, i) => sum + n * vertices[indices[0]][i], 0),
  })));
  return { min, max, vertices, faces };
}
const left = box([-2,0,0], [-1,1,1]);
const right = box([1,0,0], [2,1,1]);
for (const cell of [left, right]) for (const face of cell.faces) {
  assert.equal(stockCollisionFaceCovered(cell, face, [left, right]), false,
    'disconnected cheeks sharing Z end stations keep all exposed faces');
}
const front = box([-2,0,1], [-1,1,2]);
const separated = Array.from({ length: 64 }, (_, i) => box([4 + i * 2,0,0], [5 + i * 2,1,1]));
const adjacent = [left, right, front, ...separated];
assert.deepEqual(stockCollisionCoverCandidates(left, adjacent), [front]);
for (const gap of [-1e-8, 0, 5e-10, 1e-9, 2e-9, 1e-8, 5e-7, .001]) {
  const candidate = box([-2,0,1 + gap], [-1,1,2]);
  const cells = [left, right, candidate, ...separated];
  for (const cell of cells) for (const face of cell.faces) {
    assert.equal(stockCollisionFaceCovered(cell, face, stockCollisionCoverCandidates(cell, cells)),
      stockCollisionFaceCovered(cell, face, cells), 'candidate rejection preserves exhaustive coverage at seams and tiny gaps');
  }
}
for (const face of left.faces.filter(f => f.normal[2] === 1)) {
  assert.equal(stockCollisionFaceCovered(left, face, [left, front]), true, 'full shared seam is internal');
  assert.equal(stockCollisionFaceCovered(left, face, [left, box([-2,0,1], [-1.5,1,2])]), false,
    'partially covered triangle remains visible');
  assert.equal(stockCollisionFaceCovered(left, face, [left, box([-2,0,1.001], [-1,1,2])]), false,
    'a real gap is not hidden');
  for (const gap of [5e-7, 1e-8]) {
    assert.equal(stockCollisionFaceCovered(left, face, [left, box([-2,0,1 + gap], [-1,1,2])]), false,
      'a gap smaller than the outward witness offset is still real air');
  }
}
function finalizeCells(cells) {
  const outer = box([-3, -1, -1], [3, 2, 3]);
  const plates = outer.faces.map((face, index) => ({ name: `donor-${index}`, kind: 'main',
    physicalMm: 100, keMm: 110, ceMm: 120, verts: face.indices.map(i => outer.vertices[i].slice()) }));
  const spec = { id: 'independent-stock-test', role: 'medium', armor: {
    turretPivot: [0,0,0], hullPlates: structuredClone(plates), turretPlates: plates, modules: [], crew: [],
  } };
  const calibration = { hull: outer, turret: outer, hullCollision: [], turretCollision: cells,
    tracks: { left: outer, right: outer } };
  return finalizeCombatAnatomy(spec, calibration).armor.collisionShells.turret;
}
const converted = finalizeCells([{ ...tetra, interiorPoint: [.25,.25,.25], sourceStock: 'wedge' }]);
assert.equal(converted.length, 1);
for (const face of converted[0].faces) {
  assert.ok(face.normal.reduce((sum, n) => sum + n * .25, face.constant) < 0,
    'actual runtime conversion orients every tetra face outward');
  assert.equal(face.plate.physicalMm, 100, 'conversion retains authored donor armor');
}
const stock = (cell, name) => ({ ...cell, faces: cell.faces.map(face => face.indices),
  interiorPoint: cell.min.map((v, i) => (v + cell.max[i]) / 2), sourceStock: name });
for (const cell of finalizeCells([stock(left, 'left'), stock(right, 'right')])) {
  assert.ok(cell.faces.every(face => face.internal === false), 'actual overlay keeps disjoint front caps');
}
const legacy = finalizeCells([{ ...left, faces: left.faces.map(face => face.indices) }]);
assert.equal(Object.hasOwn(legacy[0], 'sourceStock'), false, 'legacy output gains no metadata fields');
console.log('calibrationStockGeometry: legacy center/output, actual tetra conversion, finite interior witnesses, thin wedge and independent-stock faces PASS');
