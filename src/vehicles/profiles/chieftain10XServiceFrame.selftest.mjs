import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addChieftain10XServiceFrame } from './chieftain10XServiceFrame.ts';

const ray = (meshes, p, d, far = 8) => new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d), 0, far).intersectObjects(meshes, false)[0];
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `${label}: ${a} versus independent source ${b}`);

function fixtures() {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const add = (bucket, geometry) => {
    const m = new THREE.Mesh(geometry, material); m.name = bucket; group.add(m);
  };
  addChieftain10XServiceFrame({ add, addEquipment: add }); group.updateMatrixWorld(true);
  return { group, parts: group.children, dispose() {
    group.children.forEach(m => m.geometry.dispose()); material.dispose();
  } };
}

function sourceSurfaces(all) {
  // First-hit values measured against ALL canonical source owners, not a
  // viewport mask. End-rail planes are shared across three manufactured
  // segments; the source center segment differs by about 0.14 mm in Z.
  for (const side of [-1, 1]) {
    for (const [x, z, y, tolerance] of [[1.2, -2.28, 1.791223953417, .00001],
      [1.2, -2.31, 1.762718099745, .00001], [1.2, -2.25, 1.765252102617, .00001],
      [1.32, -2.284, 1.789520785037, .00002], [1.44, -1.8, 1.775724703858, .00003],
      [1.44, -1.2, 1.764794509672, .00003], [1.44, -.75, 1.756596864032, .00003]]) {
      near(ray(all, [side * x, 1.82, z], [0, -1, 0])?.point.y, y, tolerance,
        'raised transverse/longitudinal source rail crown');
    }
    const h = ray(all, [side * 1.2, 1.82, -2.28], [0, -1, 0]);
    assert.ok(h.face.normal.distanceTo(new THREE.Vector3(0, .920068365537, -.391757836855)) < .00002,
      'rail is a crowned section, not a tall flat box');
    near(ray(all, [side * 1.2, 1.65, -2.284], [0, 1, 0])?.point.y,
      1.661321999351, .00001, 'diagonal web underside retains source lower air');
    assert.equal(ray(all, [side * .908, 1.82, -2.28], [0, -1, 0], .10), undefined,
      '61 mm inter-segment opening remains real air above the lower cover');
    assert.equal(ray(all, [side * 1.2, 1.715, -2.26], [0, -1, 0], .04), undefined,
      'air ahead of the thin transverse receiving web');
    assert.equal(ray(all, [side * 1.44, 1.7, -1.8], [0, -1, 0], .08), undefined,
      'long rail has no filled vertical pedestal beneath its open span');
    assert.equal(ray(all, [side * 1.2, 1.655, -2.284], [0, 1, 0], .005), undefined,
      'source small airway beneath diagonal web is not consumed by support continuation');
  }
  near(ray(all, [.8, 1.82, -2.2], [0, -1, 0])?.point.y, 1.733622020968, .000002,
    'central service-cover source plane');
  near(ray(all, [.8, 1.72, -2.2], [0, -1, 0])?.point.y, 1.691300034523, .000002,
    'actual permanent engine-pad crown under the thin cover');
}

function contacts(parts, all) {
  const named = name => parts.filter(m => m.geometry.userData.chieftain10ServiceFrame === name);
  const join = (upper, lower, x, z, maxLap = .004) => {
    const low = ray(named(upper), [x, 1.4, z], [0, 1, 0])?.point.y;
    const high = ray(named(lower), [x, 1.84, z], [0, -1, 0])?.point.y;
    assert.ok(high >= low && high - low <= maxLap, `${upper} attaches to ${lower}: ${low}/${high}`);
  };
  assert.equal(named('transverseRail').length, 3); assert.equal(named('longitudinalRail').length, 2);
  join('transverseRail', 'serviceCover', .5, -2.28);
  join('coverEndReturn', 'enginePad', .6, -2.394);
  for (const side of [-1, 1]) {
    join('transverseRail', 'crossReceivingFlange', side * 1.2, -2.28);
    join('longitudinalRail', 'longReceivingFlange', side * 1.44, -1.8);
    join('longReceivingFlange', 'aftReceivingWall', side * 1.44, -2.285);
    join('foldedOutboardFoot', 'foldedFootRoot', side * 1.313, -2.285, .004);
    const root = ray(named('foldedFootRoot'), [side * 1.325, 1.4, -2.285], [0, 1, 0])?.point.y;
    const shoulder = ray(all.filter(m => m.name === 'hull'), [side * 1.325, 1.8, -2.285], [0, -1, 0])?.point.y;
    assert.ok(shoulder - root > .0009 && shoulder - root < .0011, 'concealed foot continuation overlaps permanent shoulder by 1 mm');
    const wall = ray(named('aftReceivingWall'), [side * 1.44, 1.4, -2.285], [0, 1, 0])?.point.y;
    const hull = ray(all.filter(m => m.name === 'hull'), [side * 1.44, 1.8, -2.285], [0, -1, 0])?.point.y;
    assert.ok(hull > wall && hull - wall < .02, 'long rail aft wall is actually seated on permanent hull');
  }
  assert.equal(ray(parts, [1.86, 3, -.20], [0, -1, 0]), undefined,
    'separate source-real continuity channel is outside all added stock');
}

function counts(root) {
  root.updateMatrixWorld(true);
  const map = new Map(), v = new THREE.Vector3(), instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  root.traverse(m => {
    if (!m.isMesh || m.userData.vehicleMarking || m.name.startsWith('procShadow_')) return;
    const p = m.geometry.attributes.position, index = m.geometry.index;
    for (let j = 0; j < (m.isInstancedMesh ? m.count : 1); j++) {
      if (m.isInstancedMesh) { m.getMatrixAt(j, instance); world.multiplyMatrices(m.matrixWorld, instance); }
      else world.copy(m.matrixWorld);
      for (let i = 0; i < (index?.count ?? p.count); i++) {
        v.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(world);
        const key = v.toArray().map(n => Math.round(n * 1e5)).join(',');
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
  }); return map;
}

function preservation(tank, fixture, expectedCount, expectedHash) {
  const actual = counts(tank.root), added = counts(fixture.group);
  for (const [key, n] of added) {
    assert.ok(actual.get(key) >= n, `every added draw vertex exists with exact multiplicity: ${key}`);
    actual.set(key, actual.get(key) - n);
  }
  const rows = [...actual].filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b));
  assert.equal(rows.reduce((sum, [, n]) => sum + n, 0), expectedCount);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), expectedHash,
    'subtracting only the new helper preserves every old physical vertex, including all gear and turret');
}

for (const [quality, count, hash] of [
  ['high', 317904, 'f8ca53fd1bdb78ead30c90b2d50ffde9464888ebaeb0f8da690dacfe3adb1c31'],
  ['low', 291504, '2f8909bdea9e969f2dc65834150533937167523b47073aee5c858de0e07120d3'],
]) {
  const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false }), fixture = fixtures();
  try {
    tank.root.updateMatrixWorld(true);
    const all = []; tank.root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking
      && !m.name.startsWith('procShadow_')) all.push(m); });
    sourceSurfaces(all); contacts(fixture.parts, all); preservation(tank, fixture, count, hash);
    const hull = all.filter(m => m.name === 'hull' || m.name.startsWith('hull'));
    const matrices = hull.map(m => m.matrixWorld.clone()), buffers = hull.map(m => m.geometry);
    for (const yaw of [-.71, .63, 0]) {
      tank.root.getObjectByName('rig_turret').rotation.y = yaw; tank.root.updateMatrixWorld(true);
      assert.ok(hull.every((m, i) => m.matrixWorld.equals(matrices[i]) && m.geometry === buffers[i]),
        'all service fittings remain permanently hull-owned through yaw');
    }
  } finally { tank.dispose(); fixture.dispose(); }
}
console.log('chieftain10XServiceFrame: high/low source crowns/web underside, five real rail gaps, supported folded feet, exact add-only preservation and hull ownership pass');
