// Panel plates (262 phase 2, off by default): off, traceTank is untouched; on, a shell meets the plate and normal of
// the armour panel it strikes and the slices' seams are sealed (a wedge crack between two slices closes); the same
// answers every build.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { traceTank, tracedCollisionCells } from './armor.ts';
import { sealSliceSeams, setArmorPanelPlates } from './armorPanelPlates.ts';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const plate = (name, verts, keMm = 50) => ({ name, kind: 'main', verts, physicalMm: keMm, keMm, ceMm: keMm });

// A hull slice: a box whose two top front corners may stand back (`frontBack`) and whose two top back corners may stand
// forward (`backForward`): its caps tilt, as a hull of a slice whose surface does not reach its boundary does; each
// triangle takes its plate from `faceOf`.
function slice(z0, z1, faceOf, frontBack = 0, backForward = 0) {
  const vertices = [[-1, 0, z0], [1, 0, z0], [1, 2, z0 + backForward], [-1, 2, z0 + backForward],
    [-1, 0, z1], [1, 0, z1], [1, 2, z1 - frontBack], [-1, 2, z1 - frontBack]];
  const quads = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]];
  const centre = [0, 1, (z0 + z1) / 2];
  const faces = [];
  for (const [a, b, c, d] of quads) for (const indices of [[a, b, c], [a, c, d]]) {
    const [p, q, r] = indices.map((i) => vertices[i]);
    const n = cross(sub(q, p), sub(r, p));
    const size = Math.hypot(...n);
    const normal = n.map((v) => v / size);
    const centroid = [0, 1, 2].map((k) => (p[k] + q[k] + r[k]) / 3);
    assert.ok(normal[0] * (centroid[0] - centre[0]) + normal[1] * (centroid[1] - centre[1]) + normal[2] * (centroid[2] - centre[2]) > 0, 'faces wind outward');
    faces.push({ indices, normal, constant: -(normal[0] * p[0] + normal[1] * p[1] + normal[2] * p[2]), center: centroid, plate: faceOf(normal, centroid) });
  }
  return { min: [-1, 0, z0], max: [1, 2, z1], vertices, faces };
}

const glacisUpper = plate('upper_glacis', [[-1, 1, 1], [1, 1, 1], [1, 2, 1], [-1, 2, 1]], 80);
const glacisLower = plate('lower_front', [[-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]], 40);
const side = plate('side_R', [[1, 0, 1], [1, 0, -1], [1, 2, -1], [1, 2, 1]], 30);
const sideL = plate('side_L', [[-1, 0, -1], [-1, 0, 1], [-1, 2, 1], [-1, 2, -1]], 30);
const roof = plate('roof', [[-1, 2, 1], [1, 2, 1], [1, 2, -1], [-1, 2, -1]], 20);
const rear = plate('rear', [[1, 0, -1], [-1, 0, -1], [-1, 2, -1], [1, 2, -1]], 20);
const belly = plate('belly', [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], 20);
const plates = [glacisUpper, glacisLower, side, sideL, roof, rear, belly];
// the authority's zigzag on the front: each triangle the plate nearest its centre
const faceOf = (normal, centre) => {
  if (normal[2] > 0.5) return centre[1] > 1 ? glacisUpper : glacisLower;
  if (normal[2] < -0.5) return rear;
  if (normal[1] > 0.5) return roof;
  if (normal[1] < -0.5) return belly;
  return normal[0] > 0 ? side : sideL;
};

// a hull of two slices, the front one's front face bent (its top right corner forward) so its two triangles are two
// planes and two plates; the rear slice's front cap and the front slice's back cap tilt apart: a wedge at z = 0, 12 cm
// at the roof, closed at the belly
const front = slice(0, 1, faceOf, 0, 0.06);
front.vertices[6] = [1, 2, 1.03];
front.max = [1, 2, 1.03];
front.faces = slice(0, 1, faceOf, 0, 0.06).faces.map((face) => {
  const [p, q, r] = face.indices.map((i) => front.vertices[i]);
  const n = cross(sub(q, p), sub(r, p));
  const size = Math.hypot(...n);
  const normal = n.map((v) => v / size);
  const centroid = [0, 1, 2].map((k) => (p[k] + q[k] + r[k]) / 3);
  return { ...face, normal, constant: -(normal[0] * p[0] + normal[1] * p[1] + normal[2] * p[2]), center: centroid, plate: faceOf(normal, centroid) };
});
const back = slice(-1, 0, faceOf, 0.06, 0);
const armor = {
  turretPivot: [0, 0, 0], gunPivot: [0, 0, 0], hullPlates: plates, turretPlates: [], modules: [], crew: [],
  collisionShells: { hull: [back, front], turret: [] },
};
const pose = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
const shot = (from, to) => traceTank(new THREE.Vector3(...from), new THREE.Vector3(...to), pose, armor);
const firstPlate = (hits) => hits.find((hit) => hit.kind === 'plate');

// off: the cell face's own plate, the cells as they are
setArmorPanelPlates(false);
assert.equal(tracedCollisionCells(armor.collisionShells.hull), armor.collisionShells.hull, 'off: the cells traced are the cells');
const offHits = [];
for (let y = 0.1; y < 2; y += 0.2) for (let x = -0.9; x < 1; x += 0.2) offHits.push(firstPlate(shot([x, y, 5], [x, y, -5])));
// a side shot down the seam's wedge (1.5 m up, z = 0.01) meets no plate: the crack
assert.equal(firstPlate(shot([5, 1.5, 0.01], [-5, 1.5, 0.01])), undefined, 'off: a shot along the wedge between the slices meets no plate');
// the authority's zigzag: a head-on shot just above the plates' border (y = 1.05) at the right takes the lower plate
const zig = firstPlate(shot([0.8, 1.05, 5], [0.8, 1.05, -5]));
assert.equal(zig.plate, glacisLower, 'off: the bent front triangle below the diagonal is the lower plate, above the border too');

// on: the panel's zone (straight border at y = 1) and its normal; the seam sealed
setArmorPanelPlates(true);
const sealedCells = tracedCollisionCells(armor.collisionShells.hull);
assert.notEqual(sealedCells, armor.collisionShells.hull, 'on: the seams are sealed copies');
assert.equal(sealSliceSeams(armor.collisionShells.hull), sealedCells, 'sealed once per cell list');
const capFaces = sealedCells[0].faces.filter((face) => face.normal[2] > 0.7);
assert.ok(capFaces.length && capFaces.every((face) => face.normal[2] === 1 && face.constant === 0), 'the rear slice\'s front cap is the boundary plane z = 0');
const sealedShot = firstPlate(shot([5, 1.5, 0.01], [-5, 1.5, 0.01]));
assert.ok(sealedShot && sealedShot.plate === side, 'on: the shot along the old wedge meets the side plate');
const straight = firstPlate(shot([0.8, 1.05, 5], [0.8, 1.05, -5]));
assert.equal(straight.plate, glacisUpper, 'on: above the plates\' border is the upper glacis, whatever the triangle');
const below = firstPlate(shot([0.8, 0.95, 5], [0.8, 0.95, -5]));
assert.equal(below.plate, glacisLower, 'on: below it, the lower plate');
// one panel, one normal: two head-on shots on the upper glacis meet it at the same angle
const a = firstPlate(shot([-0.6, 1.5, 5], [-0.6, 1.5, -5])), b = firstPlate(shot([0.7, 1.7, 5], [0.7, 1.7, -5]));
assert.ok(Math.abs(a.impactAngleDeg - b.impactAngleDeg) < 1e-9, `on: one panel, one angle (${a.impactAngleDeg} vs ${b.impactAngleDeg})`);
assert.ok(a.normal.z > 0.99, 'on: the hit normal is the panel\'s');
// every shot that hit with the flag off still hits, where it hit (only plates and angles change)
let k = 0;
for (let y = 0.1; y < 2; y += 0.2) for (let x = -0.9; x < 1; x += 0.2) {
  const on = firstPlate(shot([x, y, 5], [x, y, -5]));
  const off = offHits[k++];
  assert.equal(!!on, !!off, 'on: the same shots meet armour');
  if (on && off) assert.ok(Math.abs(on.t - off.t) < 1e-9, 'on: they meet it at the same point');
}
// deterministic: the same answers from a fresh copy of the cell list (its panels and lookup rebuilt)
const fresh = { ...armor, collisionShells: { hull: [...armor.collisionShells.hull], turret: [] } };
const again = firstPlate(traceTank(new THREE.Vector3(0.7, 1.7, 5), new THREE.Vector3(0.7, 1.7, -5), pose, fresh));
assert.equal(again.plate, b.plate, 'a fresh build meets the same plate');
assert.ok(Math.abs(again.impactAngleDeg - b.impactAngleDeg) < 1e-12 && Math.abs(again.t - b.t) < 1e-12, 'at the same angle and point');
setArmorPanelPlates(false);
assert.equal(firstPlate(shot([0.8, 1.05, 5], [0.8, 1.05, -5])).plate, glacisLower, 'off again: the cell faces\' plates');

console.log('armorPanelPlates.selftest: off untouched; on, panel zones and normals, sealed seams, the same shots at the same points, deterministic');
