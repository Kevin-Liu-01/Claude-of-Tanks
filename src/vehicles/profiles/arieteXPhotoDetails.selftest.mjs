import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { KIT, registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildArieteX } from './arieteXPhotoDraft.ts';
import { arietePhotoWheelSolids } from './primaryPhotoWheelSolids.ts';
import { addArieteXWheelFasteners } from './arieteXPhotoDetails.ts';

// Isolated historical photo construction, not current supplied-file acceptance.
registerProfiledBuilders({ ariete_c1_x: buildArieteX });

// These are independent physical construction/air contracts, not a numerical
// likeness score or invented millimetric measurements from the Army photos.
const near = (a, b, label, tolerance = 2e-6) => assert.ok(Number.isFinite(a)
  && Math.abs(a - b) <= tolerance, `${label}: ${a} versus ${b}`);

function ray(meshes, frame, from, axis, far = 5) {
  return new THREE.Raycaster(new THREE.Vector3(...from).applyMatrix4(frame),
    new THREE.Vector3(...axis).transformDirection(frame), 0, far).intersectObjects(meshes, false)[0];
}

function roofChecks(root) {
  const all = [];
  root.traverse(o => { if (o.isMesh && !o.name.startsWith('procShadow_') && !o.userData.vehicleMarking) all.push(o); });
  const turret = root.getObjectByName('rig_turret');
  for (const angle of [0, -.83, .67]) {
    turret.rotation.y = angle; root.updateMatrixWorld(true);
    const frame = turret.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, -1.60, -.56));
    for (const x of [.39, .69]) for (const y of [2.56, 2.63]) {
      const hit = ray(all, frame, [x, y, 1.30], [0, 0, -1]);
      assert.equal(hit?.object.name, 'turretGlass', 'two independently clear lower sight windows');
      near(hit.distance, .198, 'recessed glass, not an opaque face');
      assert.equal(ray(all, frame, [x, y, 1.20], [0, 0, -1], .09), undefined,
        'each window has positive approach air ahead of its own back pane');
    }
    for (const y of [2.68, 2.785]) {
      const hit = ray(all, frame, [.64, y, .70], [0, 0, -1]);
      assert.equal(hit?.object.name, 'turretGlass', 'tall head retains a genuine clear optical recess');
      near(hit.distance, .084, 'existing head glass depth unchanged');
    }
    near(ray(all, frame, [.64, 3, .47], [0, -1, 0])?.distance, .14,
      'published 2.86 m upper optical head height unchanged');
    for (const [x, z, floor] of [[.64, .47, 2.497], [.54, 1.03, 2.4765],
      [.26, .85, 2.490236842], [.82, 1.21, 2.462763158]]) {
      const armor = ray(all.filter(o => o.name === 'turret'), frame, [x, 2.60, z], [0, -1, 0]);
      const stock = ray(all.filter(o => o.name === 'turretDetail'), frame, [x, 2.40, z], [0, 1, 0]);
      near(stock?.distance, floor - 2.4, 'true lower support face');
      assert.ok(2.60 - armor.distance - floor > .002, 'sight support positively engages actual structural roof');
    }
    for (const [x, z] of [[.64, -.28], [-.62, -.21]]) {
      const handle = ray(all, frame, [x, 2.70, z - .075], [0, -1, 0]);
      near(handle?.distance, .06, 'physical handle bridge');
      assert.equal(ray(all, frame, [x, 2.607, z - .15], [0, 0, 1], .15), undefined,
        'open air between hatch and handle, not a filled raised block');
      for (const dx of [-.073, .073]) {
        near(ray(all, frame, [x + dx, 2.60, z - .14], [0, 0, 1])?.distance, .055,
          'real handle legs connect to hatch');
      }
    }
    for (const side of [-1, 1]) {
      const x = side * 1.21;
      near(ray(all, frame, [x, 2.70, -.98], [0, -1, 0])?.distance, .121,
        'low roof handrail bridge');
      assert.equal(ray(all, frame, [x - .08, 2.536, -.98], [1, 0, 0], .16), undefined,
        'rail-to-roof interval is actually open');
      for (const z of [-1.44, -.62, .64]) {
        near(ray(all.filter(o => o.name === 'turretDetail'), frame, [x, 2.45, z], [0, 1, 0])?.distance,
          .038, 'each rail foot starts inside the unchanged roof');
      }
    }
  }
}

function originalBowlPreserved() {
  const base = arietePhotoWheelSolids(), original = base.core.toNonIndexed();
  const originalPositions = Array.from(original.attributes.position.array);
  const detailed = addArieteXWheelFasteners(base.core);
  assert.deepEqual(Array.from(detailed.attributes.position.array.slice(0, originalPositions.length)),
    originalPositions, 'every original turned bowl triangle survives without a changed coordinate');
  detailed.computeBoundingBox();
  near(detailed.boundingBox.max.x, .229, 'hub nuts do not enlarge the original core axial envelope');
  near(detailed.boundingBox.max.y, .316, 'rim radius is unchanged');
  original.dispose(); detailed.dispose(); base.shoulder.dispose();
}

function wheelChecks(tank, gear) {
  const disc = tank.root.getObjectByName('gearRoadWheelDiscs');
  const tire = tank.root.getObjectByName('gearRoadWheelTires');
  const shoulder = tank.root.getObjectByName('arietePhotoWheelRubberShoulders');
  for (const travel of [[0, 0], [.312, -.427]]) {
    gear.update(...travel, 0); tank.root.updateMatrixWorld(true);
    for (let i = 0; i < disc.count; i++) {
      const frame = new THREE.Matrix4(); disc.getMatrixAt(i, frame);
      for (const same of [tire, shoulder]) {
        const other = new THREE.Matrix4(); same.getMatrixAt(i, other);
        assert.deepEqual(other.elements, frame.elements, 'hardware remains in actual tire/suspension spinning frame');
      }
      frame.premultiply(disc.matrixWorld);
      const local = new THREE.Matrix4(); disc.getMatrixAt(i, local);
      const side = Math.sign(new THREE.Vector3().setFromMatrixPosition(local).x);
      for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4;
        const hit = ray([disc], frame, [side * .28, .075 * Math.cos(angle), .075 * Math.sin(angle)], [-side, 0, 0]);
        near(hit?.distance, .064, 'eight small supported hex heads on every real wheel face');
      }
      near(ray([disc], frame, [side * .28, .15, 0], [-side, 0, 0])?.distance,
        .169078125, 'broad dish stays empty of added spokes');
    }
  }
}

originalBowlPreserved();
for (const quality of ['high', 'low']) {
  const original = KIT.buildRunningGear; let gear;
  KIT.buildRunningGear = (port, cfg) => { gear = original(port, cfg); return gear; };
  let tank;
  try { tank = createTank('ariete_c1_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false }); }
  finally { KIT.buildRunningGear = original; }
  try {
    tank.root.updateMatrixWorld(true); roofChecks(tank.root); wheelChecks(tank, gear);
    const geometries = new Set(); tank.root.traverse(o => { if (o.isMesh) geometries.add(o.geometry); });
    const disposed = new Set(); for (const g of geometries) g.addEventListener('dispose', () => disposed.add(g));
    tank.dispose(); tank = null;
    assert.equal(disposed.size, geometries.size, 'all owned render geometry has a disposal path');
  } finally { tank?.dispose(); }
}
console.log('arieteXPhotoDetails.selftest: high/low real optic/handle/rail air and attachment, unchanged bowl, native fastener motion and disposal pass');
