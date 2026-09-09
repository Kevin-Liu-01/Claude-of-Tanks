import assert from 'node:assert/strict';
import { Vector3, Matrix4, Euler, Quaternion } from 'three';
import { traceTank, queryAimArmor } from './armor.ts';

const pose = { pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
const plate = (name, x0, x1, z = 0, extra = {}) => ({ name,
  verts: [[x0,-1,z],[x1,-1,z],[x1,1,z],[x0,1,z]],
  kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10, ...extra });
const model = (hullPlates, turretPlates = []) => ({ hullPlates, turretPlates });
const trace = (armor, distance = 2, p = pose, matrix = new Matrix4()) => traceTank(
  new Vector3(0,0,distance).applyMatrix4(matrix),
  new Vector3(0,0,-distance).applyMatrix4(matrix), p, armor);
const left = plate('left', -1, 0), right = plate('right', 0, 1);
const grouped = (p, group = 'continuous-sheet') => ({ ...p, surfaceGroup: group });
const legacy = trace(model([left, right]));
assert.equal(legacy.length, 2, 'legacy ungrouped crease behavior stays unchanged');
assert.equal(trace(model([grouped(left), grouped(right)])).length, 1,
  'one continuous sheet must not charge both facets at its shared edge');
assert.deepEqual(trace(model([grouped(left), grouped(right)]))[0],
  { ...legacy[0], plate: grouped(left) }, 'first authored facet owns the seam deterministically');
assert.equal(trace(model([grouped(left), grouped(right, 'other')])).length, 2);
assert.equal(trace(model([grouped(left, ''), grouped(right, '')])).length, 2);
assert.equal(trace(model([grouped(left), right])).length, 2);
assert.equal(trace(model([grouped(left)], [grouped(right)])).length, 2,
  'same group in distinct articulation frames remains two layers');
assert.equal(trace(model([], [grouped(left), { ...grouped(right), gunFollow: true }])).length, 2);
for (const distance of [0.01, 2, 1000]) {
  const front = grouped(plate('front', -1, 1));
  assert.equal(trace(model([front, grouped(plate('roundoff', -1, 1, -0.0000005))]), distance).length, 1);
  assert.equal(trace(model([front, grouped(plate('separate-depth', -1, 1, -0.000002))]), distance).length, 2,
    'tolerance is in metres, not normalized segment parameter');
}
const folded = grouped({ ...right, verts: [[0,-1,0],[1,-1,-0.3],[1,1,-0.3],[0,1,0]] });
assert.equal(trace(model([grouped(left), folded])).length, 1, 'angled sheet crease is a single contact');
const tiltedPose = { ...pose, pos: new Vector3(3,2,-5), yaw: 0.7, pitch: 0.2, roll: -0.1 };
const transform = new Matrix4().compose(tiltedPose.pos,
  new Quaternion().setFromEuler(new Euler(-tiltedPose.pitch, tiltedPose.yaw, tiltedPose.roll, 'YXZ')),
  new Vector3(1,1,1));
assert.equal(trace(model([grouped(left), folded]), 2, tiltedPose, transform).length, 1);
const aim = queryAimArmor(new Vector3(0,0,2), new Vector3(0,0,-1), 4,
  pose, model([grouped(left), grouped(right)]));
assert.equal(aim.layers.length, 1, 'HUD and combat consume the same one-layer trace');
console.log('armorSurfaceGroup: grouped sheet seams, depth/length/frame isolation, legacy parity PASS');

// The legacy area epsilon admits this ray 50mm outside a 10µm edge.
// Only expressly authored finite stock polygons change that behavior.
// excludedEdges: [] selects finite stock with no open cuts; the upstream
// convexPolygon/openEdges contract deliberately retains supporting-line air.
const tiny = { ...left, verts: [[0,0,0],[0.01,0,0],[0.01,0.00001,0],[0,0.00001,0]] };
const ray = (p, x, y, reverse = false) => traceTank(new Vector3(x,y,reverse ? -1 : 1),
  new Vector3(x,y,reverse ? 1 : -1), pose, model([p]));
assert.equal(ray(tiny, 0.06, 0.000005).length, 1, 'legacy fixed area tolerance stays unchanged');
assert.equal(ray({ ...tiny, convexPolygon: true, excludedEdges: [] }, 0.06, 0.000005).length, 0);
assert.equal(ray({ ...tiny, convexPolygon: true, excludedEdges: [] }, 0.005, 0.000005).length, 1);
assert.equal(ray({ ...tiny, convexPolygon: true, excludedEdges: [] }, 0.005, 0.000005, true).length, 0);
const triangle = { ...left, convexPolygon: true, excludedEdges: [], verts: [[0,0,0],[1,0,0],[0,1,0]] };
assert.equal(ray(triangle, 0.2, 0.2).length, 1);
assert.equal(ray(triangle, 0.6, 0.6).length, 0, 'triangle does not become its rectangular bounds');
assert.equal(ray({ ...triangle, verts: [[0,0,0],[1,0,0],[2,0,0]] }, 0, 0).length, 0);
assert.equal(ray({ ...triangle, verts: [] }, 0, 0).length, 0);
assert.equal(ray({ ...triangle, verts: [[0,0,0],[1e200,0,0],[0,1e200,0]] }, 0, 0).length, 0,
  'finite source numbers that overflow normal arithmetic must fail closed');
assert.equal(ray({ ...triangle, verts: [[0,0,0],[1e200,0,0],[0,1e-200,0]] }, 0, 0).length, 0,
  'overflowing edge lengths must not grant infinite edge tolerance');
for (const count of [4,8,12]) {
  const polygon = { ...triangle, verts: Array.from({ length: count }, (_, i) =>
    [Math.cos(i * 2 * Math.PI / count), Math.sin(i * 2 * Math.PI / count), 0]) };
  assert.equal(ray(polygon, 0, 0).length, 1);
  assert.equal(ray(polygon, 1.000001, 0).length, 0);
}
console.log('armorSurfaceGroup: finite convex stock faces, physical edge tolerance, legacy miss/hit parity PASS');

const leftOpen = { ...left, convexPolygon: true, excludedEdges: [1] };
const rightClosed = { ...right, convexPolygon: true, excludedEdges: [] };
assert.deepEqual(trace(model([leftOpen, rightClosed])).map(h=>h.plate.name), ['right'],
  'only the adjacent closed face owns a half-open cut boundary');
assert.equal(ray(leftOpen, -0.000001, 0).length, 1, 'half-open edge does not inset real stock');
assert.equal(ray(leftOpen, 0, 0).length, 0);
assert.equal(ray({ ...left, excludedEdges: [1] }, 0, 0).length, 1, 'legacy faces do not opt in implicitly');
const bounded = { ...triangle, traceBounds: { min: [-1e-7,-1e-7,-1e-7], max: [1.0000001,1.0000001,1e-7] } };
for(const [x,y]of [[0,0],[0.2,0.2],[0.8,0.1],[0.6,0.6],[1.1,0]]){
  const expected=ray(triangle,x,y),actual=ray(bounded,x,y);
  assert.deepEqual(actual.map(({plate,...hit})=>hit),expected.map(({plate,...hit})=>hit),
    'conservative bounds only prune definite misses');
}
console.log('armorSurfaceGroup: half-open union cut ownership and conservative broadphase parity PASS');
const acute={...triangle,verts:[[0,0,0],[1,0,0],[0,0.000001,0]]};
assert.equal(ray(acute,1.05,-0.00000005).length,0,
  'small supporting-line errors must not turn acute tips into 50mm phantom stock');
assert.equal(ray(acute,1.00000005,0).length,1,'true finite boundary tolerance remains available');

