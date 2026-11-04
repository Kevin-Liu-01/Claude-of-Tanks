// Release 269: the K30 Biho (profiles/k30Biho.ts on the K200 family's hull, profiles/k200Hull.ts) holds its combat
// datums to its geometry and its guns, turret and radar clear of each other and of its hull.
//  - the K200-family layout (k200HullLayout.ts): the K200A1 at its published 5.49 m on five stations, the K30's stretch one
//    0.94 m bay and one station more; the stations ordered between the front sprocket and the rear idler;
//  - the ring and the trunnion stand at the layout's datums (k30BihoLayout.ts), which the spec reads, and the spec's hull
//    frame is the K200 hull's (its plates, modules and driver) after the registration hook;
//  - both fire axes (spec.gun.muzzles) end on drawn barrel stock at the muzzle plane, each on its own side's recoil group;
//  - the build's envelope is the spec's dims (3 %);
//  - from full depression to full elevation every gun part keeps 2 cm from the turret's own stock (the trunnion shafts and
//    caps, bodies of revolution about the pitch axis, excepted), and 2.5 cm from the hull at every 5 degrees of yaw and
//    pitch (gunHullClearance.test-support.mjs); the turret's own parts (bodies, basket, radar) keep 2.5 cm from the hull's
//    roof stock at every 5 degrees of yaw; a whip on each rear corner about twice the turret's height, outside the envelope.
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import '../fleetRegistration.ts';
import { synchronizeK30BihoFrame } from '../k30BihoSpecs.ts';
import { GUN_HULL_KEEP_M, SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder } from '../gunHullClearance.test-support.mjs';
import { K30_HULL, k200Driver, k200HullLayout, k200HullPlates } from './k200HullLayout.ts';
import { K30_GUN_PIVOT, K30_GUNS, K30_TURRET, K30_TURRET_PIVOT } from './k30BihoLayout.ts';

const DEG = Math.PI / 180;
const id = 'k30_biho';
const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);

// ---- the K200 family's layout
{
  const k200 = k200HullLayout(5), k30 = K30_HULL;
  near(k200.lengthM, 5.49, 1e-9, 'K200A1: the published length');
  assert.equal(k200.gear.wheelZs.length, 5, 'K200A1: five road wheels a side');
  assert.equal(k30.gear.wheelZs.length, 6, 'K30: one station more');
  near(k30.lengthM - k200.lengthM, 0.94, 1e-9, 'K30: one 0.94 m bay longer');
  for (const L of [k200, k30]) {
    const z = L.gear.wheelZs;
    for (let i = 1; i < z.length; i++) assert.ok(z[i] < z[i - 1] - 0.6, `${L.roadWheels} stations: road wheels ordered, 0.6 m apart`);
    assert.ok(L.gear.sprocket.z > z[0] + 0.5 && L.gear.sprocket.z < L.bowZ, `${L.roadWheels} stations: the sprocket at the front`);
    assert.ok(L.gear.idler.z < z.at(-1) - 0.5 && L.gear.idler.z > L.rearZ, `${L.roadWheels} stations: the idler at the rear`);
    near(L.bowZ + L.rearZ, 0, 1e-9, `${L.roadWheels} stations: the hull centred`);
  }
  // the bow stays the K200A1's: the stretch moves only what lies behind its bay
  near(k30.bowZ - k30.gear.sprocket.z, k200.bowZ - k200.gear.sprocket.z, 1e-6, 'the bow is the K200A1\'s');
  near(k30.gear.idler.z - k30.rearZ, k200.gear.idler.z - k200.rearZ, 1e-6, 'the stern is the K200A1\'s');
}

// ---- datums, the hull frame, bores, envelope, the guns against the turret
const spec = getSpec(id);
synchronizeK30BihoFrame();
assert.deepEqual(spec.armor.turretPivot, [...K30_TURRET_PIVOT], 'spec ring datum');
assert.deepEqual(spec.armor.gunPivot, [...K30_GUN_PIVOT], 'spec trunnion datum');
assert.deepEqual(spec.armor.hullPlates.map((p) => p.name), k200HullPlates(K30_HULL).map((p) => p.name), 'the hull plates are the K200 hull\'s');
{
  const driver = spec.armor.crew.find((c) => c.crew === 'driver'), own = k200Driver(K30_HULL);
  assert.deepEqual([driver.min, driver.max, driver.turretLocal], [own.min, own.max, own.turretLocal], 'the driver is the K200 hull\'s');
}
assert.deepEqual(spec.armor.crew.map((c) => c.crew).sort(), ['commander', 'driver', 'gunner', 'radioOperator'], 'crew 4');
near(spec.visual.trackWidthM, K30_HULL.gear.trackW, 1e-9, 'the track width is the K200 hull\'s');
near(spec.armor.gunBarrel.lengthM, K30_GUNS.muzzleZ, 1e-9, 'the barrel datum is the muzzle plane');
assert.deepEqual(spec.gun.muzzles, [{ x: -K30_GUNS.gunX, y: 0 }, { x: K30_GUNS.gunX, y: 0 }], 'twin fire axes on the bores');

const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
try {
  const root = tank.root;
  const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
  root.updateMatrixWorld(true);
  assert.deepEqual(turret.position.toArray().map((v) => +v.toFixed(4)), [...K30_TURRET_PIVOT], 'ring at the layout\'s pivot');
  assert.deepEqual(gun.position.toArray().map((v) => +v.toFixed(4)), [...K30_GUN_PIVOT], 'trunnion at the layout\'s pivot');
  // each bore ends on its muzzle brake's face at the muzzle plane, each fire axis on its own side's recoil group
  spec.gun.muzzles.forEach((m, index) => {
    const origin = gun.localToWorld(new THREE.Vector3(m.x + (K30_GUNS.barrelR + K30_GUNS.brakeR) / 2, m.y, K30_GUNS.muzzleZ + 0.3));
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
    const hit = new THREE.Raycaster(origin, dir, 0, 0.6).intersectObjects(meshesUnder(gun), false)[0];
    assert.ok(hit, `bore ${index} is drawn`);
    near(gun.worldToLocal(hit.point.clone()).z, K30_GUNS.muzzleZ, 0.02, `bore ${index} ends on the muzzle plane`);
    const group = root.getObjectByName(`rig_barrel_${index}`);
    assert.ok(group && group.children.some((c) => c.isMesh || c.children.length), `fire axis ${index} owns its recoil group`);
    const groupX = gun.worldToLocal(new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3())).x;
    assert.ok(Math.sign(groupX) === Math.sign(m.x), `recoil group ${index} carries its own side's barrel`);
  });
  // envelope (the whips, an antenna envelope over the published height, measured on their own)
  const whips = [];
  root.traverse((node) => { if (node.name === 'fitting_antennaWhip') whips.push(node); });
  assert.equal(whips.length, 2, 'a whip at each rear corner');
  const whipTop = Math.max(...whips.map((w) => new THREE.Box3().setFromObject(w).max.y));
  near(whipTop - (K30_TURRET_PIVOT[1] + K30_TURRET.rear.roofY), 2 * K30_TURRET.rear.roofY, 0.25, 'the whips about twice the turret\'s height');
  const bounds = new THREE.Box3();
  for (const mesh of meshesUnder(root, whips)) { if (!mesh.userData.shadowOnly) bounds.union(new THREE.Box3().setFromObject(mesh)); }
  const size = bounds.getSize(new THREE.Vector3());
  near(size.x, spec.dims.widthM, spec.dims.widthM * 0.03, 'width');
  near(size.y, spec.dims.heightM, spec.dims.heightM * 0.03, 'height');
  near(size.z, spec.dims.overallLengthM, spec.dims.overallLengthM * 0.03, 'length');
  // the guns' sweep against the turret's own stock, from full depression to full elevation
  const gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
  const gunPts = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
  const grid = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, { cell: 0.05, rq: 0.06 });
  const pose = new THREE.Matrix4(), v = new THREE.Vector3();
  let worst = { d: Infinity };
  for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg += 2.5) {
    pose.compose(gun.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(-deg * DEG, 0, 0)), new THREE.Vector3(1, 1, 1));
    for (let i = 0; i < gunPts.length; i += 3) {
      // the trunnion shafts and caps turn in their bosses: rotation-invariant about the pitch axis
      if (Math.hypot(gunPts[i + 1], gunPts[i + 2]) < 0.105) continue;
      v.set(gunPts[i], gunPts[i + 1], gunPts[i + 2]).applyMatrix4(pose);
      const d = grid.distance(v.x, v.y, v.z);
      if (d < worst.d) worst = { d, deg, at: [gunPts[i], gunPts[i + 1], gunPts[i + 2]].map((n) => +n.toFixed(3)) };
    }
  }
  assert.ok(worst.d >= 0.02, `the guns keep 2 cm from the turret at every pitch (worst ${worst.d.toFixed(3)} m at ${worst.deg} deg, gun point ${worst.at})`);
  // the turret's own parts against the hull's stock at every yaw (the race collar's foot, seated in the deck, excepted):
  // the bodies stand 4 cm over the roof along the turret's length
  const hull = turret.parent, hInv = new THREE.Matrix4().copy(hull.matrixWorld).invert();
  const hullGrid = new SurfaceGrid(meshTriangles(meshesUnder(hull, [turret]).filter((m) => !/Track|Wheel|Gear/i.test(m.name)), hInv).tri,
    { cell: 0.05, rq: 0.08 });
  const turretPts = densePoints(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, 0.03);
  let low = { d: Infinity };
  for (let yd = 0; yd < 360; yd += 5) {
    const c = Math.cos(yd * DEG), s = Math.sin(yd * DEG);
    for (let i = 0; i < turretPts.length; i += 3) {
      const x = turretPts[i], y = turretPts[i + 1], z = turretPts[i + 2];
      if (y < 0.03) continue;
      const d = hullGrid.distance(turret.position.x + c * x + s * z, turret.position.y + y, turret.position.z - s * x + c * z);
      if (d < low.d) low = { d, yaw: yd, at: [x, y, z].map((n) => +n.toFixed(3)) };
    }
  }
  assert.ok(low.d >= GUN_HULL_KEEP_M, `the turret keeps ${GUN_HULL_KEEP_M} m from the hull at every yaw (worst ${low.d.toFixed(3)} at yaw ${low.yaw}, turret point ${low.at})`);
  console.log(`${id}: datums, 2 bores, envelope ${size.toArray().map((n) => n.toFixed(2)).join(' x ')} m, gun-turret clearance ${worst.d.toFixed(3)} m, turret-hull clearance ${low.d.toFixed(3)} m`);
} finally { tank.dispose?.(); }

// ---- the guns against the hull at every 5 degrees of yaw and pitch from full depression to full elevation
const probe = gunHullProbe(id, { suit: false });
try {
  let worst = { d: Infinity };
  const pitches = [-probe.depression];
  for (let deg = Math.ceil(-probe.depression / DEG / 5) * 5; deg < probe.elevation / DEG; deg += 5) if (deg * DEG > -probe.depression) pitches.push(deg * DEG);
  pitches.push(probe.elevation);
  for (let yd = 0; yd <= 180; yd += 5) for (const sign of yd % 180 ? [-1, 1] : [1]) {
    for (const pitch of pitches) {
      const d = probe.distance(sign * yd * DEG, pitch, 0);
      if (d < worst.d) worst = { d, yaw: sign * yd, pitch: +(pitch / DEG).toFixed(1), part: probe.part };
    }
  }
  assert.ok(worst.d >= GUN_HULL_KEEP_M, `the guns keep ${GUN_HULL_KEEP_M} m from the hull (worst ${worst.d.toFixed(3)} at yaw ${worst.yaw}, pitch ${worst.pitch}, ${worst.part})`);
  console.log(`${id}: hull clearance ${worst.d.toFixed(3)} m over yaw 0-180 and pitch ${(-probe.depression / DEG).toFixed(0)} to ${(probe.elevation / DEG).toFixed(0)} deg (worst at yaw ${worst.yaw}, pitch ${worst.pitch})`);
} finally { probe.dispose(); }
console.log('k30Biho.selftest: OK');
