// Release 268: the PLA twin-cannon air defence (profiles/chineseAirDefense.ts on plaAirDefenseChassis.ts) holds its
// combat datums to its geometry and its guns clear of its own turret and hull.
//  - the turret ring and the trunnion stand at the layout's datums (chineseAirDefenseLayout.ts), which the spec reads;
//  - every fire axis (spec.gun.muzzles) ends on drawn barrel stock at the muzzle plane, on its own recoil group; the
//    PGZ-95's lower bores ride the same groups and end on that plane too;
//  - every QW-2 launch exit (spec.gun.launcherMuzzles, gun frame) is the front of a drawn cap disc, and the turret
//    publishes the four-tube census the spec declares;
//  - the build's envelope is the spec's dims (3 %);
//  - from full depression to full elevation every gun part keeps 2 cm from its turret's own stock (the trunnion shafts,
//    bodies of revolution about the pitch axis, excepted), and 2.5 cm from the hull at every 5 degrees of yaw and pitch
//    (gunHullClearance.test-support.mjs, the measure tools/gun-depression-sweep.mjs scans per degree).
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { GUN_HULL_KEEP_M, SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder } from '../gunHullClearance.test-support.mjs';
import { PGZ09_GUNS, PGZ09_LAYOUT, PGZ95_GUNS, PGZ95_LAUNCHER_MUZZLES, PGZ95_LAYOUT } from './chineseAirDefenseLayout.ts';

const DEG = Math.PI / 180;
const build = (id) => createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);

/** The first surface hit along a ray in `frame`'s coordinates, restricted to meshes under `root`. */
function firstHit(root, frame, start, direction, far = 1) {
  root.updateMatrixWorld(true);
  const origin = frame.localToWorld(new THREE.Vector3(...start));
  const dir = new THREE.Vector3(...direction).transformDirection(frame.matrixWorld);
  const ray = new THREE.Raycaster(origin, dir, 0, far);
  const hit = ray.intersectObjects(meshesUnder(root), false)[0];
  return hit ? { point: frame.worldToLocal(hit.point.clone()), object: hit.object } : null;
}

const ROWS = [
  { id: 'pgz95', L: PGZ95_LAYOUT, muzzleZ: PGZ95_GUNS.muzzleZ, faceR: PGZ95_GUNS.brakeR, bores: [-1, 1].flatMap((s) => PGZ95_GUNS.boreY.map((y) => [s * PGZ95_GUNS.podX, y])),
    tubes: PGZ95_LAUNCHER_MUZZLES },
  { id: 'pgz09', L: PGZ09_LAYOUT, muzzleZ: PGZ09_GUNS.muzzleZ, faceR: PGZ09_GUNS.brakeR, bores: [-1, 1].map((s) => [s * PGZ09_GUNS.gunX, 0]), tubes: [] },
];

for (const { id, L, muzzleZ, faceR, bores, tubes } of ROWS) {
  const spec = getSpec(id);
  const tank = build(id);
  try {
    const root = tank.root;
    const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
    root.updateMatrixWorld(true);
    // datums
    assert.deepEqual(turret.position.toArray().map((v) => +v.toFixed(4)), [...L.turretPivot], `${id}: ring at the layout's pivot`);
    assert.deepEqual(gun.position.toArray().map((v) => +v.toFixed(4)), [...L.gunPivot], `${id}: trunnion at the layout's pivot`);
    assert.deepEqual(spec.armor.turretPivot, [...L.turretPivot], `${id}: spec ring datum`);
    assert.deepEqual(spec.armor.gunPivot, [...L.gunPivot], `${id}: spec trunnion datum`);
    assert.equal(spec.gun.muzzles.length, 2, `${id}: twin fire axes`);
    near(spec.armor.gunBarrel.lengthM, muzzleZ, 1e-9, `${id}: the barrel datum is the muzzle plane`);
    // every bore ends on drawn stock at the muzzle plane, every fire axis on its own recoil group
    for (const [x, y] of bores) {
      // on the muzzle device's face, clear of the bore the factory seats on a fire axis
      const hit = firstHit(gun, gun, [x + faceR * 0.65, y, muzzleZ + 0.3], [0, 0, -1], 0.6);
      assert.ok(hit, `${id}: a bore at (${x}, ${y}) is drawn`);
      near(hit.point.z, muzzleZ, 0.02, `${id}: the bore at (${x}, ${y}) ends on the muzzle plane`);
    }
    spec.gun.muzzles.forEach((m, index) => {
      assert.ok(bores.some(([x, y]) => Math.abs(x - m.x) < 1e-6 && Math.abs(y - m.y) < 1e-6), `${id}: fire axis ${index} is a drawn bore`);
      const group = root.getObjectByName(`rig_barrel_${index}`);
      assert.ok(group && group.children.some((c) => c.isMesh || c.children.length), `${id}: fire axis ${index} owns its recoil group`);
      const box = new THREE.Box3().setFromObject(group);
      const groupX = gun.worldToLocal(box.getCenter(new THREE.Vector3())).x;
      assert.ok(Math.sign(groupX) === Math.sign(m.x), `${id}: recoil group ${index} carries its own side's tubes`);
    });
    // QW-2 launch exits and the tube census
    let census = null;
    root.traverse((node) => { if (Number.isInteger(node.userData?.launcherTubes)) census = (census ?? 0) + node.userData.launcherTubes; });
    const declared = spec.gun.shells.find((s) => s.guided)?.launcherTubes ?? 0;
    assert.equal(declared, tubes.length, `${id}: the spec's guided tubes`);
    assert.equal(census ?? 0, tubes.length, `${id}: the build publishes its tube census`);
    assert.equal((spec.gun.launcherMuzzles ?? []).length, tubes.length, `${id}: one launch exit per tube`);
    for (const t of spec.gun.launcherMuzzles ?? []) {
      const hit = firstHit(gun, gun, [t.x, t.y, t.z + 0.2], [0, 0, -1], 0.4);
      assert.ok(hit, `${id}: a drawn cap at the exit (${t.x}, ${t.y})`);
      near(hit.point.z, t.z + 0.01, 0.012, `${id}: the exit (${t.x}, ${t.y}) is the cap's front face`);
    }
    // envelope
    const bounds = new THREE.Box3();
    for (const mesh of meshesUnder(root)) { if (!mesh.userData.shadowOnly) bounds.union(new THREE.Box3().setFromObject(mesh)); }
    const size = bounds.getSize(new THREE.Vector3());
    near(size.x, spec.dims.widthM, spec.dims.widthM * 0.03, `${id}: width`);
    near(size.y, spec.dims.heightM, spec.dims.heightM * 0.03, `${id}: height`);
    near(size.z, spec.dims.overallLengthM, spec.dims.overallLengthM * 0.03, `${id}: length`);
    // the guns' sweep against the turret's own stock, from full depression to full elevation
    const gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
    const gunPts = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
    const grid = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, { cell: 0.05, rq: 0.06 });
    const pose = new THREE.Matrix4(), v = new THREE.Vector3();
    let worst = { d: Infinity };
    for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg += 2.5) {
      pose.compose(gun.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(-deg * DEG, 0, 0)), new THREE.Vector3(1, 1, 1));
      for (let i = 0; i < gunPts.length; i += 3) {
        // the trunnion shafts turn in their bosses: rotation-invariant about the pitch axis
        if (Math.hypot(gunPts[i + 1], gunPts[i + 2]) < 0.105) continue;
        v.set(gunPts[i], gunPts[i + 1], gunPts[i + 2]).applyMatrix4(pose);
        const d = grid.distance(v.x, v.y, v.z);
        if (d < worst.d) worst = { d, deg, at: [gunPts[i], gunPts[i + 1], gunPts[i + 2]].map((n) => +n.toFixed(3)) };
      }
    }
    assert.ok(worst.d >= 0.02, `${id}: the guns keep 2 cm from the turret at every pitch (worst ${worst.d.toFixed(3)} m at ${worst.deg} deg, gun point ${worst.at})`);
    console.log(`${id}: datums, ${bores.length} bores, ${tubes.length} launch exits, envelope ${size.toArray().map((n) => n.toFixed(2)).join(' x ')} m, turret clearance ${worst.d.toFixed(3)} m`);
  } finally { tank.dispose?.(); }
  // the hull at every 5 degrees of yaw, every 5 degrees of pitch from full depression to full elevation (a part below
  // and behind the trunnion is lowest between the stops: the PGZ-95's receivers near 48 degrees)
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
    assert.ok(worst.d >= GUN_HULL_KEEP_M, `${id}: the guns keep ${GUN_HULL_KEEP_M} m from the hull (worst ${worst.d.toFixed(3)} at yaw ${worst.yaw}, pitch ${worst.pitch}, ${worst.part})`);
    console.log(`${id}: hull clearance ${worst.d.toFixed(3)} m over yaw 0-180 and pitch ${(-probe.depression / DEG).toFixed(0)} to ${(probe.elevation / DEG).toFixed(0)} deg (worst at yaw ${worst.yaw}, pitch ${worst.pitch})`);
  } finally { probe.dispose(); }
}
console.log('chineseAirDefense.selftest: OK');
