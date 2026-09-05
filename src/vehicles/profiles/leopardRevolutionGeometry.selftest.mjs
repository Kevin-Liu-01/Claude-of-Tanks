import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

// Independent source probes are documented in the owner-source packet. These
// assertions inspect generated vertices, triangles and instance transforms;
// a favorable builder-authored receipt cannot satisfy them.
const tank = createTank('leo2_revolution', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});

const near = (actual, expected, tolerance, label) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual.toFixed(4)} m; source ${expected} ± ${tolerance} m`);
};
const bounds = (object) => new THREE.Box3().setFromObject(object);
const mesh = (name) => {
  const found = tank.root.getObjectByName(name);
  assert.ok(found?.isMesh && found.geometry?.getAttribute('position'), `${name}: actual geometry exists`);
  return found;
};
const worldVertices = (object) => {
  const positions = object.geometry.getAttribute('position');
  return Array.from({ length: positions.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld));
};

try {
  tank.root.updateMatrixWorld(true);
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  assert.ok(hull && turret && gun, 'independent Revolution keeps the canonical three-part rig');
  assert.equal(gun.parent, turret, 'the cannon pitches inside the yawing turret');
  const body = mesh('hull');
  const bodyPoints = worldVertices(body);
  const bowPoints = bodyPoints.filter((point) => Math.abs(point.z - 3.86) < 0.0001);
  assert.ok(bowPoints.length >= 24, 'the measured bow station has a complete solid end cap');
  for (const point of bowPoints) {
    assert.ok(point.y >= 0.980 - 0.0001 && point.y <= 0.996 + 0.0001,
      `the 16 mm bow lip cannot invert below its keel or rise above its roof: y=${point.y}`);
  }
  const bodyIndex = body.geometry.index;
  let bowCapTriangles = 0;
  let rearCapTriangles = 0;
  for (let i = 0; i < (bodyIndex?.count ?? bodyPoints.length); i += 3) {
    const triangle = [0, 1, 2].map((j) => bodyPoints[bodyIndex ? bodyIndex.getX(i + j) : i + j]);
    const bowCap = triangle.every((point) => Math.abs(point.z - 3.86) < 0.0001);
    const rearCap = triangle.every((point) => Math.abs(point.z + 3.66) < 0.0001);
    if (!bowCap && !rearCap) continue;
    const normal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
    assert.ok(bowCap ? normal.z > 0 : normal.z < 0,
      `every ${bowCap ? 'bow' : 'rear'} end-cap triangle faces outward`);
    if (bowCap) bowCapTriangles++;
    else rearCapTriangles++;
  }
  assert.ok(bowCapTriangles >= 6, 'the terminal bow cap remains closed across its entire polygon');
  assert.ok(rearCapTriangles >= 6, 'the concave rear cap remains closed across its entire polygon');
  const bodyRay = (z, up) => new THREE.Raycaster(
    new THREE.Vector3(0, up ? 0 : 3, z), new THREE.Vector3(0, up ? 1 : -1, 0), 0, 4,
  ).intersectObject(body, false)[0]?.point.y ?? NaN;
  let priorRoof = Infinity;
  let priorKeel = -Infinity;
  for (const z of [2.9, 3.2, 3.5, 3.8, 3.855]) {
    const roof = bodyRay(z, false);
    const keel = bodyRay(z, true);
    assert.ok(Number.isFinite(roof) && Number.isFinite(keel) && roof > keel,
      `bow z=${z}: upper and lower glacis enclose a positive solid thickness`);
    assert.ok(roof < priorRoof && keel > priorKeel,
      `bow z=${z}: the roof descends and the keel rises continuously into the thin lip`);
    priorRoof = roof;
    priorKeel = keel;
  }
  // Independent rays into source-authored stand-off air, between its
  // 1.70 m rear hull shoulder and 1.984 m cage, and behind its rear plate.
  // These openings must not become filler plates merely to satisfy a
  // body-continuity raster whose silhouette used to include the cage.
  const visibleMeshes = [];
  tank.root.traverse((object) => {
    if (!object.isMesh || /shadow/i.test(object.name)) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (material?.colorWrite === false) return;
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
    visibleMeshes.push(object);
  });
  for (const [x, z] of [[0.01, -3.77], [-1.80, -1.14], [1.80, -1.14]]) {
    const hits = new THREE.Raycaster(new THREE.Vector3(x, 4.5, z),
      new THREE.Vector3(0, -1, 0), 0, 6).intersectObjects(visibleMeshes, false);
    assert.equal(hits.length, 0, `source stand-off opening at x=${x}, z=${z} remains actual exterior air`);
  }
  const shell = mesh('turret');
  const shellBox = bounds(shell);
  near(shellBox.max.x - shellBox.min.x, 3.232, 0.22, 'closed shell width');
  near(shellBox.max.z - shellBox.min.z, 4.904, 0.30, 'closed shell length');
  near(shellBox.max.y, 2.236, 0.12, 'closed shell roof height');
  near(shellBox.min.z, -2.808, 0.20, 'bustle rear station');
  near(shellBox.max.z, 2.096, 0.18, 'cheek front station');

  const shellRay = (x, z, up = false) => new THREE.Raycaster(
    new THREE.Vector3(x, up ? 0 : 4, z),
    new THREE.Vector3(0, up ? 1 : -1, 0),
    0, 5,
  ).intersectObject(shell, false)[0]?.point.y ?? NaN;
  const sourceSections = [
    [-2.3, 2.190, 1.680], [-1.6, 2.236, 1.680], [-0.6, 2.236, 1.608],
    [0.2, 2.229, 1.537], [0.9, 2.170, 1.537], [1.6, 2.082, 1.617],
    [1.9, 2.042, 1.675],
  ];
  // The owner's large EMES window is recessed nearly a metre, not a dark
  // sticker. Rays through its mouth must hit the rear bulkhead; the floor
  // and outer reveal still close the structural armor around that void.
  const pocketBack = new THREE.Raycaster(new THREE.Vector3(0.65, 1.95, 3),
    new THREE.Vector3(0, 0, -1), 0, 3).intersectObject(shell, false)[0];
  assert.ok(pocketBack, 'EMES pocket has a solid rear bulkhead');
  near(pocketBack.point.z, 1.10, 0.025, 'EMES negative-space depth');
  near(shellRay(0.65, 1.75), 1.71, 0.03, 'EMES low floor instead of filled cheek');
  const pocketWall = new THREE.Raycaster(new THREE.Vector3(0.65, 1.95, 1.75),
    new THREE.Vector3(1, 0, 0), 0, 1).intersectObject(shell, false)[0];
  assert.ok(pocketWall && pocketWall.point.x > 0.92 && pocketWall.point.x < 0.98,
    'EMES opening is enclosed by its full-height outer armor reveal');
  for (const x of [-0.95, 0.95]) {
    for (const [z, roof, chin] of sourceSections) {
      near(shellRay(x, z), roof, 0.065, `closed roof at x=${x}, z=${z}`);
      near(shellRay(x, z, true), chin, 0.065, `closed chin at x=${x}, z=${z}`);
    }
    assert.ok(shellRay(x, 0.2) - shellRay(x, 1.9) >= 0.12,
      `x=${x}: the forward roof descends into its cheek instead of forming a slab`);
    for (const z of [-1.6, -0.6, 0.2, 0.9, 1.6]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(x < 0 ? -4 : 4, 1.85, z),
        new THREE.Vector3(x < 0 ? 1 : -1, 0, 0), 0, 5).intersectObject(shell, false)[0];
      assert.ok(hit && Math.abs(hit.point.x) >= 1.25 && Math.abs(hit.point.x) <= 1.72,
        `closed outer turret wall at x-side=${Math.sign(x)}, z=${z}`);
    }
  }

  const barrel = mesh('gun');
  const gunBox = bounds(barrel);
  near(gunBox.max.z, 6.11, 0.18, 'physical muzzle station');
  const tip = worldVertices(barrel).filter((point) => point.z >= gunBox.max.z - 0.045);
  assert.ok(tip.length >= 12, 'the physical tube ends in a circular multi-vertex section');
  const tipBox = new THREE.Box3().setFromPoints(tip);
  const tipCenter = tipBox.getCenter(new THREE.Vector3());
  near(tipCenter.x, 0.0119, 0.045, 'physical bore lateral center');
  near(tipCenter.y, 1.8493, 0.10, 'physical bore height');
  near(tipBox.max.x - tipBox.min.x, 0.1656, 0.035, 'physical muzzle diameter');

  // Roof stations must exist in the turret subtree, so hull-parented or
  // absent equipment cannot be disguised by a high attachment count.
  const equipmentPoints = [];
  turret.traverse((object) => {
    if (!object.isMesh || !object.geometry || object === shell || /shadow/i.test(object.name)) return;
    for (let owner = object; owner; owner = owner.parent) if (owner === gun) return;
    equipmentPoints.push(...worldVertices(object));
  });
  for (const station of [
    { name: 'panoramic sight', x: [-0.52, -0.04], z: [-1.16, -0.61], low: 2.31, high: 2.63 },
    { name: 'remote weapon pedestal', x: [0.66, 1.08], z: [-1.85, -1.30], low: 2.30, high: 2.78 },
  ]) {
    const points = equipmentPoints.filter((point) => point.x >= station.x[0] && point.x <= station.x[1]
      && point.z >= station.z[0] && point.z <= station.z[1] && point.y >= 2.20);
    assert.ok(points.length >= 24, `${station.name}: visible three-dimensional hardware exists`);
    const box = new THREE.Box3().setFromPoints(points);
    assert.ok(box.min.y <= station.low && box.max.y >= station.high - 0.08,
      `${station.name}: hardware connects to the low roof and reaches the source elevation`);
  }
  // These are two different source hardpoints: one on the front-right roof,
  // one near the left rear. Two short rear-corner whips are not equivalent.
  for (const station of [
    { name:'front-right radio mast', x:1.0493, z:0.8470, top:3.9612 },
    { name:'rear-left radio mast', x:-0.8420, z:-2.0733, top:4.0258 },
  ]) {
    const tips = equipmentPoints.filter((point) => point.y >= 3.65
      && Math.abs(point.x - station.x) <= 0.15 && Math.abs(point.z - station.z) <= 0.18);
    assert.ok(tips.length >= 8, `${station.name}: physical turret-owned high mast occupies its source station`);
    near(Math.max(...tips.map((point) => point.y)), station.top, 0.10, `${station.name}: source terminal elevation`);
  }

  const wheels = mesh('gearRoadWheelTires');
  assert.equal(wheels.isInstancedMesh, true, 'road wheels use native animated instances');
  assert.equal(wheels.count, 14, 'exactly seven road wheels per side');
  const matrix = new THREE.Matrix4();
  const wheelCenters = [];
  for (let index = 0; index < wheels.count; index++) {
    wheels.getMatrixAt(index, matrix);
    wheelCenters.push(new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(wheels.matrixWorld));
  }
  const stations = [...new Set(wheelCenters.map((point) => Number(point.z.toFixed(4))))].sort((a, b) => b - a);
  assert.equal(stations.length, 7, 'paired wheel instances share seven longitudinal stations');
  const sourceStations = [2.386, 1.588, 0.828, 0.092, -0.663, -1.471, -2.211];
  stations.forEach((z, index) => near(z, sourceStations[index], 0.14, `road-wheel station ${index + 1}`));
  const bands = [];
  hull.traverse((object) => {
    if (object.userData?.appearanceRole === 'trackBand') bands.push(object);
  });
  assert.equal(bands.length, 2, 'one native track band per side');
  // The source track mesh is 1.187 m high and coincides with the sprocket's
  // outer teeth. Native animated gear needs a real wrap/metal allowance:
  // its belt rides 45 mm beyond the endpoint radius, and visible shoes sit
  // beyond the belt. Preserve source wheel stations without reproducing
  // source wheel/link intersections or widening the established view gate.
  for (const band of bands) {
    const box = bounds(band);
    near(box.max.z - box.min.z, 6.692, 0.40, `${band.name}: source course length`);
    near(box.max.y - box.min.y, 1.187, 0.12, `${band.name}: source course height`);
    const points = worldVertices(band);
    const lowerRun = points.filter((point) => point.y <= box.min.y + 0.01);
    const contact = new THREE.Box3().setFromPoints(lowerRun);
    assert.ok(contact.min.z <= sourceStations.at(-1) && contact.max.z >= sourceStations[0],
      `${band.name}: the loaded lower run supports all seven road-wheel stations`);
  }
  const shoes = mesh('gearTrackPads');
  assert.ok(shoes.isInstancedMesh && shoes.count >= 160,
    'the single native course carries moving linked shoes on both sides');
  assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'), undefined,
    'no second static connector course duplicates the smart track');

  const muzzle = tank.root.getObjectByName('rig_muzzle');
  assert.ok(muzzle, 'the physical cannon has a native muzzle anchor');
  const pivot = turret.getWorldPosition(new THREE.Vector3());
  const before = muzzle.getWorldPosition(new THREE.Vector3()).sub(pivot);
  turret.rotation.y = Math.PI / 2;
  tank.root.updateMatrixWorld(true);
  const after = muzzle.getWorldPosition(new THREE.Vector3()).sub(pivot);
  near(after.x, before.z, 0.001, 'muzzle follows the turret through 90-degree yaw');
  near(after.z, -before.x, 0.001, 'muzzle remains rigidly attached through yaw');
} finally {
  tank.dispose();
}

console.log('leopardRevolutionGeometry.selftest: source shell sections, roof hardware, gun, and native running gear pass');
