import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildChieftain5XPhotoDraft } from './chieftain5XPhotoDraft.ts';
import { auditTankWheelQuality } from '../wheelQuality.ts';

// Preserve the historical photo fixture and its immutable pre-wheel oracle.
registerProfiledBuilders({ chieftain5_x: buildChieftain5XPhotoDraft });

const near = (a, b, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 2e-6,
  `${label}: ${a} versus ${b}`);
const shoulderName = 'chieftain5PhotoWheelRubberShoulders';
function build(quality, legacy = false) {
  const original = KIT.buildRunningGear;
  let gear;
  KIT.buildRunningGear = (port, input) => {
    const cfg = { ...input };
    if (legacy) {
      cfg.wheelCoreGeometry.disc.dispose();
      for (const layer of cfg.wheelFaceLayers) layer.geometry.dispose();
      delete cfg.wheelCoreGeometry;
      delete cfg.wheelFaceLayers;
      delete cfg.wheelTireInnerRadiusM;
    }
    gear = original(port, cfg);
    return gear;
  };
  try {
    const tank = createTank('chieftain5_x', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true);
    return { tank, gear };
  } finally { KIT.buildRunningGear = original; }
}

function immutable(root) {
  const hash = createHash('sha256');
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.name.startsWith('procShadow_') || mesh.userData.vehicleMarking) return;
    // Only the twelve replaced faces/rubber centers and their automatically
    // seated native links may differ. All other physical buffers are pinned.
    if (['gearRoadWheelTires', 'gearRoadWheelDiscs', 'gearRoadWheelInsets',
      'gearSuspensionLinks', 'gearSuspensionJointBosses', shoulderName].includes(mesh.name)) return;
    hash.update(mesh.name).update(JSON.stringify(mesh.matrixWorld.elements));
    for (const key of Object.keys(mesh.geometry.attributes).sort()) {
      const a = mesh.geometry.attributes[key].array;
      hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    for (const a of [mesh.geometry.index?.array, mesh.instanceMatrix?.array]) {
      if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  });
  return hash.digest('hex');
}

function frame(mesh, i) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
  return mesh.matrixWorld.clone().multiply(matrix);
}

function checkFaces(root) {
  const core = root.getObjectByName('gearRoadWheelDiscs');
  const tires = root.getObjectByName('gearRoadWheelTires');
  const shoulder = root.getObjectByName(shoulderName);
  assert.equal(core.count, 12, 'six original paired road axles per side');
  const physical = [];
  root.traverse(m => {
    if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) physical.push(m);
  });
  for (let i = 0; i < core.count; i++) {
    const matrix = frame(core, i), local = new THREE.Matrix4(); core.getMatrixAt(i, local);
    const side = Math.sign(new THREE.Vector3().setFromMatrixPosition(local).x);
    assert.deepEqual(frame(tires, i).elements, matrix.elements, 'unchanged tire shares actual spinning axle');
    assert.deepEqual(frame(shoulder, i).elements, matrix.elements, 'separate annular shoulder follows that axle');
    const direction = new THREE.Vector3(-side, 0, 0).transformDirection(matrix);
    // Independent analytic construction witnesses, not a metrology claim from
    // the angled photograph. Start inside the real armor skirt in its wheel bay.
    for (const [r, depth] of [[.20, .119615384615], [.28, .163333333333],
      [.32, .192705882353], [.35, .205232558140]]) for (let angle = 0; angle < 8; angle++) {
      const theta = angle * Math.PI / 4 + Math.PI / 48;
      const radius = r * Math.cos(Math.PI / 48);
      const origin = new THREE.Vector3(side * .30, radius * Math.cos(theta),
        radius * Math.sin(theta)).applyMatrix4(matrix);
      const hit = new THREE.Raycaster(origin, direction, 0, .5).intersectObjects(physical, false)[0];
      assert.equal(hit?.object.name, 'gearRoadWheelDiscs', 'real pressed bowl is first, not an opaque inset');
      near(hit.distance, .30 - depth, 'held-out bowl/rim surface');
      assert.equal(new THREE.Raycaster(origin, direction, 0, .30 - depth - .002)
        .intersectObjects(physical, false)[0], undefined, 'wheel bowl contains genuine approach air');
    }
    const origin = new THREE.Vector3(side * .30, .015, 0).applyMatrix4(matrix);
    near(new THREE.Raycaster(origin, direction, 0, .5).intersectObjects(physical, false)[0]?.distance,
      .054, 'localized supported hub does not become a broad proud wheel face');
  }
  for (const mesh of [core, tires, shoulder]) mesh.geometry.computeBoundingBox();
  near(tires.geometry.boundingBox.max.x, .20, 'main tire unchanged width');
  near(shoulder.geometry.boundingBox.max.x, .206, 'old shoulder axial envelope preserved');
  near(core.geometry.boundingBox.max.y, .3555, 'old steel rim radius preserved');
  assert.ok(.3555 - .3535 > .0019, 'steel rim positively seats in the rubber annulus');
  assert.deepEqual(auditTankWheelQuality(root).issues, [], 'strict physical suspension clearance remains valid');
}

for (const quality of ['high', 'low']) {
  const before = build(quality, true), after = build(quality);
  try {
    assert.equal(immutable(after.tank.root), immutable(before.tank.root), 'all non-wheel physical geometry is unchanged');
    assert.deepEqual(after.gear.roadWheelLayout, before.gear.roadWheelLayout, 'all pre-existing native gear datums preserved');
    assert.deepEqual(after.gear.roadWheelLayout.wheelZs, [-2.18, -1.39, -.395, .395, 1.39, 2.18]);
    near(after.gear.roadWheelLayout.xc, 1.365, 'unchanged lateral axle center');
    near(after.gear.roadWheelLayout.wheelY, .471, 'unchanged road-wheel rest height');
    checkFaces(after.tank.root);
    for (const [left, right] of [[.17, -.29], [.65, .21]]) {
      before.gear.update(left, right, 0); after.gear.update(left, right, 0);
      before.tank.root.updateMatrixWorld(true); after.tank.root.updateMatrixWorld(true);
      checkFaces(after.tank.root);
      assert.equal(immutable(after.tank.root), immutable(before.tank.root), 'unchanged complete moving track/end/roller course');
    }
    after.tank.root.rotation.y = .43;
    after.tank.root.position.set(2, .30, -1);
    after.tank.root.updateMatrixWorld(true);
    checkFaces(after.tank.root);
    const geometries = new Set([after.tank.root.getObjectByName('gearRoadWheelDiscs').geometry,
      after.tank.root.getObjectByName('gearRoadWheelTires').geometry,
      after.tank.root.getObjectByName(shoulderName).geometry]);
    const disposed = new Set();
    for (const geometry of geometries) geometry.addEventListener('dispose', () => disposed.add(geometry));
    after.tank.dispose(); after.tank = null;
    assert.equal(disposed.size, geometries.size, 'every owned wheel buffer is disposed');
  } finally { before.tank.dispose(); after.tank?.dispose(); }
}
console.log('chieftain5XWheels.selftest: high/low actual bowls, air, seating, motion, strict clearance and immutable non-wheel surfaces passed');
