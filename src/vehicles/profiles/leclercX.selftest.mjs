import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';

const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `${label}: ${a}; source ${b} ± ${tolerance}`);
const ray = (meshes, origin, direction, far = 12) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];

function physicalBounds(meshes) {
  const box = new THREE.Box3(), vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const mesh of meshes) for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(n, matrix);
      matrix.premultiply(mesh.matrixWorld);
    } else matrix.copy(mesh.matrixWorld);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) box.expandByPoint(
      vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix));
  }
  return box;
}

function checkRearChannels(all) {
  // Object_4/Object_23 held-out planes. Each bracket has two raised cheeks,
  // a recessed floor and a separate attached stock, not a filled prism.
  for (const [x, z, y] of [[.20, -3.55, 1.47155764], [.20, -3.38, 1.53801688],
    [.20, -3.28, 1.55431354], [.315, -3.55, 1.46225421],
    [.315, -3.38, 1.40154462], [.315, -3.28, 1.43047464]]) {
    const hit = ray(all, [x, 3, z], [0, -1, 0]);
    near(hit?.point.y, y, .00001, 'fixed source rear-bracket surface');
    assert.ok(hit?.object.name === 'hullDetail' || hit?.object.name === 'hullDark',
      'service bracket is permanent hull equipment, not turret or expendable armor');
  }
  for (const x of [-.83746, -.36136, .31449, .81209]) {
    assert.equal(ray(all, [x, 1.50, -3.28], [0, -1, 0], .06), undefined,
      'each real central channel retains air above its floor');
    near(ray(all, [x, 1.50, -3.28], [0, -1, 0])?.point.y, 1.43047464, .00001,
      'each channel is closed by its actual depressed source floor');
  }
  const hull = all.find(m => m.name === 'hull');
  const detail = all.filter(m => m.name === 'hullDetail');
  const top = ray([hull], [.20, 3, -3.19], [0, -1, 0])?.point.y;
  const foot = ray(detail, [.20, 0, -3.19], [0, 1, 0])?.point.y;
  assert.ok(top > foot + .05, 'measured bracket root overlaps permanent stern armor');
}

function checkSourceWheelFaces(all) {
  const wheels = all.filter(m => /^gearRoadWheel|^leclercSourceWheel/.test(m.name));
  assert.equal(all.filter(m => /^leclercSourceWheel/.test(m.name)).length, 4,
    'two source-owned steel/groove layers on each physical road-wheel row');
  const envelope = physicalBounds(wheels);
  near(envelope.min.x, -1.5982677, .00001, 'complete source left wheel envelope, including steel');
  near(envelope.max.x, 1.5147352, .00001, 'complete source right wheel envelope, including steel');
  // Source Object_6/Object_23 independent outward plate steps. Rays use the
  // open lower wheel half so skirt sheets cannot masquerade as wheel faces.
  for (const [side, center] of [[-1, -1.3349235], [1, 1.2513905]]) {
    for (const [r, rightX] of [[.06, 1.47367597], [.12, 1.38927376],
      [.20, 1.36334872], [.265, 1.39867330], [.30, 1.51473522]]) {
      const hit = ray(wheels, [side * 2, .4040425 - r, -1.90045], [-side, 0, 0]);
      near(hit?.point.x, center + side * (rightX - 1.2513905), .00001,
        'source stepped steel/tire outer face, with outward winding');
      assert.ok(hit?.face.normal.x * side > .99, 'visible plate has outward one-sided winding');
    }
    for (const r of [.285, .30, .315]) assert.equal(
      ray(wheels, [center, .4040425 + r, -2.02], [0, 0, 1], .24), undefined,
      'measured central tire groove retains real air above its depressed crown');
    near(ray(wheels, [center, 1, -1.90045], [0, -1, 0])?.point.y,
      .6837025, .00001, 'groove is backed by the source R279.660 rubber course');
  }
}

function checkMovingGear(root, all, gear) {
  const tires = root.getObjectByName('gearRoadWheelTires');
  const matrix = new THREE.Matrix4(), neutral = [], endNeutral = new Map();
  const zs = [-1.90045, -1.10856, -.26549, .56651, 1.38765, 2.17177];
  for (let i = 0; i < tires.count; i++) {
    tires.getMatrixAt(i, matrix);
    const center = new THREE.Vector3().setFromMatrixPosition(matrix);
    near(center.x, i % 2 ? 1.2513905 : -1.3349235, 1e-6, 'source asymmetric road-wheel X');
    near(center.y, .4040425, 1e-6, 'unchanged source road axle Y');
    near(center.z, zs[Math.floor(i / 2)], 1e-6, 'unchanged source road axle Z');
    neutral.push(matrix.clone());
  }
  const ends = all.filter(m => m.name === 'gearEndWheelBody');
  assert.equal(ends.length, 4);
  for (const end of ends) {
    const drive = end.userData.runningGearEndKind === 'sprocket', left = end.position.x < 0;
    near(end.position.x, drive ? (left ? -1.336972 : 1.2502425)
      : (left ? -1.3349235 : 1.2513905), 1e-6, 'source asymmetric end-wheel center');
    near(end.position.y, drive ? .77031 : .79055, 1e-6, 'source end axle Y');
    near(end.position.z, drive ? -2.57518 : 2.86860, 1e-6, 'source end axle Z');
    const box = physicalBounds([end]);
    near(box.max.x - box.min.x, drive ? .519098 : .526689, .00004,
      'actual source-sized drive body/idler axial envelope');
    endNeutral.set(end, { position: end.position.clone(), quaternion: end.quaternion.clone() });
  }
  const shoes = all.filter(m => m.userData.trackRigidLinkChords);
  assert.equal(shoes.length, 2);
  const pitch = shoes[0].userData.trackShoePitchM, layout = structuredClone(gear.roadWheelLayout);
  for (let i = 0; i < 48; i++) {
    gear.update(pitch * i / 48, -pitch * i / 48, 0);
    root.updateMatrixWorld(true);
    near(physicalBounds(shoes).min.y, 0, .0001, 'actual rigid shoes contact source ground throughout scroll');
    assert.deepEqual(gear.roadWheelLayout, layout, 'scroll does not move source axle layout');
  }
  for (let i = 0; i < tires.count; i++) {
    tires.getMatrixAt(i, matrix);
    for (const axis of [12, 13, 14]) near(matrix.elements[axis], neutral[i].elements[axis],
      1e-6, 'spinning road wheel retains its measured world center');
    assert.ok(Math.abs(matrix.elements[5] - neutral[i].elements[5]) > .01, 'road wheel actually spins');
  }
  for (const layer of all.filter(m => /^leclercSourceWheel/.test(m.name))) {
    assert.equal(layer.count, 6, 'additional faces never create another station row');
    const sideIndex = layer.name.endsWith('-1') ? 0 : 1;
    for (let i = 0; i < layer.count; i++) {
      const actual = new THREE.Matrix4(), expected = new THREE.Matrix4();
      layer.getMatrixAt(i, actual);
      tires.getMatrixAt(i * 2 + sideIndex, expected);
      assert.ok(actual.elements.every((value, n) => Math.abs(value - expected.elements[n]) < 1e-6),
        'source steel and groove follow the real native wheel spin and suspension matrix');
    }
  }
  for (const [end, before] of endNeutral) {
    assert.ok(end.position.distanceTo(before.position) < 1e-6, 'spinning end casting keeps its axle');
    assert.ok(end.quaternion.angleTo(before.quaternion) > .1, 'source-sized end casting actually spins');
  }
  gear.update(0, 0, 0);
}

// Fixed scalar witnesses from Char Leclerc before authoring. The source
// materials divide single components: measure all source turret meshes, not
// merely its first camo primitive. Neither glTF data nor builder constants are
// imported into this regression.
const faceTriangles = new Map();
for (const quality of ['high', 'low']) {
  const original = KIT.buildRunningGear;
  let tank, gear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  try {
    tank = createTank('leclerc_x', null, { proceduralOnly: true, geometryReceipt: true,
      quality, batchStatic: false });
  } finally { KIT.buildRunningGear = original; }
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const get = name => {
      const o = root.getObjectByName(name);
      assert.ok(o, `${quality}/${name}: real runtime part exists`);
      return o;
    };
    const all = [];
    root.traverse(o => { if (o.isMesh && !o.name.startsWith('procShadow_') && !o.userData.vehicleMarking) all.push(o); });
    checkSourceWheelFaces(all);
    faceTriangles.set(quality, all.filter(m => /^leclercSourceWheel/.test(m.name))
      .reduce((sum, m) => sum + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 * m.count, 0));
    const turret = get('rig_turret'), gun = get('rig_gun'), recoil = get('rig_recoil');
    const muzzle = get('rig_muzzle');
    near(turret.position.x, -.00215335966, 1e-6, 'actual source yaw X');
    near(turret.position.y, 1.40294994719, 1e-6, 'actual source yaw Y');
    near(turret.position.z, .72122934097, 1e-6, 'actual source yaw Z');
    const trunnion = gun.getWorldPosition(new THREE.Vector3());
    near(trunnion.x, .018886, 1e-6, 'independently cut physical bore X');
    near(trunnion.y, 1.8791055, 1e-6, 'independently cut physical bore Y');
    near(trunnion.z, 1.998880, 1e-6, 'source rear gun housing station');
    near(muzzle.getWorldPosition(new THREE.Vector3()).z, 6.239235, 1e-6, 'actual source muzzle station');
    assert.equal(get('gunMount').parent, gun, 'physical housing pitches');
    assert.equal(get('gun').parent, recoil, 'barrel and muzzle reference recoil together');
    const rotatingArmor = get('turret');
    near(ray([rotatingArmor], [3, 1.35, .72122934], [-1, 0, 0])?.point.x,
      .86942112, .001, 'actual source rotating collar right side');
    near(ray([rotatingArmor], [-3, 1.35, .72122934], [1, 0, 0])?.point.x,
      -.86589843, .001, 'actual source rotating collar left side');
    near(ray([rotatingArmor], [0, 1.35, 3], [0, 0, -1])?.point.z,
      1.59259174, .001, 'actual source rotating collar front');
    near(ray([rotatingArmor], [0, 0, .72122934], [0, 1, 0])?.point.y,
      1.25317538, .00001, 'source chamfered collar bottom');
    for (const [x, y, glassZ, rimY, rimZ] of [[-.54, 2.10, 1.970792, 2.251, 2.1885],
      [.564, 2.57, 1.06488, 2.750, 1.06172821]]) {
      const hit = ray(all, [x, y, 3], [0, 0, -1]);
      assert.equal(hit?.object.name, 'turretGlass', 'actual recessed source glazing is first opaque surface');
      near(hit?.point.z, glassZ, .001, 'source glass depth');
      near(ray(all, [x, rimY, 3], [0, 0, -1])?.point.z, rimZ, .003, 'source forward rim');
      assert.equal(ray(all, [x, y, 3], [0, 0, -1], 3 - glassZ - .015), undefined,
        'sight mouth is actual air in the complete tank, not a painted proxy');
    }
    // Held-out full-source rays correct the former top-center assertion:
    // 1.1166 is the SIDE crest, not the source center at X.564/Y2.75.
    for (const [x, y, z, tolerance] of [[.38, 2.5737, 1.08659494, .001],
      [.425, 2.5737, 1.11243913, .001], [.70, 2.5737, 1.08234677, .001],
      [.735, 2.5737, 1.06231809, .001], [.564, 2.390, 1.05458250, .0001],
      [.564, 2.420, .87513261, .0001], [.564, 2.735, 1.06172821, .0001],
      [.564, 2.760, 1.04251190, .0001]]) {
      near(ray(all, [x, y, 3], [0, 0, -1])?.point.z, z, tolerance,
        'source panoramic rain guard, lower aperture and stepped backing');
    }
    assert.equal(ray(all, [.564, 2.420, 1.10], [0, 0, -1], .20), undefined,
      'real under-glass slot remains open to the recessed source back wall');
    const hull = get('hull');
    for (const z of [-2.50, -.30, 1.40, 2.60]) {
      const top = ray([hull], [.5, 4, z], [0, -1, 0])?.point.y;
      const bottom = ray([hull], [.5, 0, z], [0, 1, 0])?.point.y;
      assert.ok(top > 1.37 && bottom < .42, `closed original hull at Z${z}`);
    }
    const left = get('gearTrackBandL'), right = get('gearTrackBandR');
    near(left.position.x, -1.3158745, 1e-6, 'source left lane');
    near(right.position.x, 1.2727975, 1e-6, 'source right lane');
    assert.ok(Math.abs(left.position.x + right.position.x) > .043,
      'source transverse lane offset is preserved rather than visually recentered');
    checkRearChannels(all);
    checkMovingGear(root, all, gear);
    for (const yaw of [-.7, .65]) {
      turret.rotation.y = yaw;
      gun.rotation.x = -.12;
      root.updateMatrixWorld(true);
      const before = muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.085;
      root.updateMatrixWorld(true);
      near(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())), .085, 1e-6, 'yaw/pitch-owned real recoil');
      recoil.position.z = 0;
    }
  } finally { tank.dispose(); }
}
assert.equal(faceTriangles.get('low'), faceTriangles.get('high') / 2,
  'actual moving LOW steel/groove instances use half the gallery triangles');
console.log('leclercX.selftest: source frame, two actual sight recesses, closed hull, native lane/gun ownership and quality-scaled wheels passed');
