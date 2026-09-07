import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildChieftain5XPhotoDraft } from './chieftain5XPhotoDraft.ts';

// Historical fixture only: these original photo assertions are deliberately
// unchanged. Current source-profile acceptance has its own actual-ID test.
registerProfiledBuilders({ chieftain5_x: buildChieftain5XPhotoDraft });

// WEG printed 4-7 anchors the chassis envelope and two six-cup banks.
// Other constants below test explicit construction estimates, not AI metrics.
const near = (got, target, tolerance, label) => assert.ok(Number.isFinite(got)
  && Math.abs(got - target) <= tolerance, `${label}: ${got}; expected ${target} ± ${tolerance}`);
const ray = (meshes, from, direction, far = 15) => new THREE.Raycaster(
  new THREE.Vector3(...from), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];
function physicalMeshes(root) {
  const meshes = [];
  root.traverse(m => {
    if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) meshes.push(m);
  });
  return meshes;
}
function bounds(meshes) {
  const box = new THREE.Box3(), p = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const mesh of meshes) for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(n, matrix);
      matrix.premultiply(mesh.matrixWorld);
    } else matrix.copy(mesh.matrixWorld);
    const a = mesh.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) box.expandByPoint(p.fromBufferAttribute(a, i).applyMatrix4(matrix));
  }
  return box;
}

function checkBareCasting(tank) {
  const turret = tank.root.getObjectByName('turret');
  near(bounds([turret]).max.y, 2.45, .00002, 'rounded bare casting preserves its fixed roof datum');
  for (const side of [-1, 1]) {
    const lower = ray([turret], [side * .7, 1, 1.53], [0, 1, 0]);
    assert.ok(lower && lower.point.y > 1.82 && lower.point.y < 1.845,
      'photo-led forward lower cheek has positive rounded depth, not a thin lens');
    const front = ray([turret], [side * .7, 1.9, 3], [0, 0, -1]);
    assert.ok(front && front.point.z > 1.68 && front.point.z < 1.72,
      'held-out lower front witness intersects real casting');
  }
  const hull = physicalMeshes(tank.root.getObjectByName('rig_hull'));
  const driver = ray(hull, [0, 2, 1.493], [0, -1, 0]);
  const bottom = ray([turret], [0, 1.74, 1.493], [0, 1, 0]);
  assert.ok(driver && bottom && bottom.point.y - driver.point.y > .007,
    'fuller center face retains actual driver/periscope clearance');
}

for (const quality of ['high', 'low']) {
  const original = KIT.buildRunningGear;
  let tank, gear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  try {
    tank = createTank('chieftain5_x', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
  } finally { KIT.buildRunningGear = original; }
  try {
    tank.root.updateMatrixWorld(true);
    const get = name => {
      const part = tank.root.getObjectByName(name);
      assert.ok(part, `${quality}: ${name} exists`);
      return part;
    };
    const meshes = physicalMeshes(tank.root), hullMeshes = physicalMeshes(get('rig_hull'));
    checkBareCasting(tank);
    const chassis = bounds(hullMeshes), entire = bounds(meshes);
    near(chassis.max.z - chassis.min.z, 7.48, .001, 'WEG chassis length including end guards');
    near(chassis.max.x - chassis.min.x, 3.51, .016, 'WEG width plus shallow external bolt heads');
    near(entire.max.z - entire.min.z, 10.80, .001, 'separately inferred gun-forward envelope');
    near(ray([get('hull')], [0, 0, 0], [0, 1, 0])?.point.y, .508, .00002,
      'nominal inferred underfloor remains above ground');
    near(get('rig_muzzle').getWorldPosition(new THREE.Vector3()).z, 7.06, .00002,
      'physical muzzle is not overwritten by an inner-stock length');
    near(ray([get('gunDark')], [0, 2.035, 7.4], [0, 0, -1])?.point.z, 6.740, .00002,
      '120 mm bore has its authored recessed floor');
    near(ray(meshes, [0, 2.035, 7.4], [0, 0, -1])?.point.z, 6.7412, .00002,
      'complete bore retains only the shared seated 1.2 mm floor lining');
    for (const [label, from, target, clear] of [
      ['driver', [0, 1.683, 1.70], 1.4505, .20],
      ['gunner', [.465, 2.438, 1.30], .9925, .25],
      ['searchlight', [-1.22, 2.227, .88], .460, .36],
    ]) {
      const hit = ray(meshes, from, [0, 0, -1]);
      assert.equal(hit?.object.name, label === 'driver' ? 'hullGlass' : 'turretGlass',
        `${label}: actual transparent backing is not covered by a solid case`);
      near(hit?.point.z, target, .00002, `${label}: explicitly inferred recessed plane`);
      assert.equal(ray(meshes, from, [0, 0, -1], clear), undefined, `${label}: real approach air`);
    }
    assert.ok(ray(meshes, [-1.512, 2.227, .88], [0, 0, -1], .10),
      'the open searchlight still retains its physical outer jamb');
    assert.equal(ray(meshes, [0, 1.645, 2.43], [0, 0, -1], .27), undefined,
      'central driver approach is not a full-width raised armor plate');
    for (const side of [-1, 1]) {
      const axis = new THREE.Vector3(side * .49, .22, .844).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
      const origin = new THREE.Vector3(side * 1.215, 2.327, 1.12).addScaledVector(axis, .040);
      for (const dy of [-.046, .046]) for (const dx of [-.087, 0, .087]) {
        for (let sample = 0; sample < 8; sample++) {
          const angle = sample * Math.PI / 4;
          const from = new THREE.Vector3(dx + Math.cos(angle) * .023, dy + Math.sin(angle) * .023, 0)
            .applyQuaternion(q).add(origin).addScaledVector(axis, .12);
          const direction = axis.clone().negate().toArray();
          assert.equal(ray(meshes, from.toArray(), direction, .19), undefined,
            'all twelve primary-documented cups retain radial bore air');
          const stock = ray(meshes, from.toArray(), direction, .22);
          assert.equal(stock?.object.name, 'turretDark', 'bare cheek cannot replace the recessed stock');
          near(stock?.distance, .204, .00002, 'all radial cup rays reach their supported stock');
        }
        const rim = new THREE.Vector3(dx + .035, dy, 0).applyQuaternion(q)
          .add(origin).addScaledVector(axis, .12);
        near(ray(meshes, rim.toArray(), axis.clone().negate().toArray())?.distance, .0315, .00002,
          'a real annular lip closes each cup wall at its mouth');
      }
    }
    const shoes = meshes.filter(m => m.userData.trackRigidLinkChords);
    assert.equal(shoes.length, 2);
    const layout = structuredClone(gear.roadWheelLayout), pitch = shoes[0].userData.trackShoePitchM;
    for (let i = 0; i < 48; i++) {
      gear.update(pitch * i / 48, -pitch * i / 48, 0);
      near(bounds(shoes).min.y, 0, .0001, 'all opposing-scroll phases retain physical shoe ground contact');
      assert.deepEqual(gear.roadWheelLayout, layout, 'track seating never shifts the six paired axle stations');
    }
    gear.update(0, 0, 0);
    const yaw = get('rig_turret'), gun = get('rig_gun'), recoil = get('rig_recoil');
    assert.ok(get('gunMount').parent === gun, 'real canvas/cradle envelope follows pitch');
    assert.ok(get('gun').parent === recoil, 'thermal jacket and muzzle fixtures recoil with barrel');
    const mg = get('sourceMachineGun_turretDetail');
    const fixed = meshes.filter(m => !m.name.startsWith('sourceMachineGun_'));
    const foot = ray([mg], [.63, 2.5, -.42], [0, 1, 0])?.point.y;
    const seat = ray(fixed, [.63, 3, -.42], [0, -1, 0])?.point.y;
    assert.ok(Number.isFinite(foot) && seat - foot > .02,
      'offset MG radial foot overlaps the permanent hatch instead of floating above it');
    const census = meshes.map(m => [m, m.geometry.attributes.position.count]);
    for (const angle of [-.70, .83]) for (const elevation of [-.17, .34]) {
      yaw.rotation.y = angle;
      gun.rotation.x = elevation;
      tank.root.updateMatrixWorld(true);
      const before = get('rig_muzzle').getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.105;
      tank.root.updateMatrixWorld(true);
      near(before.distanceTo(get('rig_muzzle').getWorldPosition(new THREE.Vector3())), .105, .00002,
        'legal yaw/pitch keeps actual recoil attached');
      recoil.position.z = 0;
      for (const [mesh, count] of census) assert.equal(mesh.geometry.attributes.position.count, count,
        'all fixed and moving fixtures survive articulation unchanged');
    }
  } finally { tank.dispose(); }
}
console.log('chieftain5X.selftest: high/low primary envelope, twelve open cups, actual optics, native ground and rig ownership passed');
