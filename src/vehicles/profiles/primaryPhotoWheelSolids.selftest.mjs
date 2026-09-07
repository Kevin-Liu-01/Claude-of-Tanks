import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { KIT, registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildArieteX } from './arieteXPhotoDraft.ts';
import { buildChallenger1X } from './challenger1XPhotoDraft.ts';
import { buildStrv122X } from './strv122XPhotoDraft.ts';
import { auditTankWheelQuality } from '../wheelQuality.ts';

// Historical photo-only wheel primitives remain regression-tested in explicit
// process-local fixtures. Supplied-file actual-ID tests are separate and mandatory.
registerProfiledBuilders({ ariete_c1_x: buildArieteX, challenger1_x: buildChallenger1X,
  strv122_x: buildStrv122X });

// Army-photo shape contracts, not precision measurements from the AI inputs.
// Actual wheel/track datums below predate this face-only correction.
const cases = [
  { id:'challenger1_x',radius:.395,width:.39,x:1.385,y:.470,
    zs:[-2.18,-1.385,-.59,.59,1.385,2.18],
    shoulder:'challenger1PhotoWheelRubberShoulders',hub:.219,
    witnesses:[[.220,.1197142857],[.290,.1482903226],[.334,.1794857143],[.367,.202]],
    openingRadius:.369,rim:.371,rayStart:.30 },
  { id: 'ariete_c1_x', radius: .347, width: .39, x: 1.425, y: .423,
    zs: [-2.57, -1.73, -.89, -.05, .79, 1.63, 2.47],
    shoulder: 'arietePhotoWheelRubberShoulders', hub: .229,
    witnesses: [[.150, .110921875], [.220, .1352586207], [.270, .169], [.310, .204]],
    openingRadius: .314, rim: .316 },
  { id: 'strv122_x', radius: .345, width: .40, x: 1.42, y: .421,
    zs: [-2.46, -1.63, -.80, .03, .86, 1.69, 2.52],
    shoulder: 'strv122PhotoWheelRubberShoulders', hub: .194,
    witnesses: [[.160, .085], [.230, .1211052632], [.275, .1637333333], [.309, .208]],
    openingRadius: .311, rim: .313 },
];
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a)
  && Math.abs(a - b) <= tolerance, `${label}: ${a} versus ${b}`);

function build(id, quality, legacy = false) {
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
    const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true);
    return { tank, gear };
  } finally { KIT.buildRunningGear = original; }
}

function immutableSurfaces(root) {
  const hash = createHash('sha256');
  root.traverse(object => {
    if (!object.isMesh || object.name.startsWith('procShadow_') || object.userData.vehicleMarking) return;
    // Exact wheel solids and their automatic native inboard support placement
    // are the only changes. No box/material-wide hull or track exclusions.
    if (['gearRoadWheelTires', 'gearRoadWheelDiscs', 'gearRoadWheelInsets',
      'gearSuspensionLinks', 'gearSuspensionJointBosses'].includes(object.name)
      || object.name.endsWith('PhotoWheelRubberShoulders')) return;
    hash.update(object.name);
    hash.update(JSON.stringify(object.matrixWorld.elements));
    for (const key of Object.keys(object.geometry.attributes).sort()) {
      const attr = object.geometry.attributes[key];
      hash.update(key); hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
    }
    if (object.geometry.index) hash.update(Buffer.from(object.geometry.index.array.buffer));
    if (object.isInstancedMesh) hash.update(Buffer.from(object.instanceMatrix.array.buffer));
  });
  return hash.digest('hex');
}

function matrixFor(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return mesh.matrixWorld.clone().multiply(matrix);
}

function checkFaces(root, row) {
  // Challenger's real armor skirts cover the upper wheel. Inspect that bowl
  // from the wheel bay inside the skirt, retaining the complete scene and all
  // eight radial witnesses through wheel motion. This is a construction/air
  // test, not a claim that an exterior viewer can see through the skirt.
  const rayStart = row.rayStart ?? .40;
  const core = root.getObjectByName('gearRoadWheelDiscs');
  const rubber = root.getObjectByName('gearRoadWheelTires');
  const shoulder = root.getObjectByName(row.shoulder);
  assert.equal(core.count, row.zs.length*2, 'one native profile-specific axle row per side');
  assert.equal(shoulder.count, row.zs.length*2, 'rubber shoulder follows that same station set');
  const all = [];
  root.traverse(o => { if (o.isMesh && !o.name.startsWith('procShadow_') && !o.userData.vehicleMarking) all.push(o); });
  for (let i = 0; i < core.count; i++) {
    const frame = matrixFor(core, i);
    assert.deepEqual(matrixFor(shoulder, i).elements, frame.elements,
      'shoulder and true bowl use identical suspension and spinning transforms');
    assert.deepEqual(matrixFor(rubber, i).elements, frame.elements,
      'existing tire station moves with its supported steel face');
    const side = Math.sign(new THREE.Vector3().setFromMatrixPosition(frame).x);
    // The posed root is tested separately below, so choose side in owner space.
    const local = new THREE.Matrix4(); core.getMatrixAt(i, local);
    const axleSide = Math.sign(new THREE.Vector3().setFromMatrixPosition(local).x);
    assert.ok(side !== 0 && axleSide !== 0);
    const direction = new THREE.Vector3(-axleSide, 0, 0).transformDirection(frame);
    for (const [radius, depth] of row.witnesses) for (let angle = 0; angle < 8; angle++) {
      // Interior-of-facet witnesses avoid floating-point ambiguity exactly on
      // a duplicated lathe seam. Account for the fixed 48-sided chord—not a
      // candidate-fitted ray shift or source-accuracy assertion.
      const theta = angle * Math.PI / 4 + Math.PI / 48;
      const chordRadius = radius * Math.cos(Math.PI / 48);
      const origin = new THREE.Vector3(axleSide * rayStart, chordRadius * Math.cos(theta),
        chordRadius * Math.sin(theta)).applyMatrix4(frame);
      const hit = new THREE.Raycaster(origin, direction, 0, .8).intersectObjects(all, false)[0];
      assert.equal(hit?.object.name, 'gearRoadWheelDiscs',
        `${row.id} instance ${i} radius ${radius} angle ${angle}: actual steel bowl is first`);
      near(hit?.distance, rayStart - depth, 2e-6, 'held-out actual bowl/rim radial depth');
      assert.equal(new THREE.Raycaster(origin, direction, 0, rayStart - depth - .002)
        .intersectObjects(all, false)[0], undefined, 'the dish recess is genuine empty volume');
    }
    const hub = new THREE.Raycaster(new THREE.Vector3(axleSide * rayStart, .015, 0).applyMatrix4(frame),
      direction, 0, .8).intersectObjects(all, false)[0];
    near(hub?.distance, rayStart - row.hub, 2e-6, 'small raised hub stays connected to the closed wheel core');
  }
  core.geometry.computeBoundingBox(); rubber.geometry.computeBoundingBox(); shoulder.geometry.computeBoundingBox();
  near(rubber.geometry.boundingBox.max.x, row.width / 2, 1e-7, 'unchanged primary rubber axial extent');
  near(shoulder.geometry.boundingBox.max.x, row.width * .515, 1e-7, 'unchanged proud rubber shoulder extent');
  near(core.geometry.boundingBox.max.y, row.rim, 1e-7, 'steel outer rim overlaps rubber opening');
  assert.ok(row.rim - row.openingRadius >= .0019, 'positive steel/rubber attachment, not floating separate rings');
  assert.deepEqual(auditTankWheelQuality(root).issues, [], 'actual native arm/wheel clearance remains strict');
}

for (const row of cases) for (const quality of ['high', 'low']) {
  const before = build(row.id, quality, true);
  const after = build(row.id, quality);
  try {
    assert.equal(immutableSurfaces(after.tank.root), immutableSurfaces(before.tank.root),
      'all non-wheel geometry, end drums, tracks, instances and world transforms stay byte-identical');
    assert.deepEqual(after.gear.roadWheelLayout, before.gear.roadWheelLayout,
      'all established road axles remain unchanged');
    assert.deepEqual(after.gear.roadWheelLayout.wheelZs, row.zs);
    near(after.gear.roadWheelLayout.xc, row.x, 1e-12, 'fixed axle lateral station');
    near(after.gear.roadWheelLayout.wheelY, row.y, 1e-12, 'fixed axle rest height');
    checkFaces(after.tank.root, row);
    for (const [left, right] of [[.123, -.217], [.831, .361]]) {
      before.gear.update(left, right, 0); after.gear.update(left, right, 0);
      after.tank.root.updateMatrixWorld(true); before.tank.root.updateMatrixWorld(true);
      assert.equal(immutableSurfaces(after.tank.root), immutableSurfaces(before.tank.root),
        'changed bowls do not alter the moving course or end-wheel rotation');
      checkFaces(after.tank.root, row);
    }
    after.tank.root.rotation.y = .43;
    after.tank.root.position.set(2, .3, -1);
    after.tank.root.updateMatrixWorld(true);
    checkFaces(after.tank.root, row);
    const geometries = new Set();
    after.tank.root.traverse(o => { if (o.isMesh && (o.name === 'gearRoadWheelDiscs'
      || o.name === row.shoulder || o.name === 'gearRoadWheelTires')) geometries.add(o.geometry); });
    const disposed = new Set();
    for (const geometry of geometries) geometry.addEventListener('dispose', () => disposed.add(geometry));
    after.tank.dispose();
    assert.equal(disposed.size, geometries.size, 'all owned steel and annular rubber buffers are disposed');
    after.tank = null;
  } finally { before.tank.dispose(); after.tank?.dispose(); }
}
console.log('primaryPhotoWheelSolids.selftest: high/low real bowls, support, motion, strict clearance and non-wheel preservation pass');
