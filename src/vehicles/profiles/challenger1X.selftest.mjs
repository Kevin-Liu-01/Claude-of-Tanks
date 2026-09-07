import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank as createPlayableTank } from '../tankFactory.ts';
import { KIT, registerProfiledBuilders } from '../tankFactoryCore.ts';
import {buildChallenger1X as photoDraft} from './challenger1XPhotoDraft.ts';
import {buildChallenger1X as supplied} from './challenger1X.ts';

// Historical photo-primitive regression only. The current supplied-file model
// is accepted exclusively by its separate actual-ID tests and raw source gates.
function createTank(...args) {
  registerProfiledBuilders({challenger1_x:photoDraft});
  try { return createPlayableTank(...args); }
  finally { registerProfiledBuilders({challenger1_x:supplied}); }
}

// Fixed public-handbook values, printed xiii, not measurements from AI input.
const HANDBOOK = { width: 3.510, overall: 11.560, hood: 2.950, clearance: .500, links: 92 };
const near = (got, expected, tolerance, label) => assert.ok(
  Number.isFinite(got) && Math.abs(got - expected) <= tolerance,
  `${label}: ${got}, expected ${expected} ± ${tolerance}`);
const ray = (meshes, from, direction, far = 20) => new THREE.Raycaster(
  new THREE.Vector3(...from), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];
function bounds(meshes) {
  const out = new THREE.Box3(), p = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const mesh of meshes) for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(n, matrix);
      matrix.premultiply(mesh.matrixWorld);
    } else matrix.copy(mesh.matrixWorld);
    const a = mesh.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) out.expandByPoint(p.fromBufferAttribute(a, i).applyMatrix4(matrix));
  }
  return out;
}

function checkRearEquipment(meshes) {
  const hull = meshes.filter(m => m.name === 'hull');
  const detail = meshes.filter(m => m.name === 'hullDetail');
  const back = (x, y, parts = meshes) => ray(parts, [x, y, -4.5], [0, 0, 1]);
  // Fig.20 identifies exposed beam, swivel, A-frame legs and eyes. Their
  // small dimensions are drawing-led estimates; these tests prove actual
  // visibility/support/air, not fictitious millimetric source accuracy.
  for (const [x, y, z] of [[0, 1.154, -4.193], [0, 1.472, -4.192],
    [-1.20, 1.52, -4.190], [1.20, 1.52, -4.190],
    [-.465, 1.327, -4.192], [.465, 1.327, -4.192]]) {
    const hit = back(x, y);
    assert.ok(hit?.object.name === 'hullDetail', 'rear equipment is visible before rear armor');
    near(hit?.point.z, z, .00002, 'actual exposed drawing-led rear fitting');
    near(back(x, y, hull)?.point.z, -4.13, .00001, 'permanent rear armor has not moved');
  }
  for (const side of [-1, 1]) {
    assert.equal(ray(meshes, [side * .45, 1.45, -4.20], [0, 0, 1], .065), undefined,
      'open A-frame has real space in front of its unchanged backing wall');
    near(back(side * .93, 1.285)?.point.z, -4.13, .00001,
      'rear-visible towing eye has a real hole, backed by permanent armor');
    assert.ok(back(side * (.93 + .06), 1.285)?.point.z < -4.18,
      'the same eye retains its solid surrounding rim');
  }
  for (const [x, y, minimumOverlap] of [[0, 1.154, .016],
    [0, 1.472, .02], [1.20, 1.52, .05], [-1.20, 1.52, .05]]) {
    const front = ray(detail, [x, y, -3.80], [0, 0, -1])?.point.z;
    assert.ok(front + 4.13 > minimumOverlap,
      'actual stock extends positively into the fixed permanent armor');
  }
}

for (const quality of ['high', 'low']) {
  const original = KIT.buildRunningGear;
  let tank, gear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  try {
    tank = createTank('challenger1_x', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
  } finally { KIT.buildRunningGear = original; }
  try {
    tank.root.updateMatrixWorld(true);
    const meshes = [];
    tank.root.traverse(mesh => {
      if (mesh.isMesh && !mesh.name.startsWith('procShadow_') && !mesh.userData.vehicleMarking) meshes.push(mesh);
    });
    const get = name => {
      const result = tank.root.getObjectByName(name);
      assert.ok(result, `${quality}: actual ${name} exists`);
      return result;
    };
    const hull = get('hull'), yaw = get('rig_turret'), gun = get('rig_gun');
    checkRearEquipment(meshes);
    const recoil = get('rig_recoil'), muzzle = get('rig_muzzle');
    const envelope = bounds(meshes);
    near(envelope.max.x - envelope.min.x, HANDBOOK.width, .018, 'handbook width plus seated proud pins');
    near(envelope.max.z - envelope.min.z, HANDBOOK.overall, .004, 'handbook gun-forward length');
    near(ray([hull], [0, 0, 0], [0, 1, 0])?.point.y, HANDBOOK.clearance, 1e-6,
      'nominal structural ground clearance');
    near(ray(meshes, [.49, 4, .09], [0, -1, 0])?.point.y, HANDBOOK.hood, 1e-6,
      'commander sight hood height, not armor roof');
    const shoes = meshes.filter(mesh => mesh.userData.trackRigidLinkChords);
    assert.equal(shoes.length, 2);
    for (const mesh of shoes) assert.equal(mesh.userData.trackShoeCountPerSide, HANDBOOK.links,
      '92 real shoes per track, as listed in the handbook');
    const stations = structuredClone(gear.roadWheelLayout), pitch = shoes[0].userData.trackShoePitchM;
    for (let phase = 0; phase < 48; phase++) {
      gear.update(pitch * phase / 48, -pitch * phase / 48, 0);
      near(bounds(shoes).min.y, 0, .0001, 'every opposing-scroll phase retains loaded-shoe ground contact');
      assert.deepEqual(gear.roadWheelLayout, stations, 'ground contact never moves mechanical axle stations');
    }
    gear.update(0, 0, 0);
    near(muzzle.getWorldPosition(new THREE.Vector3()).z, 7.365, 1e-6, 'physical muzzle marker');
    near(ray([get('gunDark')], [0, 2.10, 7.6], [0, 0, -1])?.point.z, 7.0555, .00002,
      'authored main-gun bore has recessed metal backing');
    // The shared core places its opaque bore-floor lining exactly 1.2 mm ahead
    // of that authored floor. It must not close the 308 mm front cavity.
    near(ray(meshes, [0, 2.10, 7.6], [0, 0, -1])?.point.z, 7.0567, .00002,
      'complete bore retains only its seated core floor lining');
    assert.equal(ray(meshes, [0, 1.72, 2.65], [0, 0, -1], .34), undefined,
      'driver approaches through the lower channel, not a full-width glacis fill');
    near(ray(meshes, [.37, 1.72, 2.65], [0, 0, -1])?.point.z, 2.0948, .005,
      'raised shoulder remains solid beside the driver channel');
    for (const [x, y, z, expected, clear] of [[0, 1.739, 1.67, 1.5235, .08],
      [1.18, 2.74, .90, .352, .45], [.49, 2.84, .30, .035, .20]]) {
      const hit = ray(meshes, [x, y, z], [0, 0, -1]);
      assert.equal(hit?.object.name, x === 0 ? 'hullGlass' : 'turretGlass', 'actual optic backing visible');
      near(hit?.point.z, expected, .001, 'explicitly inferred recessed optic plane');
      assert.equal(ray(meshes, [x, y, z], [0, 0, -1], clear), undefined, 'literal front aperture air');
    }
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const c = new THREE.Vector3(side * (.76 + i * .112), 2.365, [1.78, 1.72, 1.66, 1.50, 1.31][i]);
      const d = new THREE.Vector3(side * .36, .53, .77).normalize();
      const from = c.clone().addScaledVector(d, .12);
      assert.equal(ray(meshes, from.toArray(), d.clone().negate().toArray(), .16), undefined,
        'all ten source-layout smoke mouths remain real open air');
      near(ray(meshes, from.toArray(), d.clone().negate().toArray(), .20)?.distance, .183, .001,
        'each smoke tube has its recessed stock backing');
    }
    assert.ok(get('gunMount').parent === gun, 'real mantlet follows pitch');
    assert.ok(get('gun').parent === recoil, 'barrel, sleeve and muzzle follow recoil');
    const mg = get('sourceMachineGun_turretDetail');
    const fixed = meshes.filter(m => !m.name.startsWith('sourceMachineGun_'));
    const foot = ray([mg], [.61, 2.5, -.37], [0, 1, 0])?.point.y;
    const seat = ray(fixed, [.61, 3, -.37], [0, -1, 0])?.point.y;
    assert.ok(Number.isFinite(foot) && seat - foot > .02,
      'offset MG foot has positive physical overlap with permanent cupola/hatch');
    const counts = meshes.map(mesh => [mesh, mesh.geometry.attributes.position.count]);
    for (const angle of [-.8, .7]) for (const elevation of [-.16, .30]) {
      yaw.rotation.y = angle;
      gun.rotation.x = elevation;
      tank.root.updateMatrixWorld(true);
      const before = muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.10;
      tank.root.updateMatrixWorld(true);
      near(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())), .10, 1e-6,
        'actual muzzle follows recoil after legal yaw and pitch');
      recoil.position.z = 0;
      checkRearEquipment(meshes);
      for (const [mesh, count] of counts) assert.equal(mesh.geometry.attributes.position.count, count,
        'articulation preserves equipment and mesh census');
    }
  } finally { tank.dispose(); }
}
console.log('challenger1X.selftest: high/low handbook envelope, actual apertures, 92-link native ground and rig ownership passed');
