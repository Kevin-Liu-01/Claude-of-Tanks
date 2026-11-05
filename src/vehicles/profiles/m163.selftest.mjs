// Release 269: the M163 VADS (profiles/m163.ts on the M113 builder's M741 hull, profiles/m113.ts
// buildM113HullSteps(P, 'm741'); the owner 2026-11-04) holds its combat datums to its geometry, its Vulcan's rotor to its
// spin, its gun clear of its own turret and hull, and its interior inside its armour.
//  - it composes on the M113 build: the hull carries the M741's race where the turret stands (m741Datums.ts M741_RING),
//    the commander's hatch behind it, and the turret stands on that datum;
//  - the trunnion stands at the frame's datum (m163Frame.ts), which the spec reads; one fire axis on the cluster's centre
//    line, its mouth on the muzzle clamp's face (the barrels' tips 4 cm ahead), no launcher, no guided round;
//  - the six barrels and their clamps ride one rotor group about the bore, tagged for gunRotorSpin.ts, nothing else in
//    it; a burst spins it (the barrels' tips move round the bore, the fire axis does not) and leaves the simulation's
//    state untouched; at rest it holds;
//  - the radar stands right rear (-x, -z) with its cases' tops at the frame's height; the gun on the left; the whips
//    aside, the build's length, width and height are the spec's dims (3 %);
//  - from full depression to full elevation every gun part keeps 2 cm from its turret's own stock (the cross shaft and
//    the feed joint, bodies about the elevation axis seated in the arms, keep it at every pitch by construction: gun
//    points within 9 cm of the axis are left out), and 2.5 cm from the hull at every 5 degrees of yaw and pitch from the
//    published stop (gunHullClearance.test-support.mjs's measure), the M741's whip apart (owed by the hull's builder);
//  - the turret's crew and modules lie inside the open mount (the basket under the deck included), no crew box in a
//    module box but the gunner's at his sight, no module in another.
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { GUN_HULL_KEEP_M, SurfaceGrid, densePoints, meshTriangles, meshesUnder } from '../gunHullClearance.test-support.mjs';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import { GUN_ROTOR_KEY } from '../gunRotorSpin.ts';
import { M741_COMMANDER_HATCH, M741_RING } from '../m741Datums.ts';
import { M163_GUN, M163_MUZZLE_Z, M163_RADAR, M163_TRUNNION, M163_TURRET as T } from './m163Frame.ts';

const DEG = Math.PI / 180;
const ID = 'm163_vads';
const build = (id) => createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);

/** The first surface hit along a ray in `frame`'s coordinates, restricted to meshes under `root`. */
function firstHit(root, frame, start, direction, far = 1, skip = []) {
  root.updateMatrixWorld(true);
  const origin = frame.localToWorld(new THREE.Vector3(...start));
  const dir = new THREE.Vector3(...direction).transformDirection(frame.matrixWorld);
  const hit = new THREE.Raycaster(origin, dir, 0, far).intersectObjects(meshesUnder(root, skip), false)[0];
  return hit ? { point: frame.worldToLocal(hit.point.clone()), object: hit.object } : null;
}
/** The visible box of the meshes under root, less any field-net suit and the whips' vertex spans (a whip merged into its
 * bucket keeps its span as the 'antenna' seat role, tankFactoryCore.ts seatRoleRanges). */
function envelope(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), v = new THREE.Vector3();
  for (const mesh of meshesUnder(root)) {
    if (/_ghillie_/.test(mesh.name)) continue;
    // (the running gear's instanced wheels and shoes: their instances' box)
    if (mesh.isInstancedMesh) { bounds.union(new THREE.Box3().setFromObject(mesh)); continue; }
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const antenna = (mesh.userData.seatRoleRanges ?? []).filter((r) => r.role === 'antenna');
    const count = index ? index.count : position.count;
    for (let k = 0; k < count; k++) {
      if (antenna.some((r) => k >= r.start && k < r.start + r.count)) continue;
      v.fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(v);
    }
  }
  return bounds;
}
const under = (object, group) => { for (let p = object; p; p = p.parent) if (p === group) return true; return false; };

const spec = getSpec(ID);
const tank = build(ID);
try {
  const root = tank.root;
  const hull = root.getObjectByName('rig_hull'), turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
  const recoil = root.getObjectByName('rig_recoil');
  root.updateMatrixWorld(true);
  // the M741's race and hatch, the turret on the race
  assert.deepEqual(spec.armor.turretPivot.map((v) => +v.toFixed(4)), [M741_RING.x, M741_RING.roofY, M741_RING.z].map((v) => +v.toFixed(4)),
    'the spec\'s ring is the M741\'s');
  assert.deepEqual(turret.position.toArray().map((v) => +v.toFixed(4)), spec.armor.turretPivot.map((v) => +v.toFixed(4)),
    'turret on the M741 race');
  const race = firstHit(hull, hull, [M741_RING.x + M741_RING.diameter / 2 - 0.01, 2.5, M741_RING.z], [0, -1, 0], 1, [turret]);
  assert.ok(race && race.point.y > M741_RING.roofY + 0.02, 'the race stands proud of the roof under the turret\'s rim');
  const hatch = firstHit(hull, hull, [M741_COMMANDER_HATCH.x, 2.5, M741_COMMANDER_HATCH.z], [0, -1, 0], 1, [turret]);
  assert.ok(hatch && hatch.point.y > M741_RING.roofY, 'the commander\'s hatch at the right rear');
  // datums
  assert.deepEqual(gun.position.toArray().map((v) => +v.toFixed(4)), [...M163_TRUNNION], 'trunnion at the frame\'s datum');
  assert.deepEqual(spec.armor.gunPivot, [...M163_TRUNNION], 'spec trunnion datum');
  assert.ok(M163_TRUNNION[0] > 0, 'the Vulcan on the turret\'s left');
  near(spec.armor.gunBarrel.lengthM, M163_MUZZLE_Z, 1e-9, 'the barrel datum is the mouth\'s plane');
  const mouth = firstHit(gun, gun, [0, 0, M163_GUN.barrelTipZ + 0.2], [0, 0, -1], 0.4);
  assert.ok(mouth && mouth.point.z < M163_MUZZLE_Z - 0.03, 'the hub is open at the mouth');
  const hubFace = firstHit(gun, gun, [M163_GUN.hubR - 0.004, 0, M163_GUN.barrelTipZ + 0.2], [0, 0, -1], 0.4);
  near(hubFace?.point.z ?? 0, M163_MUZZLE_Z, 0.002, 'the hub\'s face on the mouth\'s plane');
  assert.equal(spec.gun.muzzles, undefined, 'one fire axis on the cluster\'s centre line');
  assert.equal(spec.gun.launcherMuzzles, undefined, 'no launcher');
  assert.ok(!spec.gun.shells.some((s) => s.guided), 'no guided round');
  // the rotor: the six barrels and their clamps, nothing else
  const rotors = [];
  root.traverse((o) => { if (o.userData[GUN_ROTOR_KEY]) rotors.push(o); });
  assert.equal(rotors.length, 1, 'one rotor');
  const [rotor] = rotors;
  assert.equal(rotor.parent, recoil, 'the rotor rides the recoil group');
  assert.deepEqual({ ...rotor.userData[GUN_ROTOR_KEY] }, { barrels: 6, cycleS: spec.gun.autoloader.intraClipS }, 'its tag');
  assert.deepEqual(rotor.position.toArray(), [0, 0, 0], 'the rotor turns about the bore');
  assert.deepEqual(rotor.children.filter((c) => c.isMesh).map((c) => c.name).sort(), ['gun', 'gunDark'], 'barrels and clamps');
  assert.equal(recoil.children.filter((c) => c.isMesh && /^gun(Dark)?$/.test(c.name)).length, 0, 'no barrel left off the rotor');
  // each barrel's tip on the muzzle plane, bored, on the rotor
  for (let k = 0; k < M163_GUN.barrels; k++) {
    const a = (k / M163_GUN.barrels) * Math.PI * 2 + Math.PI / M163_GUN.barrels;
    const r = (M163_GUN.boreR + M163_GUN.barrelR) / 2;
    const bx = Math.sin(a) * M163_GUN.pitchR, by = Math.cos(a) * M163_GUN.pitchR;
    const tip = firstHit(gun, gun, [bx + r, by, M163_GUN.barrelTipZ + 0.2], [0, 0, -1], 0.4);
    assert.ok(tip && under(tip.object, rotor), `barrel ${k}: its tip is drawn on the rotor`);
    near(tip.point.z, M163_GUN.barrelTipZ, 0.004, `barrel ${k}: its tip 4 cm proud of the clamp`);
    const bore = firstHit(gun, gun, [bx, by, M163_GUN.barrelTipZ + 0.2], [0, 0, -1], 0.4);
    assert.ok(bore && bore.point.z < M163_GUN.barrelTipZ - M163_GUN.boreDepth + 0.006, `barrel ${k}: bored ${M163_GUN.boreDepth} m deep`);
  }
  // the radar right rear, its cases' tops at the frame's height
  assert.ok(M163_RADAR.x < 0 && M163_RADAR.z < 0, 'the radar stands right rear');
  const caseTop = firstHit(turret, turret, [M163_RADAR.x - M163_RADAR.caseDx, 1.6, M163_RADAR.z], [0, -1, 0], 1);
  assert.ok(caseTop, 'the radar\'s outer case is drawn');
  near(caseTop.point.y, M163_RADAR.caseTopY, 0.01, 'the case\'s top');
  // envelope (the whip aside), in the hull frame
  const box = envelope(root), size = box.getSize(new THREE.Vector3());
  near(size.y, spec.dims.heightM, spec.dims.heightM * 0.03, 'height over the radar\'s cases');
  near(size.z, spec.dims.overallLengthM, spec.dims.overallLengthM * 0.03, 'length');
  near(size.x, spec.dims.widthM, spec.dims.widthM * 0.03, 'width over the tracks');
  // the gun's sweep against the turret's own stock, from full depression to full elevation
  const gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
  const allPts = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
  const gunPts = [];
  for (let i = 0; i < allPts.length; i += 3) {
    if (Math.hypot(allPts[i + 1], allPts[i + 2]) > 0.09) gunPts.push(allPts[i], allPts[i + 1], allPts[i + 2]);
  }
  const grid = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, { cell: 0.05, rq: 0.06 });
  const pose = new THREE.Matrix4(), v = new THREE.Vector3();
  let worst = { d: Infinity };
  for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg += 2.5) {
    pose.compose(gun.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(-deg * DEG, 0, 0)), new THREE.Vector3(1, 1, 1));
    for (let i = 0; i < gunPts.length; i += 3) {
      v.set(gunPts[i], gunPts[i + 1], gunPts[i + 2]).applyMatrix4(pose);
      const d = grid.distance(v.x, v.y, v.z);
      if (d < worst.d) worst = { d, deg, at: [gunPts[i], gunPts[i + 1], gunPts[i + 2]].map((n) => +n.toFixed(3)) };
    }
  }
  assert.ok(worst.d >= 0.02, `the gun keeps 2 cm from the turret at every pitch (worst ${worst.d.toFixed(3)} m at ${worst.deg} deg, gun point ${worst.at})`);
  console.log(`${ID}: datums, rotor, bores, radar, envelope ${size.toArray().map((n) => n.toFixed(2)).join(' x ')} m, turret clearance ${worst.d.toFixed(3)} m`);

  // the spin: a burst turns the rotor and the barrels' tips round the bore, the fire axis and the sim state stay put
  const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
  tank.syncFromState(state, 0);
  const snapshot = () => JSON.stringify({ pos: state.pos, yaw: state.yaw, turretYaw: state.turretYaw, gunPitch: state.gunPitch });
  const simBefore = snapshot();
  const axis0 = tank.gunDirWorld(new THREE.Vector3()).clone(), tip0 = new THREE.Vector3();
  const tipObj = new THREE.Object3D();
  tipObj.position.set(M163_GUN.pitchR, 0, M163_GUN.barrelTipZ);
  rotor.add(tipObj);
  root.updateMatrixWorld(true);
  tipObj.getWorldPosition(tip0);
  assert.equal(rotor.rotation.z, 0, 'the rotor at rest before the first shot');
  const cycle = spec.gun.autoloader.intraClipS;
  let t = 0, turned = 0, last = rotor.rotation.z;
  const frame = (dt) => {
    tank.syncFromState(state, dt);
    t += dt;
    let d = rotor.rotation.z - last;
    if (d < 0) d += Math.PI * 2;
    turned += d;
    last = rotor.rotation.z;
  };
  for (let shot = 0; shot < 10; shot++) {
    tank.recoilKick(0, 0.36);
    for (let f = 0; f < 4; f++) frame(cycle / 4);
  }
  // spin-up over 0.3 s, then one barrel position (60 degrees) a 0.06 s cycle: 7.85 rad over the 0.6 s burst
  assert.ok(turned > 6, `a burst turns the rotor (${turned.toFixed(2)} rad in ${t.toFixed(2)} s)`);
  assert.ok(tank.gunDirWorld(new THREE.Vector3()).angleTo(axis0) < 0.05, 'the fire axis stays on the bore');
  assert.equal(snapshot(), simBefore, 'the spin leaves the simulation\'s state untouched');
  const burst = turned;
  for (let f = 0; f < 600; f++) frame(1 / 60);
  // (the 0.16 s hold at speed and the 0.45 s coast: ~10.6 rad, a revolution and a half)
  assert.ok(turned - burst > 3 && turned - burst < 12, `it coasts on after the burst (${(turned - burst).toFixed(2)} rad)`);
  const rested = rotor.rotation.z;
  frame(1 / 60);
  assert.equal(rotor.rotation.z, rested, 'it comes to rest after the coast');
  root.updateMatrixWorld(true);
  const tip1 = tipObj.getWorldPosition(new THREE.Vector3());
  near(tip1.distanceTo(tip0), 2 * M163_GUN.pitchR * Math.abs(Math.sin(rested / 2)), 0.003, 'the barrels\' tips turned round the bore');
  rotor.remove(tipObj);
  const spun = turned;
  console.log(`${ID}: a 0.60 s burst and its coast turned the rotor ${(spun / DEG).toFixed(0)} degrees; at rest after ${t.toFixed(1)} s`);
} finally { tank.dispose?.(); }

// The hull at every 5 degrees of yaw, every 5 degrees of pitch from the published stop to full elevation, the gun in
// battery and at a 0.135 m stroke (gunHullClearance.test-support.mjs's measure, its grid and samples). The M741's whip
// (profiles/m113.ts, the hull's builder's) stands 1.90 m from the race's axis at the left rear, inside the Vulcan's 1.99 m
// reach: the barrels pass through it round yaw 140 at every pitch under ~75 degrees. A whip flexes; its move (or the
// M741 without it: the M163's antennas stand on its turret, photos 03, 04) is owed by the hull's builder, so the whip is
// measured apart and its window pinned here.
function hullClearance(tank) {
  const root = tank.root;
  root.updateMatrixWorld(true);
  const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun'), recoil = root.getObjectByName('rig_recoil');
  const hull = turret.parent, gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), hInv = new THREE.Matrix4().copy(hull.matrixWorld).invert();
  const recoiling = new Set(); recoil.traverse((o) => recoiling.add(o));
  const gunMeshes = meshesUnder(gun);
  const fixed = densePoints(meshTriangles(gunMeshes.filter((m) => !recoiling.has(m)), gInv).tri, 0.015);
  const moving = densePoints(meshTriangles(gunMeshes.filter((m) => recoiling.has(m)), gInv).tri, 0.015);
  const body = [], whip = [], m = new THREE.Matrix4(), a = new THREE.Vector3();
  for (const mesh of meshesUnder(hull, [turret])) {
    if (mesh.isInstancedMesh) continue; // (the running gear, far under the gun's sweep)
    m.copy(hInv).multiply(mesh.matrixWorld);
    const pos = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index, n = idx ? idx.count : pos.count;
    const antenna = (mesh.userData.seatRoleRanges ?? []).filter((r) => r.role === 'antenna');
    for (let i = 0; i + 2 < n; i += 3) {
      const out = antenna.some((r) => i >= r.start && i < r.start + r.count) ? whip : body;
      for (let k = 0; k < 3; k++) { a.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m); out.push(a.x, a.y, a.z); }
    }
  }
  const grids = { body: new SurfaceGrid(Float64Array.from(body), { cell: 0.05, rq: 0.065 }),
    whip: new SurfaceGrid(Float64Array.from(whip), { cell: 0.05, rq: 0.065 }) };
  const ring = turret.position, P = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3();
  return (grid, yaw, pitch) => {
    P.compose(gun.position, q.setFromEuler(new THREE.Euler(-pitch, 0, 0)), gun.scale);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    let best = Infinity;
    for (const [pts, back] of [[fixed, 0], [moving, 0], [moving, 0.135]]) {
      for (let i = 0; i < pts.length; i += 3) {
        v.set(pts[i], pts[i + 1], pts[i + 2] - back).applyMatrix4(P);
        best = Math.min(best, grids[grid].distance(ring.x + c * v.x + sn * v.z, ring.y + v.y, ring.z - sn * v.x + c * v.z));
      }
    }
    return best;
  };
}
{
  const probeTank = build(ID);
  try {
    const distance = hullClearance(probeTank);
    let worst = { d: Infinity };
    const whipYaws = [];
    for (let yd = 0; yd <= 180; yd += 5) for (const sign of yd % 180 ? [-1, 1] : [1]) {
      const lo = minimumMechanicalGunPitch(spec, sign * yd * DEG), top = spec.gunElevationDeg * DEG;
      const pitches = [lo];
      for (let deg = Math.ceil(lo / DEG / 5) * 5; deg < spec.gunElevationDeg; deg += 5) if (deg * DEG > lo) pitches.push(deg * DEG);
      pitches.push(top);
      for (const pitch of pitches) {
        const d = distance('body', sign * yd * DEG, pitch);
        if (d < worst.d) worst = { d, yaw: sign * yd, pitch: +(pitch / DEG).toFixed(1) };
        if (distance('whip', sign * yd * DEG, pitch) < GUN_HULL_KEEP_M && !whipYaws.includes(sign * yd)) whipYaws.push(sign * yd);
      }
    }
    assert.ok(worst.d >= GUN_HULL_KEEP_M, `the gun keeps ${GUN_HULL_KEEP_M} m from the hull (worst ${worst.d.toFixed(3)} at yaw ${worst.yaw}, pitch ${worst.pitch})`);
    // the whip's window, owed by the hull's builder: it may only shrink
    assert.ok(whipYaws.every((y) => y >= 130 && y <= 150), `the M741's whip meets the gun only round yaw 140 (${whipYaws})`);
    console.log(`${ID}: hull clearance ${worst.d.toFixed(3)} m over yaw 0-180 from each yaw's stop to ${spec.gunElevationDeg} deg `
      + `(worst at yaw ${worst.yaw}, pitch ${worst.pitch}); the M741's whip in the gun's sweep at yaw ${whipYaws.join(', ') || 'none'} (owed)`);
  } finally { probeTank.dispose?.(); }
}

// the turret's crew and modules inside the open mount (the basket under the deck), no crew in a module
const R = T.shieldR + 0.01;
const inMount = (min, max) => Math.max(Math.abs(min[0]), Math.abs(max[0])) <= R && Math.max(Math.abs(min[2]), Math.abs(max[2])) <= R
  && min[1] >= -0.6 && max[1] <= T.leftShield.topY + 0.15;
const boxOf = (record) => [record.min, record.max];
const turretCrew = spec.armor.crew.filter((c) => c.turretLocal);
const turretModules = spec.armor.modules.filter((m) => m.turretLocal && m.module !== 'feedSystem');
assert.deepEqual(turretCrew.map((c) => c.crew), ['gunner'], 'the gunner alone in the mount');
assert.deepEqual(spec.armor.crew.filter((c) => !c.turretLocal).map((c) => c.crew).sort(), ['commander', 'driver', 'loader'],
  'the driver, the commander and the loader in the hull');
for (const record of [...turretCrew, ...turretModules]) {
  const [min, max] = boxOf(record);
  assert.ok(min && max && inMount(min, max), `${record.crew ?? record.module}: inside the mount (${min}..${max})`);
}
const overlap = (a, b) => [0, 1, 2].every((k) => a[0][k] < b[1][k] - 0.02 && b[0][k] < a[1][k] - 0.02);
for (const c of spec.armor.crew) for (const m of spec.armor.modules) {
  if (c.turretLocal !== m.turretLocal || ['trackL', 'trackR', 'turretRing', 'gun'].includes(m.module)) continue;
  if (c.crew === 'gunner' && m.module === 'optics') continue;
  assert.ok(!overlap(boxOf(c), boxOf(m)), `${c.crew}: clear of the ${m.module} module`);
}
const sameFrame = spec.armor.modules.filter((m) => !['trackL', 'trackR', 'turretRing'].includes(m.module));
// (finalizeCombatAnatomy derives the feed inside the gun's own box from the internal layout)
const derivedFeed = (a, b) => [a.module, b.module].sort().join('|') === 'feedSystem|gun';
for (const [i, a] of sameFrame.entries()) for (const b of sameFrame.slice(i + 1)) {
  if (a.turretLocal !== b.turretLocal || derivedFeed(a, b)) continue;
  assert.ok(!overlap(boxOf(a), boxOf(b)), `${a.module} clear of ${b.module}`);
}
console.log('m163.selftest: OK');
