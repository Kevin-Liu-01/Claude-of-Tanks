import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';

const near = (got, target, tolerance, label) => assert.ok(Number.isFinite(got)
  && Math.abs(got - target) <= tolerance, `${label}: ${got}; source ${target} ± ${tolerance}`);
const ray = (meshes, origin, direction, far = 15) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];

function checkSourceFurniture(meshes, point = xyz => new THREE.Vector3(...xyz),
  direction = xyz => new THREE.Vector3(...xyz)) {
  const probe = (origin, dir, far = 15) => new THREE.Raycaster(point(origin),
    direction(dir), 0, far).intersectObjects(meshes, false)[0];
  // Independent antenna_02 cuts: distinct source stations and whip lengths,
  // not the old mirrored pair with a shared maximum-height target.
  for (const [x, z, top] of [[-1.25055, .673825, 4.102651],
    [1.01390, .747445, 4.249091]]) {
    const hit = probe([x, 5, z], [0, -1, 0]);
    assert.ok(hit, 'source antenna is present');
    near(hit.point.distanceTo(point([x, top, z])), 0, .0001,
      'source-specific antenna station and crown after yaw');
  }
  for (const x of [-1.21, .976]) assert.equal(
    probe([x, 4.4, .71064], [0, -1, 0], 1), undefined,
    'former invented antenna station remains empty');
  // Source closed body, oblique case lid and asymmetric housing bevels.
  for (const [x, z, y, tolerance] of [[0, -2.1, 2.31247706, .0001],
    [1.5, -.9, 2.35692482, .0001], [1.5, 0, 2.43372635, .0001],
    [1.8, 0, 2.37359240, .0001], [-1.3, 0, 2.36258344, .0006],
    [-1.3, -1.3, 1.942620, .0006]]) {
    const hit = probe([x, 5, z], [0, -1, 0]);
    assert.ok(hit, 'source equipment surface remains present');
    near(hit.point.distanceTo(point([x, y, z])), 0, tolerance,
      'source equipment crown or open-carrier floor');
  }
  assert.equal(probe([-1.3, 2.30, -1.3], [0, -1, 0], .33), undefined,
    'left carrier has real air instead of a full-width rear bounding box');
}

function checkSourceScreens(meshes) {
  for (const side of [-1, 1]) {
    for (const [z, y] of [[-3.1, 1.11348320], [-2.4, .81438170],
      [0, .60789876], [2.8, .60806917], [3.3, .83189621]]) {
      near(ray(meshes, [side * 1.7445, 0, z], [0, 1, 0])?.point.y,
        y, .0002, 'source screen lower edge, including both raised end reliefs');
    }
    for (const z of [-2.8, 3.3]) assert.equal(
      ray(meshes, [side * 3, .80, z], [-side, 0, 0], 1.27), undefined,
      'real end-wheel air is not filled by a low rectangular screen');
    for (const z of [.1605, 2.1524]) assert.equal(
      ray(meshes, [side * 3, 1.0, z], [-side, 0, 0], 1.27), undefined,
      'source gap between independent screen sheets stays physically open');
    for (const [y, z] of [[1.187771, -3.106199], [1.207739, 3.496080],
      [.687819, 2.576110]]) {
      const clip = ray(meshes, [side * 3, y, z], [-side, 0, 0]);
      near(clip?.point.x, side * 1.772947, .00001, 'source raised clip outer face');
      assert.ok(clip?.object.name === 'hullDetail', 'raised clip remains equipment, not enlarged armor');
    }
    near(ray(meshes, [side * 3, 1, -2.8], [-side, 0, 0])?.point.x,
      side * 1.752016, .00001, 'source screen is narrower than its raised clips');
    assert.equal(ray(meshes, [side * 1.79, .90, 0], [-side, 0, 0], .025), undefined,
      'clip envelope does not blanket-widen the lower structural screen');
  }
}

function checkSourceFenders(meshes) {
  const detail = meshes.filter(m => m.name === 'hullDetail');
  const hull = meshes.filter(m => m.name === 'hull');
  for (const side of [-1, 1]) {
    // Held-out ex_decor_01 cuts, distinct from the authored section rows.
    // The warped skin is approximated by thin joined facets, never a box.
    for (const [x, z, y] of [[1.25, 3.28, 1.34074751], [1.4, 3.57, 1.32434161],
      [1.4, 3.62, 1.31396557], [1.55, 3.70, 1.28953183], [1.0, 3.4, 1.27267139]]) {
      const hit = ray(detail, [side * x, 2, z], [0, -1, 0]);
      near(hit?.point.y, y, .0005, 'source folded guard crown');
      assert.ok(hit?.face.normal.y > 0, 'both real guard skins have outward upper winding');
    }
    const underside = ray(detail, [side, 1, 3.4], [0, 1, 0]);
    near(underside?.point.y, 1.24159156, .001, 'source steep inner return retains its lower face');
    assert.ok(underside?.face.normal.y < 0, 'inner fold underside faces the real air');
    for (const [z, y, span] of [[3.60, 1.27, .030], [3.70, 1.22, .040]]) {
      assert.equal(ray(meshes, [side * 1.4, y, z], [0, 1, 0], span), undefined,
        'source idler-to-guard gap contains actual air, not a low filled carrier');
    }
    const foot = ray(detail, [side * 1.25, 0, 3.23], [0, 1, 0])?.point.y;
    const roof = ray(hull, [side * 1.25, 3, 3.23], [0, -1, 0])?.point.y;
    assert.ok(roof - foot > .006 && roof - foot < .008,
      'thin guard root has positive overlap with its real supporting deck');
  }
}

function shoeFloor(meshes) {
  const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  let floor = Infinity;
  for (const mesh of meshes) {
    const positions = mesh.geometry.attributes.position;
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix);
      matrix.premultiply(mesh.matrixWorld);
      for (let i = 0; i < positions.count; i++) floor = Math.min(floor,
        vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix).y);
    }
  }
  return floor;
}

function checkMeasuredCourse(root, meshes, gear) {
  const shoes = meshes.filter(m => m.userData.trackRigidLinkChords);
  assert.equal(shoes.length, 2, 'one detailed and one distance LOD on the same two native courses');
  const geometry = shoes[0].geometry;
  geometry.computeBoundingBox();
  near(geometry.boundingBox.max.y, .01685, .000001, 'source outer pad/grouser depth');
  near(geometry.boundingBox.min.y, -.135441, .000001, 'source inner guide depth');
  const layout = structuredClone(gear.roadWheelLayout);
  assert.deepEqual(layout.wheelZs,
    [-2.174642, -1.254642, -.289679, .630321, 1.700374, 2.620374],
    'source six road-wheel axles do not move to clear the belt');
  near(layout.wheelY, .474396, .000001, 'source road axle height');
  const pitch = shoes[0].userData.trackShoePitchM;
  for (let phase = 0; phase < 48; phase++) {
    gear.update(pitch * phase / 48, -pitch * phase / 48, 0);
    root.updateMatrixWorld(true);
    near(shoeFloor(shoes), 0, .0001, 'actual source ground contact in every opposed scroll phase');
    assert.deepEqual(gear.roadWheelLayout, layout, 'shoe articulation never moves the fixed source axles');
  }
  gear.update(0, 0, 0);
  root.updateMatrixWorld(true);
}

function measuredTank(quality) {
  let gear;
  const build = KIT.buildRunningGear;
  KIT.buildRunningGear = (...args) => { gear = build(...args); return gear; };
  try {
    return { tank: createTank('chieftain_mk10_x', null, { proceduralOnly: true,
      geometryReceipt: true, quality, batchStatic: false }), gear };
  } finally { KIT.buildRunningGear = build; }
}

// Fixed canonical-source scalars, not imports from the authored dimensions or
// generated receipts. Source units are the independently qualified .025 m
// anchor; flattened glTF origins are explicitly not mechanical datums.
for (const quality of ['high', 'low']) {
  const { tank, gear } = measuredTank(quality);
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const get = name => {
      const part = root.getObjectByName(name);
      assert.ok(part, `${quality}: actual ${name} exists`);
      return part;
    };
    const hull = get('hull'), turret = get('turret');
    const yaw = get('rig_turret'), pitch = get('rig_gun'), recoil = get('rig_recoil');
    const muzzle = get('rig_muzzle');
    const point = pitch.getWorldPosition(new THREE.Vector3());
    near(point.x, .000026, 1e-6, 'actual straight bore X');
    near(point.y, 1.912199, 1e-6, 'actual straight bore Y');
    near(point.z, 1.550505, 1e-6, 'explicit inferred barrel-root pitch station');
    near(muzzle.getWorldPosition(new THREE.Vector3()).z, 7.093385, 1e-6, 'source muzzle');
    assert.equal(get('gunMount').parent, pitch, 'actual mantlet pitches');
    assert.equal(get('gun').parent, recoil, 'barrel and muzzle fixture recoil');
    const gun = get('gun'), mount = get('gunMount');
    // Held-out scalar sections of source turret_barrel_0. These reject the
    // old misplaced 165 mm-radius evacuator without importing its geometry.
    for (const [z, top, tolerance] of [[2.40, 2.05118599, .0005],
      [3.50, 2.02574763, .0002], [4.50, 2.01988026, .0002],
      [4.90, 2.05190349, .0002], [5.20, 2.03788376, .0002],
      [6.50, 2.00645974, .0004]]) {
      near(ray([gun], [.000026, 4, z], [0, -1, 0])?.point.y, top, tolerance,
        `source stepped barrel crown at ${z}`);
    }
    near(ray([gun], [0, 1.95, 0], [0, 0, 1])?.point.z, .59735476, .00001,
      'true rearward breech pocket reaches its source front web');
    assert.equal(ray([gun], [0, 1.95, .36], [0, 0, 1], .23), undefined,
      'breech pocket is open air, not a dark filled block');
    near(ray([gun], [-.15, 1.95, 0], [0, 0, 1])?.point.z, .36727483, .00001,
      'breech pocket retains its real raised side wall');
    near(ray([gun], [0, 2.1, .55], [0, -1, 0])?.point.y, 1.83486999, .00001,
      'breech pocket source floor');
    near(ray([mount], [-.26, 1.2, 2], [0, 0, -1])?.point.z, 1.19109304, .0002,
      'thin inclined lower lever remains at its physical source station');
    assert.equal(ray([mount], [1, 1.2, 1.25], [-1, 0, 0]), undefined,
      'adjacent lower-control air is not a vertical bbox pedestal');
    near(ray([turret], [0, 5, 0], [0, -1, 0])?.point.y, 2.397277, .00001,
      'source cast central roof');
    near(ray([hull], [0, 4, 3.0], [0, -1, 0])?.point.y, 1.41154, .004,
      'independent source forward-deck witness');
    near(ray([hull], [0, 0, 0], [0, 1, 0])?.point.y, .52436, .0001,
      'closed floor agrees with independent source belly plane');
    const all = [];
    root.traverse(o => { if (o.isMesh && !o.name.startsWith('procShadow_') && !o.userData.vehicleMarking) all.push(o); });
    checkSourceScreens(all);
    checkSourceFenders(all);
    checkMeasuredCourse(root, all, gear);
    const detail = get('turretDetail');
    let owner = detail.parent;
    while (owner && owner !== yaw) owner = owner.parent;
    assert.ok(owner === yaw, 'source stowage and antenna supports are permanent turret equipment');
    checkSourceFurniture(all);
    for (const [x, z, supportBottom] of [[-1.25055, .673825, 1.8825],
      [.87, .747445, 2.197228]]) {
      near(ray([detail], [x, 0, z], [0, 1, 0])?.point.y, supportBottom, .00002,
        'real source-sized antenna support root');
      assert.ok(ray([turret], [x, 5, z], [0, -1, 0])?.point.y > supportBottom + .01,
        'antenna support root positively intersects permanent cast armor');
    }
    assert.equal(ray(all, [0, 2.1, 3], [0, 0, -1], 1.18), undefined,
      'source forward gun mouth is actual air above the tube, not a dark cover');
    near(ray([turret], [0, 2.1, 3], [0, 0, -1])?.point.z, 1.7961458, .00001,
      'real source rear wall of the gun-mouth recess');
    const bandL = get('gearTrackBandL'), bandR = get('gearTrackBandR');
    near(bandL.position.x, -1.36021, 1e-6, 'source left track lane');
    near(bandR.position.x, 1.36021, 1e-6, 'source right track lane');
    for (const end of all.filter(m => m.name === 'gearEndWheelBody')) {
      const drive = end.position.z < 0;
      near(end.position.y, drive ? .850819 : .922103, 1e-6, 'source end axle Y');
      near(end.position.z, drive ? -3.014356 : 3.417292, 1e-6, 'source end axle Z');
    }
    for (const mesh of all) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), 'finite authored surface');
    }
    const census = all.map(m => [m, m.geometry.attributes.position.count]);
    const neutralInverse = yaw.matrixWorld.clone().invert();
    for (const turn of [-.65, .70]) {
      yaw.rotation.y = turn;
      pitch.rotation.x = -.15;
      root.updateMatrixWorld(true);
      const before = muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.10;
      root.updateMatrixWorld(true);
      near(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())), .10, 1e-6,
        'yaw/pitch-owned physical recoil');
      recoil.position.z = 0;
      const transform = yaw.matrixWorld.clone().multiply(neutralInverse);
      checkSourceFurniture(all, xyz => new THREE.Vector3(...xyz).applyMatrix4(transform),
        xyz => new THREE.Vector3(...xyz).transformDirection(transform));
      for (const [mesh, count] of census) assert.equal(mesh.geometry.attributes.position.count, count,
        'articulation retains all authored solids');
    }
  } finally { tank.dispose(); }
}
console.log('chieftain10X.selftest: high/low source datums, gun/guard/carrier air, supported equipment, four screens, 48-phase ground and articulation passed');
