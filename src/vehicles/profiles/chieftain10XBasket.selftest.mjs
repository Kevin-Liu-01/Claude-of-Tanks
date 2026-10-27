import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { addChieftain10XBasket } from './chieftain10XBasket.ts';
import { TURRET_SEAT_COLLAR_NAME, seatTurretOverDeck } from '../turretSeatRace.ts';
import { near } from '../../../tools/receipt-kit.test-support.mjs';

// Fixed, complete-source turret witnesses, not isolated candidate targets.
// Canonical SHA256 252e45ee57928c6256252fa7dcdba8c42bfc2c2c86a6d4548ea68291b45c6f85.
const pivot = new THREE.Vector3(0, 1.512956, .595241);
const witnesses = [
  [[-3, 1.1, .31], [1, 0, 0], 0, -.681769521590],
  [[-3, 1.25, .43], [1, 0, 0], 0, -.681769655057],
  [[3, 1.1, .9], [-1, 0, 0], 0, .686381248705],
  [[3, 1.3, 1.0], [-1, 0, 0], 0, .617324669091],
  [[-3, 1.42, .55], [1, 0, 0], 0, -1.090342066816],
  [[-3, 1.50, .20], [1, 0, 0], 0, -1.011369319159],
  [[-3, 1.50, -.25], [1, 0, 0], 0, -.664722615869],
  [[-3, 1.1, .85], [1, 0, 0], 0, -.808309606500],
  [[-3, 1.3, .63], [1, 0, 0], 0, -.866986738336],
  [[-3, 1.3, .70], [1, 0, 0], 0, -.870178170274],
  [[-3, 1.3, .78], [1, 0, 0], 0, -.873271242066],
  [[0, 1.05, 1.2], [0, -1, 0], 1, .794757790882],
  [[.1, .95, .6], [0, -1, 0], 1, .912637622915],
];
const ray = (meshes, origin, direction, far = 7) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];

function bufferHash(hash, geometry) {
  for (const name of Object.keys(geometry.attributes).sort()) {
    const a = geometry.attributes[name].array;
    hash.update(name).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  const a = geometry.index?.array;
  if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
}

function build(quality, legacy = false) {
  const original = KIT.buildRunningGear, submissions = createHash('sha256');
  const names = [];
  KIT.buildRunningGear = (p, cfg) => {
    const originalAdd = p.add;
    let inserted = false;
    p.add = (bucket, geometry, ...transform) => {
      const name = geometry.userData.chieftain10BasketPiece;
      if (name) {
        assert.equal(bucket, 'turretDetail', 'basket pieces are permanent turret equipment, not expendable armor');
        names.push(name);
        if (legacy) {
          geometry.dispose();
          if (!inserted) originalAdd('turret', KIT.cylY(.785085, .785085, .27771, 32),
            0, .9007115 - pivot.y, 0);
          inserted = true;
          return;
        }
      } else {
        submissions.update(bucket).update(JSON.stringify(transform));
        bufferHash(submissions, geometry);
      }
      originalAdd(bucket, geometry, ...transform);
    };
    return original(p, cfg);
  };
  try {
    const tank = createTank('chieftain_mk10', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true);
    return { tank, names, submissions: submissions.digest('hex') };
  } finally { KIT.buildRunningGear = original; }
}

function otherBuffers(root) {
  const hash = createHash('sha256');
  root.traverse(m => {
    if (!m.isMesh || m.name.startsWith('procShadow_') || m.userData.vehicleMarking) return;
    // These two merged buckets are independently covered above at every
    // original primitive submission, excluding ONLY the named replacement.
    if (['turret', 'turretDetail'].includes(m.name)) return;
    // 252's ring collar (turretSeatRace.ts addSeatCollar, ce10d80591) is drawn from the turret's own lowest surface at the
    // race (its top 4 mm into it), so the legacy stand-in's underside moves it: turret-derived, not hull/gear/gun/roof
    if (m.name === TURRET_SEAT_COLLAR_NAME) return;
    hash.update(m.name).update(JSON.stringify(m.matrixWorld.elements));
    bufferHash(hash, m.geometry);
    if (m.instanceMatrix) {
      const a = m.instanceMatrix.array;
      hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  });
  return hash.digest('hex');
}

function surfaces(meshes, yawAngle = 0) {
  const rotation = new THREE.Matrix4().makeRotationY(yawAngle);
  const point = p => new THREE.Vector3(...p).sub(pivot).applyMatrix4(rotation).add(pivot);
  const direction = d => new THREE.Vector3(...d).transformDirection(rotation);
  for (const [origin, dir, axis, expected] of witnesses) {
    const hit = ray(meshes, point(origin).toArray(), direction(dir).toArray());
    const neutral = hit?.point.clone().sub(pivot).applyMatrix4(rotation.clone().invert()).add(pivot);
    near(neutral?.getComponent(axis), expected, .000015, 'held-out complete-source folded surface');
  }
  // The small irregular ten-sided linkage is authored as a closed 40 mm
  // bent rod; its local fillets are explicitly approximate, not a plane fit.
  for (const [origin, expected] of [[[3, 1.1, -.12], .104968277728],
    [[3, 1.15, -.115], .104822563873], [[3, 1.38, .10], .637900349522]]) {
    const hit = ray(meshes, point(origin).toArray(), direction([-1, 0, 0]).toArray());
    const neutral = hit?.point.clone().sub(pivot).applyMatrix4(rotation.clone().invert()).add(pivot);
    near(neutral?.x, expected, .0035, 'source narrow hanging linkage remains material with bounded fillet simplification');
  }
  const hit = ray(meshes, point([3, 1.3, 1]).toArray(), direction([-1, 0, 0]).toArray());
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    .transformDirection(rotation.clone().invert());
  assert.ok(normal.dot(new THREE.Vector3(.82286457, 0, .56823754)) > .999999,
    'actual source oblique support normal is retained, not a bounding box');
  for (const [origin, dir, far] of [
    [[.4, .81, .3], [0, -1, 0], .12],
    [[-3, .9, .1], [1, 0, 0], 6],
    [[-3, 1.1, -.35], [1, 0, 0], 6],
  ]) assert.equal(ray(meshes, point(origin).toArray(), direction(dir).toArray(), far), undefined,
    'independent source floor aperture / transverse basket window remains actual air');
}

// 240's turret seat (turretSeatRace.ts seatTurretOverDeck; first red at 246) brings every corner of a turret triangle
// reaching past the race's rim (0.9016 m off the ring's axis) up onto its 1.62-1.636 plane, and collapses a part it lifts
// whole. The basket's outer trays, return and link reach 1.15 m, under the 1.566 deck: the seat folds them into the
// turret's underside (244 of 788 triangles), which moves 4 witnesses and the hanging link. The isolated basket keeps every
// complete-source check; the build is read against that source basket under the same seat (main-reds-259).
function seatedSource(rig) {
  const hullG = new THREE.Group(), turretG = new THREE.Group(), seated = [], disposables = [];
  Object.assign(turretG.userData, rig.userData); hullG.add(turretG);
  addChieftain10XBasket({ addEquipment(bucket, geometry) { const m = new THREE.Mesh(geometry, material); turretG.add(m); seated.push(m); } }, [0, 0, 0]);
  hullG.updateMatrixWorld(true);
  assert.ok(seatTurretOverDeck({ specId: 'chieftain_mk10', hullG, turretG, gunG: null, disposables }) > 0, 'the seat folds the basket parts past the rim');
  return { seated, dispose() { for (const g of disposables) g.dispose(); for (const m of seated) m.geometry.dispose(); } };
}
const SEATED_RAYS = [...witnesses.map(([origin, dir, axis]) => [origin, dir, axis]),
  [[3, 1.1, -.12], [-1, 0, 0], 0], [[3, 1.15, -.115], [-1, 0, 0], 0], [[3, 1.38, .10], [-1, 0, 0], 0], [[3, 1.3, 1], [-1, 0, 0], 0],
  [[.4, .81, .3], [0, -1, 0], 1], [[-3, .9, .1], [1, 0, 0], 0], [[-3, 1.1, -.35], [1, 0, 0], 0]];
function seatedSurfaces(meshes, reference, yawAngle = 0) {
  const rotation = new THREE.Matrix4().makeRotationY(yawAngle);
  const point = p => new THREE.Vector3(...p).sub(pivot).applyMatrix4(rotation).add(pivot);
  const direction = d => new THREE.Vector3(...d).transformDirection(rotation);
  for (const [origin, dir, axis] of SEATED_RAYS) {
    const hit = ray(meshes, point(origin).toArray(), direction(dir).toArray()), want = ray(reference, origin, dir);
    const neutral = hit?.point.clone().sub(pivot).applyMatrix4(rotation.clone().invert()).add(pivot);
    if (!want) assert.equal(hit, undefined, `seated basket: air at ${origin}`);
    else near(neutral?.getComponent(axis), want.point.getComponent(axis), .000015, 'the build is the complete-source basket under the seat');
  }
}

function support(parts, structural) {
  const named = name => parts.filter(p => p.name === name);
  near(ray(named('floor'), [-.55, 1, .45], [0, -1, 0])?.point.y
    - ray(named('leftSteppedPedestal'), [-.55, .7, .45], [0, 1, 0])?.point.y,
  .001, .000001, 'left source pedestal overlaps the actual pierced floor');
  near(ray(named('leftSteppedPedestal'), [-.52, 1.4, .38], [0, -1, 0])?.point.y
    - ray(named('concealedSeatJoint'), [-.52, 1.3, .38], [0, 1, 0])?.point.y,
  .001, .000001, 'concealed 23 mm construction joint reaches source pedestal');
  near(ray(named('concealedSeatJoint'), [-.52, 1.4, .38], [0, -1, 0])?.point.y
    - ray(named('leftUpperTrayFloor'), [-.52, 1.3, .38], [0, 1, 0])?.point.y,
  .001001, .000001, 'the same small joint overlaps thin upper tray');
  const top = ray(named('rightObliqueSupport'), [.65, 1.6, .9], [0, -1, 0]);
  const bearing = ray(structural, [.65, 1.48, .9], [0, 1, 0], .1);
  assert.ok(top.point.y - bearing.point.y > .029, 'right support hangs from actual permanent bearing');
  assert.equal(ray(named('rightObliqueSupport'), [.65, .796, .9], [0, 1, 0], .010), undefined,
    'source gap under the hanging right support is not filled by an invented root');
}

const material = new THREE.MeshBasicMaterial();
const parts = [];
addChieftain10XBasket({ addEquipment(bucket, geometry) {
  assert.equal(bucket, 'turretDetail');
  const m = new THREE.Mesh(geometry, material); m.name = geometry.userData.chieftain10BasketPiece;
  m.updateMatrixWorld(true); parts.push(m);
} }, [0, 0, 0]);
try {
  surfaces(parts);
  for (const quality of ['high', 'low']) {
    const before = build(quality, true), after = build(quality);
    try {
      assert.equal(after.submissions, before.submissions, 'all non-target submitted geometry and transforms unchanged');
      assert.equal(otherBuffers(after.tank.root), otherBuffers(before.tank.root),
        'complete hull/gear/gun/roof and other physical buffers remain identical');
      assert.deepEqual(after.names, before.names);
      assert.ok(after.names.includes('floor') && after.names.includes('rightObliqueSupport'));
      const yaw = after.tank.root.getObjectByName('rig_turret'), meshes = [];
      yaw.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking && !m.name.startsWith('procShadow_')) meshes.push(m); });
      const reference = seatedSource(yaw);
      try {
      seatedSurfaces(meshes, reference.seated);
      support(parts, meshes.filter(m => m.name === 'turret'));
      const detail = meshes.find(m => m.name === 'turretDetail');
      const fixed = detail.matrixWorld.clone();
      after.tank.root.getObjectByName('rig_gun').rotation.x = -.2;
      after.tank.root.updateMatrixWorld(true);
      assert.ok(detail.matrixWorld.equals(fixed), 'basket never follows gun pitch');
      yaw.rotation.y = .63; after.tank.root.updateMatrixWorld(true); seatedSurfaces(meshes, reference.seated, .63);
      yaw.rotation.y = 0; after.tank.root.getObjectByName('rig_gun').rotation.x = 0;
      after.tank.root.updateMatrixWorld(true); seatedSurfaces(meshes, reference.seated);
      } finally { reference.dispose(); }
      const resources = new Set(meshes.map(m => m.geometry)), disposed = new Set();
      for (const g of resources) g.addEventListener('dispose', () => disposed.add(g));
      after.tank.dispose(); after.tank = null;
      assert.equal(disposed.size, resources.size, 'all merged turret resources dispose');
    } finally { before.tank.dispose(); after.tank?.dispose(); }
  }
} finally { for (const p of parts) p.geometry.dispose(); material.dispose(); }
console.log('chieftain10XBasket: high/low complete-source folds/pedestals/apertures, attachment, yaw/pitch ownership, exact non-target preservation and disposal pass');
