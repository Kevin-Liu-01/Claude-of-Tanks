// PZA Loara (269, builder P; the owner 2026-11-03: "also add ... PZA Loara (poland)"): the native fixture of
// profiles/loara.ts at both qualities. Its combat frame is its drawn frame (the ring on the raised deck, the elevation
// axis, the twin bores and their brakes, all from profiles/loaraFrame.ts); its hull the PT-91's without the ERAWA tiles
// under the raised deck's plates; its crew three; its envelope the spec's dims; both guns clear the turret through the
// whole -10 to +85 degree arc and the hull at every bearing (docs/references/tanks/pza_loara.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { INTERNAL_LAYOUT_BY_TANK } from '../internalLayoutRegistry.ts';
import { SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';
import { BODY_EXCLUDED_SEAT_ROLES, bodyGeometryWithout } from '../../../tools/body-height-parts.mjs';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import {
  LOARA_BORE, LOARA_DECK, LOARA_DRIVER_X, LOARA_GUN_HOUSING, LOARA_MUZZLE_Z, LOARA_RING, LOARA_TRACKING_RADAR,
  LOARA_TRUNNION, LOARA_TURRET,
} from './loaraFrame.ts';

const ID = 'pza_loara';
const DEG = Math.PI / 180;
const near = (actual, expected, label, tolerance = 0.002) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} against ${expected}`);

// ---- the combat frame is the drawn frame
const spec = getSpec(ID);
assert.equal(spec.name, 'PZA Loara');
assert.equal(spec.nation, 'Poland');
spec.armor.turretPivot.forEach((v, i) => near(v, LOARA_RING[i], `turret pivot ${i}`));
spec.armor.gunPivot.forEach((v, i) => near(v, LOARA_TRUNNION[i], `elevation axis ${i}`));
near(spec.armor.gunBarrel.lengthM, LOARA_MUZZLE_Z, 'barrel length to the brakes\' faces');
assert.deepEqual(spec.gun.muzzles.map((m) => [m.x, m.y]), [[-LOARA_BORE.x, LOARA_BORE.y], [LOARA_BORE.x, LOARA_BORE.y]],
  'one bore per KDA, right then left');
assert.equal(spec.gun.launcherMuzzles, undefined, 'the Loara carries no missiles');
assert.equal(spec.gun.caliberMm, 35);
assert.equal(spec.gunElevationDeg, 85);
assert.equal(spec.gunDepressionDeg, 10);
// the hull: the Twardy's frame without its ERAWA plates, under the raised deck's roof, flanks, front and rear
const plates = new Map(spec.armor.hullPlates.map((p) => [p.name, p]));
assert.ok(!spec.armor.hullPlates.some((p) => p.kind === 'era'), 'no reactive plates on the Loara\'s hull');
for (const name of ['hull_roof', 'loara_deck_side_l', 'loara_deck_side_r', 'loara_deck_front', 'loara_deck_rear']) {
  assert.ok(plates.has(name), `the raised deck's ${name}`);
}
for (const [x, y] of plates.get('hull_roof').verts.map((v) => [v[0], v[1]])) {
  near(y, LOARA_DECK.topY, 'the deck plate on the drawn roof');
  near(Math.abs(x), LOARA_DECK.halfW, 'the deck plate to the drawn flanks');
}
// the turret ring's module rises onto the raised deck with the ring
const ring = spec.armor.modules.find((m) => m.module === 'turretRing' && !m.turretLocal);
assert.ok(ring && ring.max[1] > LOARA_DECK.topY - 0.05 && ring.min[1] < LOARA_DECK.topY, 'the ring module at the raised deck');
// three crew: the driver in the hull, the gunner (left, +x) and the commander (right) in the turret body
const layout = INTERNAL_LAYOUT_BY_TANK[ID];
assert.equal(layout.layoutKey, 'spaaLoara');
assert.deepEqual(layout.crew.map((c) => c.role).sort(), ['commander', 'driver', 'gunner']);
const T = LOARA_TURRET;
assert.deepEqual(spec.armor.crew.filter((c) => c.turretLocal).map((c) => c.crew).sort(), ['commander', 'gunner']);
for (const box of spec.armor.crew.filter((c) => c.turretLocal)) {
  assert.ok(box.min[0] >= -T.halfW && box.max[0] <= T.halfW && box.max[1] <= T.roofY && box.min[2] >= T.rearZ
    && box.max[2] <= T.frontZ, `${box.crew} sits inside the turret body`);
}
assert.ok(spec.armor.crew.find((c) => c.crew === 'gunner').min[0] > 0, 'the gunner on the left (+x)');
// the turret's plates on the drawn shell: the body and the nose under the tracking radar
for (const p of spec.armor.turretPlates) for (const [x, y, z] of p.verts) {
  assert.ok(Math.abs(x) <= T.halfW + T.skirtFlare + 1e-9 && y >= T.floorY - 1e-9 && y <= T.roofY + 1e-9 && z >= T.rearZ - 1e-9
    && z <= T.chinFrontZ + 1e-9, `${p.name} within the drawn turret`);
}

// the photo critique's proportions (round 2), held on the frame: the pods' rear at the turret's rear corner, the bore a
// third of the way down the pod's front, the pod 0.6 of the turret's wall; the tracker head and its sensors 40 % of the
// turret's height over the roof, the radome's centre near the roof line and 0.7 of the turret's height across; the
// driver left of the middle
const H = LOARA_GUN_HOUSING, TR = LOARA_TRACKING_RADAR, turretH = T.roofY - T.floorY;
near(LOARA_TRUNNION[2] + H.rearZ, T.rearZ, 'the pods\' rear at the turret\'s rear corner', 0.06);
const boreDown = (H.topY - LOARA_BORE.y) / (H.topY - H.bottomY);
assert.ok(boreDown >= 0.20 && boreDown <= 0.35, `the bore ${(boreDown * 100).toFixed(0)} % down the pod`);
near((H.topY - H.bottomY) / turretH, 0.6, 'the pod 0.6 of the turret wall', 0.03);
near((TR.sensorTopY - T.roofY) / turretH, 0.40, 'the tracker head 40 % over the roof', 0.03);
assert.ok(T.roofY - TR.y <= 0.22 && 2 * TR.r / turretH >= 0.68, 'the radome near the roof line, 0.7 of the turret height across');
const driver = spec.armor.crew.find((c) => c.crew === 'driver');
assert.ok((driver.min[0] + driver.max[0]) / 2 > LOARA_DRIVER_X / 2, 'the driver left of the middle');

/** The highest point of the visible body (whips left out, as the geometry gate's body: tools/body-height-parts.mjs). */
function bodyTop(root) {
  let top = -Infinity;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || /procShadow/.test(o.name)) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const ranges = (o.userData?.seatRoleRanges ?? []).filter((r) => BODY_EXCLUDED_SEAT_ROLES.includes(r.role));
    const geometry = ranges.length ? bodyGeometryWithout(o.geometry, ranges) : o.geometry;
    const pos = geometry.getAttribute('position'), index = geometry.index;
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i++) {
      top = Math.max(top, v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(o.matrixWorld).y);
    }
  });
  return top;
}

/** The first surface hit along a ray in `frame`'s coordinates, restricted to meshes under `root`. */
function firstHit(root, frame, start, direction, far = 1) {
  root.updateMatrixWorld(true);
  const origin = frame.localToWorld(new THREE.Vector3(...start));
  const dir = new THREE.Vector3(...direction).transformDirection(frame.matrixWorld);
  const hit = new THREE.Raycaster(origin, dir, 0, far).intersectObjects(meshesUnder(root), false)[0];
  return hit ? frame.worldToLocal(hit.point.clone()) : null;
}

for (const quality of ['high', 'low']) {
  const tank = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const named = (name) => {
      const object = tank.root.getObjectByName(name);
      assert.ok(object, `${quality}: ${name} exists`);
      return object;
    };
    const turret = named('rig_turret'), gun = named('rig_gun');
    turret.position.toArray().forEach((v, i) => near(v, LOARA_RING[i], `${quality} drawn yaw axis ${i}`));
    gun.position.toArray().forEach((v, i) => near(v, LOARA_TRUNNION[i], `${quality} drawn elevation axis ${i}`));
    // the two fire anchors on their bores at the brakes' faces, and each bore drawn to that face
    const tip = new THREE.Vector3();
    for (const [index, side] of [[0, -1], [1, 1]]) {
      tank.gunMuzzleWorld(tip, index);
      near(tip.x, side * LOARA_BORE.x, `${quality}: muzzle ${index} across`, 0.01);
      near(tip.y, LOARA_RING[1] + LOARA_TRUNNION[1] + LOARA_BORE.y, `${quality}: muzzle ${index} height`, 0.01);
      near(tip.z, LOARA_RING[2] + LOARA_TRUNNION[2] + LOARA_MUZZLE_Z, `${quality}: muzzle ${index} reach`, 0.01);
      const hit = firstHit(gun, gun, [side * LOARA_BORE.x + 0.05, LOARA_BORE.y, LOARA_MUZZLE_Z + 0.3], [0, 0, -1], 0.6);
      assert.ok(hit, `${quality}: brake ${index} drawn`);
      near(hit.z, LOARA_MUZZLE_Z, `${quality}: bore ${index} ends on the muzzle plane`, 0.02);
    }
    // the envelope is the spec's dims (3 %): the whips left out of the height, as the geometry gate's body
    const bounds = new THREE.Box3();
    for (const mesh of meshesUnder(tank.root)) if (!mesh.userData.shadowOnly && !/procShadow/.test(mesh.name)) {
      bounds.union(new THREE.Box3().setFromObject(mesh));
    }
    const size = bounds.getSize(new THREE.Vector3()), top = bodyTop(tank.root);
    console.log(`${quality}: envelope ${size.z.toFixed(3)} x ${size.x.toFixed(3)} x ${top.toFixed(3)} m (length, width, tallest)`);
    near(size.x, spec.dims.widthM, `${quality}: width`, spec.dims.widthM * 0.03);
    near(size.z, spec.dims.overallLengthM, `${quality}: length`, spec.dims.overallLengthM * 0.03);
    near(top, spec.dims.heightM, `${quality}: tallest (the search radar's array)`, spec.dims.heightM * 0.03);

    // Both guns clear the turret through the whole arc: every gun surface sample (2 cm) keeps 15 mm from every turret
    // surface at each degree from -10 to +85, but the bearing discs and hubs, bodies of revolution about the axis.
    const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
    const grid = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, { cell: 0.05, rq: 0.065 });
    const all = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
    const samples = [];
    for (let i = 0; i < all.length; i += 3) {
      const [x, y, z] = [all[i], all[i + 1], all[i + 2]];
      if (Math.abs(x) < LOARA_GUN_HOUSING.innerX - 0.004 && Math.hypot(y, z) <= LOARA_GUN_HOUSING.discR + 0.002) continue;
      samples.push(x, y, z);
    }
    const [, py, pz] = LOARA_TRUNNION;
    let worst = Infinity, worstPitch = 0, worstAt = null;
    for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg++) {
      const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
      for (let i = 0; i < samples.length; i += 3) {
        const y = samples[i + 1], z = samples[i + 2];
        const d = grid.distance(samples[i], py + y * c + z * s, pz + z * c - y * s);
        if (d < worst) { worst = d; worstPitch = deg; worstAt = [samples[i], y, z].map((n) => +n.toFixed(3)); }
      }
    }
    console.log(`${quality}: the guns keep ${(worst * 1000).toFixed(1)} mm from the turret (worst at ${worstPitch} degrees)`);
    assert.ok(worst >= 0.015, `${quality}: the guns come ${(worst * 1000).toFixed(1)} mm from the turret at ${worstPitch} degrees `
      + `(gun point ${worstAt})`);
  } finally {
    tank.dispose?.();
  }
}

// ---- the guns clear the hull at every bearing from full depression to full elevation (the gun-hull receipt's measure
// and keep; the Loara keeps the full -10 degrees all round: no pitch table)
assert.equal(spec.gunPitchByYawDeg, undefined, 'no depression table: the raised deck clears the guns all round');
const probe = gunHullProbe(ID, { suit: false });
try {
  let worst = { d: Infinity };
  for (let yaw = -180; yaw < 180; yaw += 5) {
    const floor = minimumMechanicalGunPitch(spec, yaw * DEG);
    for (const pitch of [floor, -5 * DEG, 0, 30 * DEG, 60 * DEG, spec.gunElevationDeg * DEG]) {
      const d = probe.distance(yaw * DEG, pitch, GUN_HULL_KEEP_M);
      if (d < worst.d) worst = { d, yaw, pitch: +(pitch / DEG).toFixed(1), part: probe.part };
      assert.ok(d >= GUN_HULL_KEEP_M, `yaw ${yaw}, pitch ${(pitch / DEG).toFixed(1)}: the guns come ${(d * 1000).toFixed(1)} mm `
        + `from ${probe.part}`);
    }
  }
  console.log(`hull: the guns keep ${(worst.d * 1000).toFixed(1)} mm (worst at yaw ${worst.yaw}, pitch ${worst.pitch})`);
} finally {
  probe.dispose();
}
console.log('loara.selftest: the PZA Loara\'s raised deck, ring, elevation axis, twin bores and brakes, three crew and '
  + 'envelope hold at both qualities; both guns clear the turret through -10 to +85 degrees and the hull at every bearing');
