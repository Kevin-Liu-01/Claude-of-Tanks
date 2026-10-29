// Zone plates (262 phase 2, off by default): off, traceTank is untouched; on, a shell meets the plate of the armour zone
// the scoped paint shows where it strikes (sim/armorZones.ts zoneAt: straight borders), at the face's angle or, with plate
// angles, at the zone plate's; the slices' seams are sealed (a wedge crack between two slices closes); the same answers
// every build.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { traceTank, tracedCollisionCells } from './armor.ts';
import { sealSliceSeams, setArmorZonePlates } from './armorZonePlates.ts';
import { zoneAt, zonePlates } from './armorZones.ts';

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
setArmorZonePlates(false);
assert.equal(tracedCollisionCells(armor.collisionShells.hull), armor.collisionShells.hull, 'off: the cells traced are the cells');
const offHits = [];
for (let y = 0.1; y < 2; y += 0.2) for (let x = -0.9; x < 1; x += 0.2) offHits.push(firstPlate(shot([x, y, 5], [x, y, -5])));
// a side shot down the seam's wedge (1.5 m up, z = 0.01) meets no plate: the crack
assert.equal(firstPlate(shot([5, 1.5, 0.01], [-5, 1.5, 0.01])), undefined, 'off: a shot along the wedge between the slices meets no plate');
// the authority's zigzag: a head-on shot just above the plates' border (y = 1.05) at the right takes the lower plate
const zig = firstPlate(shot([0.8, 1.05, 5], [0.8, 1.05, -5]));
assert.equal(zig.plate, glacisLower, 'off: the bent front triangle below the diagonal is the lower plate, above the border too');

// on: the zone (straight border at y = 1); the seam sealed
setArmorZonePlates(true);
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
// the face's angle by default: the bent triangle's shot keeps its own tilt; with plate angles, the plate's (head-on: 0°)
const b = firstPlate(shot([0.7, 1.7, 5], [0.7, 1.7, -5]));
assert.ok(b.impactAngleDeg > 0.1, `on (face angles): the bent face's own angle (${b.impactAngleDeg})`);
setArmorZonePlates(true, { angles: 'plate' });
const level = firstPlate(shot([0.7, 1.7, 5], [0.7, 1.7, -5]));
assert.ok(level.impactAngleDeg < 1e-6 && level.normal.z > 0.999999, `on (plate angles): the upper glacis plate's angle (${level.impactAngleDeg})`);
setArmorZonePlates(true);
// every shot that hit with the flag off still hits, where it hit (only plates and angles change)
let k = 0;
for (let y = 0.1; y < 2; y += 0.2) for (let x = -0.9; x < 1; x += 0.2) {
  const on = firstPlate(shot([x, y, 5], [x, y, -5]));
  const off = offHits[k++];
  assert.equal(!!on, !!off, 'on: the same shots meet armour');
  if (on && off) assert.ok(Math.abs(on.t - off.t) < 1e-9, 'on: they meet it at the same point');
}
// deterministic: the same answers from a fresh copy of the cell list (its sealed copy rebuilt)
const fresh = { ...armor, collisionShells: { hull: [...armor.collisionShells.hull], turret: [] } };
const again = firstPlate(traceTank(new THREE.Vector3(0.7, 1.7, 5), new THREE.Vector3(0.7, 1.7, -5), pose, fresh));
assert.equal(again.plate, b.plate, 'a fresh build meets the same plate');
assert.ok(Math.abs(again.impactAngleDeg - b.impactAngleDeg) < 1e-12 && Math.abs(again.t - b.t) < 1e-12, 'at the same angle and point');
setArmorZonePlates(false);
assert.equal(firstPlate(shot([0.8, 1.05, 5], [0.8, 1.05, -5])).plate, glacisLower, 'off again: the cell faces\' plates');


// the mantlet's footprint first (Main's ruling, 262): a forward surface (n.z > 0.2) over a mantlet or gun-notch plate's
// footprint (its x range, its height +-0.1 m, its z range +-0.35 m) reads that plate, where the score gives another
{
  const mantlet = plate('turret_gun_mantlet', [[-0.3, 1.6, 0.9], [0.3, 1.6, 0.9], [0.3, 2, 0.9], [-0.3, 2, 0.9]], 450);
  // a wrap-around cheek (CR1 Mk 2's): its plane 10 cm proud of the recessed mantlet, its outline across the gun
  const cheek = plate('turret_cheek', [[-1, 1.4, 1], [1, 1.4, 1], [1, 2.2, 1], [-1, 2.2, 1]], 600);
  const wrap = zonePlates([cheek, mantlet]);
  assert.ok(wrap[1].footprint && !wrap[0].footprint, 'the mantlet carries a footprint, the cheek none');
  assert.deepEqual(wrap[1].footprint.min.map((v) => +v.toFixed(6)), [-0.3, 1.5, 0.55], 'the footprint\'s min: x range, height - 0.1, z - 0.35');
  assert.deepEqual(wrap[1].footprint.max.map((v) => +v.toFixed(6)), [0.3, 2.1, 1.25], 'its max');
  assert.equal(zoneAt(wrap, 0, 1.8, 1, 0, 0, 1), 1, 'the face in front of the gun on the cheek\'s plane reads the mantlet');
  assert.equal(zoneAt(wrap, 0.5, 1.8, 1, 0, 0, 1), 0, 'beside the footprint, the cheek');
  assert.equal(zoneAt(wrap, 0, 2.15, 1, 0, 0, 1), 0, 'above its height + 0.1 m, the cheek');
  assert.equal(zoneAt(wrap, 0, 1.8, 1, 0.98868599, 0, 0.15), 0, 'a surface turned sideways (n.z <= 0.2) keeps its score');
  // a low Soviet-pattern turret (T-90AM's): the sloped roof faces the gun's face better than the upright mantlet does
  const roofForward = plate('turret_roof_forward', [[-1, 1.5, 1.1], [1, 1.5, 1.1], [1, 2.3, 0.5], [-1, 2.3, 0.5]], 40);
  const low = zonePlates([roofForward, mantlet]);
  const up = [0, 0.7, 0.714142842854285];
  assert.equal(zoneAt([low[0]], 0, 1.8, 0.95, ...up), 0, 'the score alone gives the gun face the roof');
  assert.equal(zoneAt(low, 0, 1.8, 0.95, ...up), 1, 'over the footprint it reads the mantlet');
  // deterministic and order-free: the deepest footprint wins, the same every time
  assert.equal(zoneAt(zonePlates([mantlet, cheek]), 0, 1.8, 1, 0, 0, 1), 0, 'the plate order does not change the answer');
}
console.log('armorZonePlates.selftest: off untouched; on, straight zone borders, sealed seams, face or plate angles, the mantlet footprint, the same answers every build');

