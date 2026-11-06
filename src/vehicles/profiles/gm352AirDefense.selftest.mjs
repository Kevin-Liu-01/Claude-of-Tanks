// Release 268: the GM-352 air-defence pair, the 2K22M Tunguska-M and the tracked Pantsir-S1 (profiles/gm352AirDefense.ts).
// Holds the build to the datum table both the builders and the spec read (profiles/gm352Layout.ts):
//  - the spec's ring, trunnion, fire axes and launch exits are the table's, and the built rig stands on them (HIGH, LOW);
//  - each fire axis lands on a real bore's muzzle face in its own barrel group, whose painted stock is drawn on that
//    axis (recoilRig.selftest's twin-plant law) and which fire in turn; each launch exit lands on a container's dark
//    front cover in the elevating mount, and the profile's tube census is the spec's and the exits' count;
//  - one chassis, two options: every triangle of the Tunguska's hull shell is in the Pantsir's, whose extra shell is the
//    GM-352M1E's stern alone (owner rule: shared parts, no forked copies);
//  - the guns and the racks keep the fleet's 25 mm off the hull at every whole-degree yaw at their full depression,
//    level, half and full elevation (gunHullClearance.test-support.mjs), and 15 mm off their own turret through the
//    whole arc (the trunnion journals excepted: they turn in their bosses).
// Negative controls: a shifted fire axis, a shifted launch exit and a hull triangle the Pantsir lacks all fail.
// First-party test: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../tankFactory.ts';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { GM352_HULL, GM352_RING, PANTSIR, TUNGUSKA, rackMouths } from './gm352Layout.ts';
import { GUN_HULL_KEEP_M, SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder } from '../gunHullClearance.test-support.mjs';

const DEG = Math.PI / 180;
const ROWS = {
  tunguska_m: { L: TUNGUSKA, mouths: rackMouths(TUNGUSKA.rack.tubeXs, TUNGUSKA.rack.tubeYs, TUNGUSKA.rack.mouthZ) },
  pantsir_s1: { L: PANTSIR, mouths: rackMouths(PANTSIR.bank.tubeXs, PANTSIR.bank.tubeYs, PANTSIR.bank.mouthZ) },
};
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

function visibleMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.shadowOnly || o.userData.authoredShadowProxy) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    out.push(o);
  });
  return out;
}
/** The first surface a ray meets, in `frame`'s coordinates, and the rig group that owns it. */
function cast(root, frame, from, dir, far = 0.6) {
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(frame.localToWorld(new THREE.Vector3(...from)),
    new THREE.Vector3(...dir).transformDirection(frame.matrixWorld), 0, far);
  const hit = ray.intersectObjects(visibleMeshes(root), false)[0];
  if (!hit) return null;
  let rig = null;
  for (let p = hit.object; p && !rig; p = p.parent) if (/^rig_/.test(p.name)) rig = p.name;
  return { z: frame.worldToLocal(hit.point.clone()).z, rig, name: hit.object.name };
}

// ---- the spec is the table's ---------------------------------------------------------------------------------------
for (const [id, { L, mouths }] of Object.entries(ROWS)) {
  const spec = getSpec(id);
  assert.deepEqual([...spec.armor.turretPivot], [...GM352_RING], `${id}: the ring is the table's`);
  assert.deepEqual([...spec.armor.gunPivot], [...L.gunPivot], `${id}: the trunnion is the table's`);
  assert.equal(spec.armor.gunBarrel.lengthM, L.muzzleZ, `${id}: the muzzle station is the table's`);
  assert.deepEqual(spec.gun.muzzles, [{ x: -(L.gunX - L.boreDx), y: 0 }, { x: L.gunX - L.boreDx, y: 0 }],
    `${id}: one fire axis per 2A38M, on its inner bore`);
  assert.deepEqual(spec.gun.launcherMuzzles.map(({ x, y, z }) => ({ x, y, z })), mouths, `${id}: the launch exits are the table's`);
  const guided = spec.gun.shells.find((shell) => shell.guided);
  assert.equal(guided.launcherTubes, mouths.length, `${id}: one ${guided.name} tube per drawn container`);
  assert.equal(spec.dims.hullLengthM, 2 * GM352_HULL.halfLength, `${id}: the GM-352's 7.93 m`);
}

// ---- the build stands on it ----------------------------------------------------------------------------------------
const hullShell = {};
for (const quality of ['high', 'low']) for (const [id, { L, mouths }] of Object.entries(ROWS)) {
  const tank = createTank(id, null, { proceduralOnly: true, quality, camoSeed: 4242, geometryReceipt: true });
  try {
    const root = tank.root, turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
    assert.deepEqual(turret.position.toArray().map((v) => +v.toFixed(6)), [...GM352_RING], `${id} ${quality}: ring seat`);
    assert.deepEqual(gun.position.toArray().map((v) => +v.toFixed(6)), [...L.gunPivot], `${id} ${quality}: trunnion seat`);
    const census = turret.userData.airDefenseLauncher?.launcherTubes;
    assert.equal(census, mouths.length, `${id} ${quality}: the profile's tube census`);
    getSpec(id).gun.muzzles.forEach(({ x, y }, index) => {
      for (const [dx, dy] of [[0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03]]) {
        const hit = cast(root, gun, [x + dx, y + dy, L.muzzleZ + 0.25], [0, 0, -1]);
        assert.ok(hit, `${id} ${quality}: bore ${index} has a muzzle face`);
        near(hit.z, L.muzzleZ, 0.003, `${id} ${quality}: bore ${index}'s muzzle face`);
        assert.equal(hit.rig, `rig_barrel_${index}`, `${id} ${quality}: bore ${index}'s face is its own barrel group's`);
      }
    });
    // each barrel group's painted stock is drawn on its own fire axis (recoilRig.selftest's twin-plant law), and the
    // two groups fire in turn
    const recoil = root.getObjectByName('rig_recoil');
    getSpec(id).gun.muzzles.forEach(({ x }, index) => {
      const painted = root.getObjectByName(`rig_barrel_${index}`)?.getObjectByName(`gunBarrel${index}`);
      assert.ok(painted?.isMesh, `${id} ${quality}: barrel group ${index} carries its painted stock`);
      const centre = recoil.worldToLocal(new THREE.Box3().setFromObject(painted).getCenter(new THREE.Vector3()));
      near(centre.x, x, 0.001, `${id} ${quality}: barrel group ${index} is drawn on its fire axis`);
    });
    if (quality === 'high') {
      assert.deepEqual([tank.recoilKick(0, 0.30), tank.recoilKick(0, 0.30), tank.recoilKick(0, 0.30)], [0, 1, 0],
        `${id}: the two 2A38M fire in turn`);
    }
    // negative control: off the bore's collar there is no face at the muzzle station
    const miss = cast(root, gun, [L.gunX + 0.20, 0, L.muzzleZ + 0.25], [0, 0, -1], 0.30);
    assert.ok(!miss || miss.z < L.muzzleZ - 0.05, `${id} ${quality}: control, no muzzle face beside the guns`);
    for (const { x, y, z } of mouths) {
      const hit = cast(root, gun, [x, y, z + 0.2], [0, 0, -1]);
      assert.ok(hit, `${id} ${quality}: a container at ${x},${y}`);
      near(hit.z, z, 0.002, `${id} ${quality}: launch exit ${x},${y}`);
      assert.equal(hit.rig, 'rig_gun', `${id} ${quality}: the containers elevate with the guns`);
      assert.equal(hit.name, 'gunMountDark', `${id} ${quality}: the exit is the container's dark front cover`);
    }
    // negative control: halfway in toward the centre line there is no launch exit at the containers' face
    const shifted = cast(root, gun, [mouths[0].x / 2, mouths[0].y, mouths[0].z + 0.2], [0, 0, -1], 0.4);
    assert.ok(!shifted || shifted.name !== 'gunMountDark' || Math.abs(shifted.z - mouths[0].z) > 0.002,
      `${id} ${quality}: control, no launch exit off the containers`);
    if (quality === 'high') {
      const hull = root.getObjectByName('rig_hull'), body = meshesUnder(hull, [turret]).find((o) => o.name === 'hull');
      assert.ok(body, `${id}: the hull's armour shell mesh`);
      const { tri } = meshTriangles([body], new THREE.Matrix4().copy(hull.matrixWorld).invert());
      const keys = new Set();
      for (let t = 0; t < tri.length; t += 9) {
        keys.add(Array.from(tri.subarray(t, t + 9), (v) => v.toFixed(4)).join(','));
      }
      hullShell[id] = { keys, tri };
    }
  } finally { tank.dispose?.(); }
}
{
  const tunguska = hullShell.tunguska_m, pantsir = hullShell.pantsir_s1;
  for (const key of tunguska.keys) assert.ok(pantsir.keys.has(key), 'the Pantsir carries every triangle of the Tunguska\'s GM-352 shell');
  let extra = 0;
  for (let t = 0; t < pantsir.tri.length; t += 9) {
    const key = Array.from(pantsir.tri.subarray(t, t + 9), (v) => v.toFixed(4)).join(',');
    if (tunguska.keys.has(key)) continue;
    extra++;
    for (let k = 2; k < 9; k += 3) assert.ok(pantsir.tri[t + k] < -2.5, `the GM-352M1E adds only its stern (${pantsir.tri[t + k]})`);
  }
  assert.ok(extra > 0, 'the GM-352M1E option draws its stern boxes');
  // negative control: a triangle the Pantsir lacks is caught
  assert.ok(!pantsir.keys.has('9,9,9,9,9,9,9,9,9'), 'control: an absent triangle is absent');
}

// ---- clearance through the arc -------------------------------------------------------------------------------------
for (const [id, { L }] of Object.entries(ROWS)) {
  const probe = gunHullProbe(id, { suit: false });
  try {
    let worst = { d: Infinity };
    for (let yd = 0; yd < 360; yd += 2) for (const pitch of [-probe.depression, 0, probe.elevation / 2, probe.elevation]) {
      const d = probe.distance(yd * DEG, pitch, GUN_HULL_KEEP_M);
      if (d < worst.d) worst = { d, yd, pitch: pitch / DEG, part: probe.part };
    }
    assert.ok(worst.d >= GUN_HULL_KEEP_M, `${id}: the guns and racks keep ${GUN_HULL_KEEP_M} m off the hull (${JSON.stringify(worst)})`);
    console.log(`gm352AirDefense.selftest: ${id} gun-hull clearance ${worst.d === Infinity ? 'beyond reach' : worst.d.toFixed(3)} m`);
  } finally { probe.dispose(); }
  // the gun's own turret: every gun sample farther than 0.12 m from the pitch axis keeps 15 mm off the turret body
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
    const grid = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, { cell: 0.05, rq: 0.065 });
    const pts = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
    const spec = getSpec(id), v = new THREE.Vector3(), M = new THREE.Matrix4(), q = new THREE.Quaternion();
    let worst = { d: Infinity };
    for (let pd = -spec.gunDepressionDeg; pd <= spec.gunElevationDeg; pd += 3) {
      M.compose(gun.position, q.setFromEuler(new THREE.Euler(-pd * DEG, 0, 0)), gun.scale);
      for (let i = 0; i < pts.length; i += 3) {
        if (Math.hypot(pts[i + 1], pts[i + 2]) < 0.12) continue;
        v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(M);
        const d = grid.distance(v.x, v.y, v.z);
        if (d < worst.d) worst = { d, pd, at: [pts[i], pts[i + 1], pts[i + 2]].map((n) => +n.toFixed(3)) };
      }
    }
    assert.ok(worst.d >= 0.015, `${id}: the guns and racks clear their turret (${JSON.stringify(worst)})`);
    console.log(`gm352AirDefense.selftest: ${id} gun-turret clearance ${worst.d === Infinity ? 'beyond reach' : worst.d.toFixed(3)} m`);
  } finally { tank.dispose?.(); }
}
console.log('gm352AirDefense.selftest: ok');
