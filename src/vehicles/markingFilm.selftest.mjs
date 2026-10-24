// Markings painted on the armour under their seats (markingFilm.ts; 2026-10-23, lane 243, the owner's "insignias and
// marks on tanks are still glitching ... if u drag them around the tank gallery"). A flat quad held 6 mm off its
// solved point stood up to 2 cm off rounded and stepped armour, hung past plate edges and sank into bulges.
//   1. on a curved plate, a stepped plate, a mirrored plate and a plate hidden behind another, every film triangle
//      stands MARKING_FILM_LIFT_M off the face it was cut from, inside the seat's footprint, facing out;
//   2. on the fleet (flat seats and the seats whose quads hung furthest off their armour), every marking is a film
//      and every film triangle stands the lift off the armour it is painted on.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { MARKING_FILM_LIFT_M, markingFilmGeometry } from './markingFilm.ts';

const TOLERANCE_M = 0.0003;
const raycaster = new THREE.Raycaster();
const centroid = new THREE.Vector3(), faceNormal = new THREE.Vector3();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

/** Each film triangle's lift off `surfaces`, measured from just above its centroid back along its face normal (world
 * frame; from just above, so armour overhanging the painted face does not read). */
function filmLifts(film, surfaces) {
  film.updateWorldMatrix(true, false);
  const position = film.geometry.getAttribute('position');
  const lifts = [];
  const sides = surfaces.map((mesh) => [mesh.material, mesh.material.side]);
  for (const [material] of sides) material.side = THREE.DoubleSide;
  try {
    for (let i = 0; i + 2 < position.count; i += 3) {
      a.fromBufferAttribute(position, i).applyMatrix4(film.matrixWorld);
      b.fromBufferAttribute(position, i + 1).applyMatrix4(film.matrixWorld);
      c.fromBufferAttribute(position, i + 2).applyMatrix4(film.matrixWorld);
      faceNormal.subVectors(b, a).cross(centroid.subVectors(c, a));
      if (faceNormal.length() < 2e-6) continue; // under a square millimetre: a ray cannot read it
      faceNormal.normalize();
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      raycaster.set(centroid.clone().addScaledVector(faceNormal, 0.0005), faceNormal.clone().negate());
      raycaster.far = 0.05;
      const hit = raycaster.intersectObjects(surfaces, false)[0];
      lifts.push(hit ? hit.distance - 0.0005 : null);
    }
  } finally {
    for (const [material, side] of sides) material.side = side;
  }
  return lifts;
}

/** Inside the footprint, give or take the lift along a tilted face's normal. */
function footprintOk(geometry, size) {
  const position = geometry.getAttribute('position');
  const reach = 0.5 + MARKING_FILM_LIFT_M / size + 1e-5;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getX(i)) > reach || Math.abs(position.getY(i)) > reach) return false;
  }
  return true;
}

// ---- 1. built armour ------------------------------------------------------------------------------------------------
{
  const owner = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  // a curved cheek: a 0.9 m radius cylinder wall facing +x
  const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 64, 4, true, Math.PI / 4, Math.PI / 2), material);
  cheek.name = 'turret';
  owner.add(cheek);
  owner.updateMatrixWorld(true);
  const seat = new THREE.Vector3(0.9 + 0.006, 0, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  const geometry = markingFilmGeometry([cheek], owner, seat, quaternion, 0.4);
  assert.ok(geometry, 'a curved cheek takes the film');
  assert.ok(footprintOk(geometry, 0.4), 'the film stays inside the seat footprint');
  const film = new THREE.Mesh(geometry, material);
  film.position.copy(seat); film.quaternion.copy(quaternion); film.scale.setScalar(0.4);
  owner.add(film);
  const lifts = filmLifts(film, [cheek]);
  assert.ok(lifts.length > 8 && lifts.every((lift) => lift !== null && Math.abs(lift - MARKING_FILM_LIFT_M) < TOLERANCE_M),
    `every film triangle stands ${MARKING_FILM_LIFT_M} m off the curved cheek (${lifts.map((l) => l?.toFixed(5)).join(' ')})`);
  // the flat quad's edges would stand off this cheek by 0.9 - sqrt(0.9² - 0.2²) ~ 2.3 cm: the film follows it
  const zs = Array.from({ length: geometry.getAttribute('position').count }, (_, i) => geometry.getAttribute('position').getZ(i) * 0.4);
  assert.ok(Math.min(...zs) < -0.02, 'the film bends with the cheek, away from the seat plane');
  owner.remove(film);
}
{
  // a stepped plate (2.5 cm proud over half the footprint), a plate hidden 1.3 cm behind the step, a face turned
  // away, and a mirrored plate (scale.x = -1): only the front-most faces that look at the seat take paint
  const owner = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const plate = (name, w, h, x, y, z, mirrored = false) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.name = name; mesh.position.set(x, y, z);
    if (mirrored) mesh.scale.x = -1;
    owner.add(mesh);
    return mesh;
  };
  const back = plate('back', 1, 1, 0, 0, 0);
  const step = plate('step', 0.5, 1, 0.25, 0, 0.025);
  const hidden = plate('hidden', 0.4, 0.4, 0.25, 0, 0.012);
  const away = plate('away', 1, 1, 0, 0, 0.01); away.rotation.y = Math.PI;
  const mirroredPlate = plate('mirrored', 0.3, 0.3, -2, 0, 0, true);
  owner.updateMatrixWorld(true);
  const quaternion = new THREE.Quaternion();
  const geometry = markingFilmGeometry([back, step, hidden, away], owner, new THREE.Vector3(0, 0, 0.006), quaternion, 0.6);
  assert.ok(geometry && footprintOk(geometry, 0.6), 'the stepped plate takes the film inside the footprint');
  const film = new THREE.Mesh(geometry, material);
  film.position.set(0, 0, 0.006); film.scale.setScalar(0.6);
  owner.add(film);
  const lifts = filmLifts(film, [back, step]);
  assert.ok(lifts.every((lift) => lift !== null && Math.abs(lift - MARKING_FILM_LIFT_M) < TOLERANCE_M),
    'every film triangle stands the lift off the front-most plate under it');
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) * 0.6, z = position.getZ(i) * 0.6 + 0.006;
    assert.ok(Math.abs(z - (x > 1e-4 ? 0.025 : 0) - MARKING_FILM_LIFT_M) < 1e-4 || Math.abs(x) < 1e-4,
      `film vertex (${x.toFixed(3)}, ${z.toFixed(4)}) paints the step or the back plate, never the hidden one`);
  }
  // front faces out: the film's winding faces the seat's normal
  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    assert.ok(faceNormal.subVectors(b, a).cross(centroid.subVectors(c, a)).z > 0, 'film triangles face out of the armour');
  }
  const mirroredFilm = markingFilmGeometry([mirroredPlate], owner, new THREE.Vector3(-2, 0, 0.006), quaternion, 0.2);
  assert.ok(mirroredFilm, 'a mirrored plate takes the film');
  const mp = mirroredFilm.getAttribute('position');
  for (let i = 0; i + 2 < mp.count; i += 3) {
    a.fromBufferAttribute(mp, i); b.fromBufferAttribute(mp, i + 1); c.fromBufferAttribute(mp, i + 2);
    assert.ok(faceNormal.subVectors(b, a).cross(centroid.subVectors(c, a)).z > 0, 'a mirrored plate\'s film faces out');
  }
  assert.equal(markingFilmGeometry([away], owner, new THREE.Vector3(0, 0, 0.006), quaternion, 0.6), null,
    'a face turned away from the seat takes no paint');
}

// ---- 2. the fleet ---------------------------------------------------------------------------------------------------
installCanvasFixture();
const warn = console.warn;
console.warn = () => {};
const { createTank } = await import('./tankFactory.ts');
const { vehicleMarkingSurfaces } = await import('./vehicleMarkingSeating.ts');
console.warn = warn;
// flat seats, and the seats whose quads stood furthest off their armour (vehicleMarkingSeatGroups maximumSurfaceErrorM)
const IDS = (process.env.MARKING_FILM_IDS || 'm1a2_abrams,leclerc_s2,type10b,warrior_tes_h,t80u_yun').split(',');
for (const id of IDS) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high' });
  tank.root.updateMatrixWorld(true);
  const marks = [];
  // the seated national markings (an authored exhaust stain, kind 'soot', keeps its quad)
  tank.root.traverse((object) => { if (object.isMesh && object.userData.vehicleMarking && object.userData.surfaceSupported) marks.push(object); });
  assert.ok(marks.length >= 1, `${id}: carries its markings`);
  for (const mark of marks) {
    assert.equal(mark.userData.markingFilm, true, `${id} ${mark.name}: painted as a film`);
    assert.ok(footprintOk(mark.geometry, mark.scale.x), `${id} ${mark.name}: inside its footprint`);
    const ownerName = mark.userData.surfaceOwner === 'turret' ? 'turret' : 'hull';
    const owner = tank.root.getObjectByName(ownerName === 'turret' ? 'rig_turret' : 'rig_hull');
    const surfaces = vehicleMarkingSurfaces(owner, ownerName, id);
    const lifts = filmLifts(mark, surfaces);
    const off = lifts.filter((lift) => lift === null || Math.abs(lift - MARKING_FILM_LIFT_M) > TOLERANCE_M);
    assert.equal(off.length, 0,
      `${id} ${mark.name}: every film triangle stands ${MARKING_FILM_LIFT_M} m off its armour (${off.length}/${lifts.length} off: ${off.slice(0, 6).map((l) => l?.toFixed(4)).join(' ')})`);
  }
  tank.dispose();
}

console.log(`markingFilm.selftest: films hug curved, stepped and mirrored armour; ${IDS.length} vehicles' markings stand ${MARKING_FILM_LIFT_M} m off their armour`);
