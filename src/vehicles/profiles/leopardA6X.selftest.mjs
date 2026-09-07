import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';

// Independent fixed canonical-source witnesses. These are not imported from
// builder datums or generated anatomy. Original metre-scale GLB: b98d8199…4477.
const SOURCE = Object.freeze({
  pivot: [.000005, 2.14836, 1.047795],
  trunnion: [.000005, 1.97054, 1.419495],
  muzzle: [.000005, 1.97054, 7.139555],
  wheelBottom: .07289,
  roof: [[.8, 2.4, 2.2076524725], [-1.2, 2.4, 2.0637851194]],
  glass: [-.72, 2.42, 1.822243], rim: [-.72, 2.50, 1.869834],
});
const near = (got, expected, tolerance, label) => assert.ok(
  Number.isFinite(got) && Math.abs(got - expected) <= tolerance,
  `${label}: ${got}; expected ${expected} ± ${tolerance}`);
const physicalMeshes = root => {
  const result = [];
  root.traverse(o => {
    if (o.isMesh && !o.name.startsWith('procShadow_') && !o.userData.vehicleMarking) result.push(o);
  });
  return result;
};
const ray = (meshes, origin, direction, far = 20) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];
const vectorNear = (got, expected, tolerance, label) => expected.forEach((v, i) =>
  near(got.getComponent(i), v, tolerance, `${label} axis ${i}`));
const shoeBounds = root => {
  const box = new THREE.Box3(), vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  root.traverse(mesh => {
    if (!mesh.isInstancedMesh || !mesh.name.startsWith('gearTrackPad')) return;
    const positions = mesh.geometry.attributes.position;
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix);
      matrix.premultiply(mesh.matrixWorld);
      for (let i = 0; i < positions.count; i++) {
        box.expandByPoint(vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix));
      }
    }
  });
  return box;
};

function pairedWheelWitnesses(root, meshes, gear) {
  const faces = [-1, 1].map(side => root.getObjectByName(`a6SourcePairedWheelFaces${side < 0 ? 'L' : 'R'}`));
  const arms = root.getObjectByName('gearSuspensionLinks');
  const before = new THREE.Matrix4(), after = new THREE.Matrix4();
  for (const face of faces) assert.equal(face.count, 7, 'seven actual paired assemblies per source side');
  for (const side of [-1, 1]) {
    // Held-out radial source rays through l/r op wheel's actual turned dish.
    for (const [radius, x] of [[.18, 1.37602961], [.22, 1.38845509], [.26, 1.40916759],
      [.28, 1.43291896], [.30, 1.48832500], [.33, 1.50300503]]) {
      near(Math.abs(ray(meshes, [side * 3, .4182 + radius, -2.239845], [-side, 0, 0])?.point.x),
        x, radius === .33 ? .0007 : .00003, 'actual source stepped wheel crown');
    }
    for (const [radius, x] of [[.22, 1.24690431], [.26, 1.20530772],
      [.28, 1.18450943], [.30, 1.16928506]]) {
      const face = faces[side < 0 ? 0 : 1];
      const hit = ray([face], [0, .4182 + radius, -2.239845], [side, 0, 0]);
      near(Math.abs(hit?.point.x), x, .00003, 'one-sided source inboard dish remains a real facing surface');
      assert.ok(hit.face.normal.x * side < 0, 'inward-facing source wall has outward material winding');
    }
    for (const y of [.6182, .7082]) assert.equal(ray(meshes, [side * 1.32814, y, -2.34],
      [0, 0, 1], .20), undefined, 'source inter-tire air is not a hidden rubber/disc bridge');
    near(Math.abs(ray([arms], [side * 2, .68724, .918736], [-side, 0, 0])?.point.x),
      1.06018496, .00002, 'source narrow inboard anchor forging near the adjacent wheel');
    near(Math.abs(ray([arms], [side * 2, .4182, -2.239845], [-side, 0, 0])?.point.x),
      1.15615499, .00002, 'source axle forging retains its outward axial position');
  }
  for (const face of faces) {
    face.getMatrixAt(0, before);
    gear.update(.17, -.14, 0);
    face.getMatrixAt(0, after);
    for (const axis of [12, 13, 14]) near(after.elements[axis], before.elements[axis], 1e-7,
      'paired steel faces spin on the unchanged native axle');
    assert.ok(Math.abs(before.elements[5] - after.elements[5]) > .05,
      'source side-selected dish is genuinely driven by native wheel spin');
    gear.update(0, 0, 0);
  }
}

function actualArmClearance(root) {
  const arm = root.getObjectByName('gearSuspensionLinks'), wheels = [];
  root.traverse(mesh => {
    if (/^(gearRoadWheelTires|gearRoadWheelDiscs|a6SourcePairedWheelFaces)/.test(mesh.name)) wheels.push(mesh);
  });
  const positions = arm.geometry.attributes.position, indices = arm.geometry.index;
  const matrix = new THREE.Matrix4();
  let minimum = Infinity, witnesses = 0;
  for (let instance = 0; instance < arm.count; instance++) {
    arm.getMatrixAt(instance, matrix);
    matrix.premultiply(arm.matrixWorld);
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions,
        indices ? indices.getX(i + j) : i + j).applyMatrix4(matrix));
      const side = Math.sign(points[0].x);
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      if (normal.x * side < .8) continue;
      const samples = [...points, points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3)];
      for (const sample of samples) {
        const hit = ray(wheels, [0, sample.y, sample.z], [side, 0, 0]);
        if (!hit) continue;
        minimum = Math.min(minimum, Math.abs(hit.point.x) - Math.abs(sample.x));
        witnesses++;
      }
    }
  }
  assert.ok(witnesses > 150, 'clearance checks actual same-radius wheel faces across every arm');
  assert.ok(minimum >= .019162, `source-forged arm clears real wheel surface: ${minimum}`);
}

for (const quality of ['high', 'low']) {
  const original = KIT.buildRunningGear;
  let tank, gear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  try {
    tank = createTank('leo2a6_x', null, { proceduralOnly: true, geometryReceipt: true,
      quality, batchStatic: false });
  } finally { KIT.buildRunningGear = original; }
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const get = name => {
      const o = root.getObjectByName(name);
      assert.ok(o, `${quality}: actual ${name} exists`);
      return o;
    };
    const hull = get('hull'), turret = get('turret'), rig = get('rig_turret');
    const gun = get('rig_gun'), recoil = get('rig_recoil'), barrel = get('gun');
    const mount = get('gunMount'), muzzle = get('rig_muzzle');
    assert.equal(mount.parent, gun, 'actual mantlet pitches, independently of barrel recoil');
    assert.equal(barrel.parent, recoil, 'all physical barrel segments recoil');
    vectorNear(rig.getWorldPosition(new THREE.Vector3()), SOURCE.pivot, 1e-6, 'source yaw origin');
    vectorNear(gun.getWorldPosition(new THREE.Vector3()), SOURCE.trunnion, 1e-6, 'actual bore pitch axis');
    vectorNear(muzzle.getWorldPosition(new THREE.Vector3()), SOURCE.muzzle, 1e-6, 'source muzzle');
    for (const [x, z, y] of SOURCE.roof) near(ray([turret], [x, 5, z], [0, -1, 0])?.point.y,
      y, .001, `source transverse cheek plane ${x}/${z}`);
    for (const z of [-2.5, -1.3, 0, 1.3, 2.5]) {
      const top = ray([hull], [0, 4, z], [0, -1, 0])?.point.y;
      const bottom = ray([hull], [0, 0, z], [0, 1, 0])?.point.y;
      assert.ok(top > 1.50 && bottom < .55, 'separate real closed roof and belly, not silhouette planes');
    }
    const all = physicalMeshes(root);
    pairedWheelWitnesses(root, all, gear);
    actualArmClearance(root);
    near(ray(all, [-.72, 4, 1.25], [0, -1, 0])?.point.y, 2.56400671, .001,
      'source raised EMES aft housing is present behind its window');
    near(ray(all, [-.94, 4, 1.25], [0, -1, 0])?.point.y, 2.55669493, .002,
      'source housing retains its transverse roof slope');
    near(ray(all, [-.7, 4, .37], [0, -1, 0])?.point.y, 2.64625357, .0001,
      'source front cupola sight has a thin raised cap');
    assert.equal(ray(all, [0, 2.48, -1.18], [1, 0, 0], .10), undefined,
      'source aft lifting eye is actual open space');
    near(ray(all, [0, 4, -1.24], [0, -1, 0])?.point.y, 2.53584166, .0002,
      'source lifting eye outer arch remains material');
    for (const side of [-1, 1]) {
      near(ray(all, [side * 1.31, 1.56, 4], [0, 0, -1])?.point.z, 3.255105, .0001,
        'source raised fender mirror face, not a missing bow silhouette');
      near(ray(all, [side * 1.50, 3, 3.306465], [0, -1, 0])?.point.y, 1.52674997, .0001,
        'source horizontal mirror arm connects the plate to the outboard hinge');
    }
    near(ray([mount], [0, 4, 2.5], [0, -1, 0])?.point.y, 2.315575, .001,
      'independent upper mantlet rake, not a shortened generic housing');
    for (const side of [-1, 1]) {
      near(ray(all, [side * .90, 0, -1.75457], [0, 1, 0])?.point.y, .47755, .001,
        'source-sized inboard fixed anchor, not a low axle boss in the wrong X plane');
      near(Math.abs(ray(all, [side * 3, 1.5, .20], [-side, 0, 0])?.point.x), 1.67796969, .001,
        'source folded upper skirt sheet crossfall');
    }
    near(ray([hull], [0, 0, -3.60], [0, 1, 0])?.point.y, 1.314924, .0002,
      'source lower engine return leaves real air below');
    for (const [y, z] of [[.84, -3.55], [.80, -3.55], [.84, -3.60]]) {
      assert.equal(ray(all, [1, y, z], [-1, 0, 0], 2), undefined,
        'actual whole-model stern hook opening is not filled by the hull');
    }
    near(ray(all, [0, .84, -4], [0, 0, 1])?.point.z, -3.65222048, .001,
      'source recovery hook exterior, without filling its eye');
    const [gx, gy, gz] = SOURCE.glass, [rx, ry, rz] = SOURCE.rim;
    const glass = ray(all, [gx, gy, 3], [0, 0, -1]);
    assert.equal(glass?.object.name, 'turretGlass', 'front approach reaches recessed glass itself');
    near(glass?.point.z, gz, .001, 'fixed source glass plane');
    near(ray(all, [rx, ry, 3], [0, 0, -1])?.point.z, rz, .001, 'fixed source raised rim');
    assert.equal(ray(all, [gx, gy, 3], [0, 0, -1], 1.16), undefined,
      'EMES approach is actual empty volume, not dark-painted forward armor');
    assert.ok(rz - gz > .047, 'source recess is deeper than 47 mm');
    const wheels = new THREE.Box3().setFromObject(get('gearRoadWheelTires'));
    // Low quality uses fewer angular facets; its vertex minimum may sit up to
    // 3 mm above the circumscribed source circle without changing the axle.
    near(wheels.min.y, SOURCE.wheelBottom, .003, 'fixed road wheel rest height');
    const ends = all.filter(m => m.name === 'gearEndWheelBody');
    assert.equal(ends.length, 4, 'two physical drive and two idler wheels');
    for (const end of ends) {
      const aft = end.position.z < 0;
      near(Math.abs(end.position.x), aft ? 1.3306945 : 1.265045, 1e-6,
        'independently measured end casting axial center, not the belt lane');
      near(end.position.y, aft ? .82369 : .8399, 1e-6, 'source end axle Y');
      near(end.position.z, aft ? -3.058845 : 3.365775, 1e-6, 'source end axle Z');
      const casting = new THREE.Box3().setFromObject(end);
      near(Math.max(Math.abs(casting.min.x), Math.abs(casting.max.x)),
        aft ? 1.642835 : 1.505115, .001, 'actual source end casting outer plane');
    }
    near(Math.abs(get('gearTrackBandL').position.x), 1.32814, 1e-6,
      'independent left belt lane remains unchanged by casting correction');
    near(get('gearTrackBandR').position.x, 1.32814, 1e-6,
      'independent right belt lane remains unchanged by casting correction');
    // Canonical track.001/track.003 flat source shoes span Y0–.07568.
    // Check actual instanced vertices, including angled end-transition shoes;
    // the contact-plane receipt alone missed the former 22 mm penetration.
    const shoes = shoeBounds(root);
    assert.ok(shoes.min.y >= -1e-7, `every rigid shoe stays above source ground: ${shoes.min.y}`);
    near(shoes.min.y, 0, .003, 'source ground contact is not replaced by floating shoes');
    for (const x of [1.1, 1.5]) {
      near(ray(all, [x, -.1, 0], [0, 1, 0])?.point.y, 0, .003,
        'source flat outer tread surface');
      near(ray(all, [x, .2, 0], [0, -1, 0])?.point.y, .07568, .003,
        'source flat inner shoe/web surface');
    }
    const bandInnerTop = ray([get('gearTrackBandR')], [1.1, .2, 0], [0, -1, 0])?.point.y;
    assert.ok(bandInnerTop < SOURCE.wheelBottom,
      'concealed carrier stays below unchanged source road-wheel rest');
    const census = all.map(m => [m, m.geometry.attributes.position.count]);
    for (const yaw of [-.8, .65]) for (const pitch of [-.12, .25]) {
      rig.rotation.y = yaw;
      gun.rotation.x = pitch;
      root.updateMatrixWorld(true);
      vectorNear(gun.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(
        0, -.17782, .37170).applyMatrix4(rig.matrixWorld).toArray(), 1e-6, 'yaw-owned trunnion');
      const before = muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.09;
      root.updateMatrixWorld(true);
      near(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())), .09, 1e-6, 'actual barrel recoil');
      recoil.position.z = 0;
      for (const [mesh, count] of census) assert.equal(mesh.geometry.attributes.position.count, count,
        'articulation does not rebuild or remove source-specific hardware');
    }
  } finally {
    tank.dispose();
  }
}
console.log('leopardA6X.selftest: high/low source datums, closed armor, EMES air, gear and gun ownership passed');
