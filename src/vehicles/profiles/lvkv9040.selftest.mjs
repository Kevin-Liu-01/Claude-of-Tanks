// Release 269: the Lvkv 9040 (profiles/lvkv9040.ts on the fleet's CV90 Mk IV hull, profiles/cv90MkivSourceX.ts with
// `hullOnly`; the owner 2026-11-03) holds its combat datums to its geometry, its gun clear of its own turret and hull, and
// its interior inside its armour.
//  - it composes on the Mk IV's own build: every hull mesh is the cv90_mk4's, byte for byte, and the turret stands on the
//    Mk IV's ring datum;
//  - the trunnion stands at the frame's datum (lvkv9040Frame.ts), which the spec reads; one centred fire axis that ends on
//    the flash eliminator's face at the muzzle plane, on the recoiling tube; no launcher;
//  - the PS-95 drum stands rear left (+x) at the frame's height; the whip aside, the build's length, width and height are
//    the spec's dims (3 %);
//  - from full depression to full elevation every gun part keeps 2 cm from its turret's own stock (the mantlet drum, a
//    body of revolution about the elevation axis, keeps it at every pitch by construction), and 2.5 cm from the hull at
//    every 5 degrees of yaw (every degree near the stern stops) and pitch from each yaw's published stop
//    (gunHullClearance.test-support.mjs);
//  - the turret's modules lie inside the turret's body (15 cm over its roof at most, as armorInterior.ts), its crew in the
//    body or the basket under it (armorInterior.ts's turret-or-basket rule, where the fleet's seat fitter seats them), and no
//    crew box overlaps a module box but the gunner's at his sight.
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { GUN_HULL_KEEP_M, SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder } from '../gunHullClearance.test-support.mjs';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import { armorVolumeOverflows } from '../armorInterior.ts';
import { combatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';
import { LVKV_MUZZLE_Z, LVKV_RADAR, LVKV_SIGHTS, LVKV_TRUNNION, LVKV_TURRET as T } from './lvkv9040Frame.ts';

const DEG = Math.PI / 180;
const ID = 'lvkv9040';
const build = (id) => createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);

/** The first surface hit along a ray in `frame`'s coordinates, restricted to meshes under `root`. */
function firstHit(root, frame, start, direction, far = 1) {
  root.updateMatrixWorld(true);
  const origin = frame.localToWorld(new THREE.Vector3(...start));
  const dir = new THREE.Vector3(...direction).transformDirection(frame.matrixWorld);
  const hit = new THREE.Raycaster(origin, dir, 0, far).intersectObjects(meshesUnder(root), false)[0];
  return hit ? { point: frame.worldToLocal(hit.point.clone()), object: hit.object } : null;
}
/** The visible box of the meshes under root, less those under any `skip` group and any field-net suit. */
function envelope(root, skip = []) {
  const bounds = new THREE.Box3();
  for (const mesh of meshesUnder(root)) {
    let skipped = /_ghillie_/.test(mesh.name);
    for (let p = mesh; p; p = p.parent) if (skip.includes(p)) skipped = true;
    if (!skipped) bounds.union(new THREE.Box3().setFromObject(mesh));
  }
  return bounds.getSize(new THREE.Vector3());
}

/** Each hull mesh's name and vertex positions (hull frame, 0.1 mm), the turret and its gun left out, as a sorted list. */
function hullMeshes(root) {
  root.updateMatrixWorld(true);
  const hull = root.getObjectByName('rig_hull'), turret = root.getObjectByName('rig_turret');
  const inv = new THREE.Matrix4().copy(hull.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  // (markings follow each spec's own; the turret seat's race follows each id's combat-anatomy calibration, owed for this id)
  return meshesUnder(hull, [turret]).filter((mesh) => !mesh.userData.vehicleMarking && !/_ghillie_|decal|marking|^turretSeatRace$/i.test(mesh.name))
    .map((mesh) => {
      const pos = mesh.geometry.getAttribute('position'), out = [];
      m.multiplyMatrices(inv, mesh.matrixWorld);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); out.push(Math.round(v.x * 1e4), Math.round(v.y * 1e4), Math.round(v.z * 1e4)); }
      return `${mesh.name}:${out.join(',')}`;
    }).sort();
}

const spec = getSpec(ID), base = getSpec('cv90_mk4');
const tank = build(ID), mk4 = build('cv90_mk4');
try {
  const root = tank.root;
  const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
  root.updateMatrixWorld(true);
  // the Mk IV's own hull build and ring
  const own = hullMeshes(root), theirs = hullMeshes(mk4.root);
  assert.ok(own.length > 10, 'the hull is drawn');
  assert.deepEqual(own, theirs, 'every hull mesh is the CV90 Mk IV\'s');
  assert.deepEqual(spec.armor.turretPivot, base.armor.turretPivot, 'the Mk IV\'s ring datum');
  assert.deepEqual(turret.position.toArray().map((v) => +v.toFixed(4)), base.armor.turretPivot.map((v) => +v.toFixed(4)), 'turret on the Mk IV ring');
  // (the hull plates: the registration hook copies the Mk IV's; each id's combat-anatomy calibration row, owed by the
  // regeneration for this id, finishes them)
  // datums
  assert.deepEqual(gun.position.toArray().map((v) => +v.toFixed(4)), [...LVKV_TRUNNION], 'trunnion at the frame\'s datum');
  assert.deepEqual(spec.armor.gunPivot, [...LVKV_TRUNNION], 'spec trunnion datum');
  near(spec.armor.gunBarrel.lengthM, LVKV_MUZZLE_Z, 1e-9, 'the barrel datum is the muzzle plane');
  assert.equal(spec.gun.muzzles, undefined, 'one centred fire axis');
  assert.equal(spec.gun.launcherMuzzles, undefined, 'no launcher');
  assert.ok(!spec.gun.shells.some((s) => s.guided), 'no guided round');
  const face = firstHit(gun, gun, [0.06, 0, LVKV_MUZZLE_Z + 0.3], [0, 0, -1], 0.6);
  assert.ok(face, 'the flash eliminator is drawn');
  near(face.point.z, LVKV_MUZZLE_Z, 0.01, 'the bore ends on the muzzle plane');
  const recoil = root.getObjectByName('rig_recoil');
  let onTube = false;
  for (let p = face.object; p; p = p.parent) if (p === recoil) onTube = true;
  assert.ok(onTube, 'the muzzle face recoils with the tube');
  // the drum: rear left, its top at the frame's height
  const drum = firstHit(turret, turret, [LVKV_RADAR.x, LVKV_RADAR.topY + 0.5, LVKV_RADAR.z], [0, -1, 0], 1);
  assert.ok(drum, 'the radar drum is drawn');
  near(drum.point.y, LVKV_RADAR.topY, 0.01, 'the drum\'s top');
  assert.ok(LVKV_RADAR.x > 0 && LVKV_RADAR.z < 0, 'the drum stands rear left');
  const under = firstHit(turret, turret, [LVKV_RADAR.x + LVKV_RADAR.r - 0.06, LVKV_RADAR.bottomY - 0.05, LVKV_RADAR.z], [0, -1, 0], 1);
  assert.ok(under && under.point.y < LVKV_RADAR.bottomY - 0.10, 'daylight under the drum\'s rim (raised on its column)');
  // envelope (the whip aside)
  const whips = [];
  root.traverse((o) => { if (/antennaWhip/.test(o.name)) whips.push(o); });
  const size = envelope(root, whips);
  near(size.y, spec.dims.heightM, spec.dims.heightM * 0.03, 'height over the drum');
  near(size.z, spec.dims.overallLengthM, spec.dims.overallLengthM * 0.03, 'length with the gun forward');
  near(size.x, spec.dims.widthM, spec.dims.widthM * 0.03, 'width over the Mk IV hull');
  // the gun's sweep against the turret's own stock, from full depression to full elevation
  const gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
  const gunPts = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
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
  console.log(`${ID}: datums, one bore, drum, envelope ${size.toArray().map((n) => n.toFixed(2)).join(' x ')} m, turret clearance ${worst.d.toFixed(3)} m`);
} finally { tank.dispose?.(); mk4.dispose?.(); }

// the hull at every 5 degrees of yaw (and every degree of the published stops' window), every 5 degrees of pitch from the
// yaw's mechanical stop (the spec's gunPitchByYawDeg over the Mk IV's raised troop roof astern) to full elevation
const probe = gunHullProbe(ID, { suit: false });
try {
  let worst = { d: Infinity };
  const curve = spec.gunPitchByYawDeg ?? [];
  const yaws = new Set();
  for (let yd = 0; yd <= 180; yd += 5) yaws.add(yd);
  if (curve.length) for (let yd = Math.floor(Math.min(...curve.filter(([, p]) => p > -spec.gunDepressionDeg).map(([y]) => y), 180)) - 3; yd <= 180; yd++) yaws.add(Math.max(0, yd));
  for (const yd of [...yaws].sort((a, b) => a - b)) for (const sign of yd % 180 ? [-1, 1] : [1]) {
    const lo = minimumMechanicalGunPitch(spec, sign * yd * DEG);
    const pitches = [lo];
    for (let deg = Math.ceil(lo / DEG / 5) * 5; deg < probe.elevation / DEG; deg += 5) if (deg * DEG > lo) pitches.push(deg * DEG);
    pitches.push(probe.elevation);
    for (const pitch of pitches) {
      const d = probe.distance(sign * yd * DEG, pitch, 0);
      if (d < worst.d) worst = { d, yaw: sign * yd, pitch: +(pitch / DEG).toFixed(1), part: probe.part };
    }
  }
  assert.ok(worst.d >= GUN_HULL_KEEP_M, `the gun keeps ${GUN_HULL_KEEP_M} m from the hull (worst ${worst.d.toFixed(3)} at yaw ${worst.yaw}, pitch ${worst.pitch}, ${worst.part})`);
  console.log(`${ID}: hull clearance ${worst.d.toFixed(3)} m over yaw 0-180 from each yaw's stop to ${(probe.elevation / DEG).toFixed(0)} deg (worst at yaw ${worst.yaw}, pitch ${worst.pitch})`);
} finally { probe.dispose(); }

// the turret's crew and modules inside its body, no crew in a module
const inBody = (min, max) => min[0] >= -T.halfWBottom - 1e-9 && max[0] <= T.halfWBottom + 1e-9 && min[1] >= T.floorY - 0.6
  && max[1] <= T.frontRoofY + 0.15 && min[2] >= T.rearZ - 1e-9 && max[2] <= T.footZ + 1e-9;
const boxOf = (record) => [record.min, record.max];
// (the authored modules; finalizeCombatAnatomy derives the clip feed inside the gun's own box from the internal layout)
const turretCrew = spec.armor.crew.filter((c) => c.turretLocal);
const turretModules = spec.armor.modules.filter((m) => m.turretLocal && m.module !== 'feedSystem');
assert.equal(turretCrew.length, 3, 'gunner, commander and radar operator in the turret');
// 270: the optics are the two sight heads standing on the front roof (addRoofKit, their windows up to the commander's head),
// held to the body's plan and under the taller head's top, not inside the body's volume
const sightTopY = T.frontRoofY + Math.max(LVKV_SIGHTS.commander.h, LVKV_SIGHTS.gunner.h);
for (const record of turretModules) {
  const [min, max] = boxOf(record);
  if (record.module === 'optics') {
    assert.ok(min && max && inBody(min, [max[0], Math.min(max[1], T.frontRoofY), max[2]]) && max[1] <= sightTopY + 1e-9,
      `optics: on the turret's front roof, under the sight heads' top (${min}..${max})`);
    continue;
  }
  assert.ok(min && max && inBody(min, max), `${record.module}: inside the turret's body (${min}..${max})`);
}
// the crew in the turret's body or the basket under it: the fleet's seat fitter (tools/crew-seat-fit.mjs) seats turret crew
// down through the ring, held by armorInterior.ts's turret-or-basket rule (internalPlacement.selftest.mjs)
const overflows = armorVolumeOverflows(spec.armor, combatAnatomyCalibration(ID)?.turretRing);
for (const record of turretCrew) {
  const out = Math.max(...overflows.filter((part) => part.turretLocal && part.name === record.crew).map((part) => part.overflow));
  assert.ok(out <= 0.15, `${record.crew}: inside the turret's body or the basket under it (${out.toFixed(3)} m out)`);
}
const overlap = (a, b) => [0, 1, 2].every((k) => a[0][k] < b[1][k] - 0.02 && b[0][k] < a[1][k] - 0.02);
// 270: a module drawn in separate parts is those parts (the optics: the two sight windows and the lamp in the right cheek, as
// the fleet registers lamps, 1.6 m apart), not the box that spans them
const partsOf = (record) => (record.parts?.length ? record.parts.map((part) => [part.min, part.max]) : [boxOf(record)]);
const clear = (a, b) => partsOf(a).every((p) => partsOf(b).every((q) => !overlap(p, q)));
// (internalPlacement.selftest.mjs's exception: a crew member at the drawn sight he uses)
for (const c of turretCrew) for (const m of turretModules) {
  if (c.crew === 'gunner' && m.module === 'optics') continue;
  assert.ok(clear(c, m), `${c.crew}: clear of the ${m.module} module`);
}
for (const [i, a] of turretModules.entries()) for (const b of turretModules.slice(i + 1)) {
  assert.ok(clear(a, b), `${a.module} clear of ${b.module}`);
}
console.log('lvkv9040.selftest: OK');
