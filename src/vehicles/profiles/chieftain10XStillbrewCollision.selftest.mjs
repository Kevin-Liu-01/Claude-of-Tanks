import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildChieftainMk10X } from './chieftain10X.ts';
import { traceTank } from '../../sim/armor.ts';

const point = p => new THREE.Vector3(...p);
const zeroPose = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
const SOURCE_AIR = [
  { name: 'central mantlet mouth', from: [0, 2.1, 3], to: [0, 2.1, 1.82] },
  { name: 'pierced basket floor', from: [.4, .81, .3], to: [.4, .69, .3] },
];

function build(quality) {
  const solids = [];
  registerProfiledBuilders({ chieftain_mk10_x: p => buildChieftainMk10X(new Proxy(p, {
    get(target, key) {
      if (key !== 'add') return Reflect.get(target, key);
      return (bucket, g, ...args) => {
        if (bucket === 'turret') solids.push({ tag: g.userData.chieftain10Stillbrew,
          geometry: KIT.xform(g.clone(), ...args) });
        return target.add(bucket, g, ...args);
      };
    },
  })) });
  try {
    const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true); return { tank, solids };
  } catch (error) { solids.forEach(s => s.geometry.dispose()); throw error;
  } finally { registerProfiledBuilders({ chieftain_mk10_x: buildChieftainMk10X }); }
}

function outwardFaces(solid, matrix) {
  const g = solid.geometry, p = g.attributes.position, index = g.index, rows = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p,
      index ? index.getX(i + k) : i + k).applyMatrix4(matrix));
    const normal = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
    if (normal.z < .3) continue;
    const center = v.reduce((sum, n) => sum.add(n), new THREE.Vector3()).multiplyScalar(1 / 3);
    rows.push({ tag: solid.tag, triangle: i, center, normal });
  }
  return rows;
}

function contains(mesh, p) {
  // Each submitted stock is independently closed. Test their UNION, not
  // parity across one merged mesh, where overlapping solids can cancel.
  const direction = point([.913, .271, .307]).normalize();
  const hits = new THREE.Raycaster(p, direction, .0000001, 20).intersectObject(mesh, false);
  let count = 0, previous = -Infinity;
  for (const h of hits) if (h.distance - previous > .0000001) { count++; previous = h.distance; }
  return count % 2 === 1;
}

function classifyFaces(rows, meshes) {
  const visibleMaterial = new THREE.MeshBasicMaterial();
  try {
    return rows.map(row => {
      const from = row.center.clone().addScaledVector(row.normal, .02);
      const to = row.center.clone().addScaledVector(row.normal, -.02);
      if (meshes.some(m => contains(m, from))) return { ...row, from, to, classification: 'internal-overlap' };
      const ray = new THREE.Raycaster(from, row.normal.clone().negate(), 0, .04);
      const hits = [];
      for (const m of meshes) {
        const original = m.material; m.material = visibleMaterial;
        hits.push(...ray.intersectObject(m, false)); m.material = original;
      }
      hits.sort((a, b) => a.distance - b.distance);
      assert.ok(hits[0], `${row.tag}/${row.triangle}: actual finite stock witness exists`);
      const classification = hits[0].point.distanceTo(row.center) < .000002 ? 'exposed' : 'covered-by-other-stock';
      return { ...row, from, to, classification };
    });
  } finally { visibleMaterial.dispose(); }
}

function poseMatrix(yaw) {
  const pivot = point([0, 1.512956, .595241]);
  return new THREE.Matrix4().makeTranslation(...pivot.toArray())
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeTranslation(...pivot.clone().negate().toArray()));
}

function armorHits(from, to, pose, armor) {
  return traceTank(from, to, pose, armor).filter(h => h.kind === 'plate' && h.plate.kind === 'main');
}

function positiveContacts(rows, armor, yaw) {
  const frame = poseMatrix(yaw), pose = { ...zeroPose, turretYaw: yaw };
  return rows.map(row => {
    const from = row.from.clone().applyMatrix4(frame), to = row.to.clone().applyMatrix4(frame);
    const hits = armorHits(from, to, pose, armor);
    return { tag: row.tag, triangle: row.triangle, center: row.center.toArray(), normal: row.normal.toArray(),
      classification: row.classification, yaw, armorEntries: hits.map(h => ({ point: h.point.toArray(),
        plate: h.plate.name, physicalMm: h.plate.physicalMm })),
      passed: row.classification !== 'exposed' || hits.length > 0 };
  });
}

function negativeAir(armor, yaw, root) {
  const frame = poseMatrix(yaw), pose = { ...zeroPose, turretYaw: yaw };
  // Complete-source mantlet opening from outside the entire turret, so a
  // convex bridge cannot hide behind an internal/no-entry segment. The
  // basket ray also retains actual unarmored pierced-floor air.
  root.getObjectByName('rig_turret').rotation.y = yaw; root.updateMatrixWorld(true);
  const native = [];
  root.traverse(m => { if (m.isMesh && !m.userData.shadowOnly && !m.userData.vehicleMarking
    && !m.name.startsWith('procShadow_')) native.push(m); });
  return SOURCE_AIR.map(row => {
    const from = point(row.from).applyMatrix4(frame), to = point(row.to).applyMatrix4(frame);
    const hits = armorHits(from, to, pose, armor);
    const visible = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to))
      .intersectObjects(native, false);
    return { ...row, yaw, nativeHits: visible.map(h => ({ point: h.point.toArray(), mesh: h.object.name })),
      armorEntries: hits.map(h => ({ point: h.point.toArray(), plate: h.plate.name })),
      passed: hits.length === 0 && visible.length === 0 };
  });
}

const failures = [];
for (const quality of ['high', 'low']) {
  const { tank, solids } = build(quality);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  try {
    const matrix = tank.root.getObjectByName('rig_turret').matrixWorld;
    const meshes = solids.map(s => { const m = new THREE.Mesh(s.geometry, material); m.matrixWorld.copy(matrix); return m; });
    const stillbrew = solids.filter(s => s.tag);
    assert.deepEqual(stillbrew.map(s => s.tag).sort(), ['port', 'spine', 'starboard']);
    const raw = stillbrew.flatMap(s => outwardFaces(s, matrix));
    assert.equal(raw.length, 58, 'all 58 original outward-facing Stillbrew triangle witnesses remain');
    const classified = classifyFaces(raw, meshes);
    assert.ok(classified.some(r => r.classification === 'exposed'), 'real exposed Stillbrew contacts are required');
    const armor = getSpec('chieftain_mk10_x').armor;
    const contacts = [0, -.71, .83].flatMap(yaw => positiveContacts(classified, armor, yaw));
    const air = [0, -.71, .83].flatMap(yaw => negativeAir(armor, yaw, tank.root));
    console.log(JSON.stringify({ test: 'chieftain10XStillbrewCollision', quality,
      turretCells: armor.collisionShells?.turret?.length ?? 0,
      classifications: Object.fromEntries(['exposed', 'internal-overlap', 'covered-by-other-stock']
        .map(name => [name, classified.filter(r => r.classification === name).length])),
      rawWitnesses: classified.map((r, i) => ({ tag: r.tag, triangle: r.triangle, center: r.center.toArray(),
        normal: r.normal.toArray(), classification: r.classification,
        neutralArmorEntries: contacts[i].armorEntries, neutralPassed: contacts[i].passed })),
      posedContactsPassed: contacts.filter(r => r.passed).length, posedContactsTotal: contacts.length,
      failedContacts: contacts.filter(r => !r.passed), air }, null, 2));
    const misses = contacts.filter(r => !r.passed), bridges = air.filter(r => !r.passed);
    if (misses.length || bridges.length) failures.push({ quality, misses, bridges });
    else console.log(`chieftain10XStillbrewCollision ${quality}: 58 retained face witnesses, live finite contacts and true air PASS`);
  } finally { tank.dispose(); material.dispose(); solids.forEach(s => s.geometry.dispose()); }
}
assert.deepEqual(failures, [],
  'every exposed finite Stillbrew face must receive main armor; source/native mantlet and basket air must remain unarmored');
