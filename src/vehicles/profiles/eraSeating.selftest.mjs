import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const n = new THREE.Vector3();

function triangles(mesh, accept) {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const found = [];
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    n.fromBufferAttribute(normal, i).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    const face = { centroid, normal: n.clone(), area };
    if (accept(face)) found.push(face);
  }
  return found;
}

// The removed chevron bars were single 0.8 m-wide panels. Their broad face
// triangles exceeded 0.10 m² inside this front-cheek envelope. Real T-80/B
// applique returns and the BV's individual Kontakt cassettes remain smaller.
for (const id of ['t80', 't80b', 't80bv']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const track = tank.root.getObjectByName('turretTrack');
  const continuousBars = track?.geometry ? triangles(track, ({ centroid, area }) =>
    area > 0.10 && Math.abs(centroid.x) > 0.45 && Math.abs(centroid.x) < 1.4
      && centroid.y > 0.15 && centroid.y < 0.75 && centroid.z > 0.70) : [];
  assert.equal(continuousBars.length, 0,
    `${id} has no redundant continuous turret ERA bar`);
  assert.equal(track, undefined,
    `${id} cheek protection inherits turret camouflage instead of generic gray track steel`);
  tank.dispose();
}

const oplot = createTank('ua_t84_oplot_m', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
assert.equal(oplot.root.getObjectByName('turretTrack'), undefined,
  'Oplot Duplet modules inherit the turret camouflage palette');
assert.equal(oplot.root.getObjectByName('hullTrack'), undefined,
  'Oplot Nozh modules inherit the hull camouflage palette');

function assertFlushFaceCaps(bodyName, capName, accept, minimum, label) {
  const body = oplot.root.getObjectByName(bodyName);
  const caps = oplot.root.getObjectByName(capName);
  assert.ok(body?.geometry && caps?.geometry, `${label} merged geometry exists`);
  const bodyFaces = triangles(body, (face) => accept(face) && face.normal.y > 0.90);
  const capFaces = triangles(caps, (face) => accept(face) && face.normal.y > 0.90);
  assert.ok(capFaces.length >= minimum, `${label} retains its cassette face cadence`);
  for (const cap of capFaces) {
    const mate = bodyFaces.find((face) => face.normal.dot(cap.normal) > 0.999
      && face.centroid.distanceTo(cap.centroid) < 0.14
      && Math.abs(face.centroid.clone().sub(cap.centroid).dot(cap.normal)) < 0.001);
    assert.ok(mate, `${label} cap is coplanar with its rotated cassette face`);
  }
}

assertFlushFaceCaps('turret', 'turretDark', ({ centroid, area }) =>
  area > 0.020 && area < 0.045 && Math.abs(centroid.x) > 0.40 && Math.abs(centroid.x) < 1.12
    && centroid.y > 0.50 && centroid.y < 0.86 && centroid.z > 0.78 && centroid.z < 1.90,
24, 'Oplot turret Duplet');

// On each side, the discrete face-cap course must sweep rearward as it moves
// away from the gun. This is the plan-view V/chevron law; a broad rectangular
// bar or an outward fan fails the monotonic inner-to-outer progression.
{
  const caps = oplot.root.getObjectByName('turretDark');
  const course = triangles(caps, ({ centroid, normal, area }) =>
    area > 0.020 && area < 0.045 && normal.y > 0.90
      && Math.abs(centroid.x) > 0.40 && Math.abs(centroid.x) < 1.12
      && centroid.y > 0.50 && centroid.y < 0.86
      && centroid.z > 0.78 && centroid.z < 1.90);
  for (const side of [-1, 1]) {
    const sideCaps = course.filter(({ centroid }) => Math.sign(centroid.x) === side)
      .sort((lhs, rhs) => Math.abs(lhs.centroid.x) - Math.abs(rhs.centroid.x));
    assert.ok(sideCaps.length >= 12, `Oplot ${side < 0 ? 'left' : 'right'} chevron keeps discrete modules`);
    const innerZ = Math.max(...sideCaps.slice(0, 4).map(({ centroid }) => centroid.z));
    const outerZ = Math.min(...sideCaps.slice(-4).map(({ centroid }) => centroid.z));
    assert.ok(innerZ - outerZ > 0.50,
      `Oplot ${side < 0 ? 'left' : 'right'} Duplet course forms a rearward-swept V`);
  }
}

assertFlushFaceCaps('hull', 'hullDark', ({ centroid, area }) =>
  area > 0.020 && area < 0.045 && Math.abs(centroid.x) > 0.15 && Math.abs(centroid.x) < 1.35
    && centroid.y > 1.15 && centroid.y < 1.46 && centroid.z > 1.95 && centroid.z < 2.70,
24, 'Oplot glacis Nozh');

oplot.dispose();
console.log('eraSeating.selftest: T-80 bars removed; Oplot ERA caps are carrier-seated');
