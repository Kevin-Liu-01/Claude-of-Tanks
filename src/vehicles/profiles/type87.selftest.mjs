// Type 87 self-propelled anti-aircraft gun (269, builder J; the owner 2026-11-03: "also add the Japanese type 87 SPAAG"):
// the native fixture of profiles/type87.ts at both qualities. Its combat frame is its drawn frame (the Type 74 hull's
// ring, the guns' elevation axis at the pods' fronts, the twin bores and their brake faces, all from
// profiles/type87Frame.ts), its crew the Type 87's three, its hull the Type 74's with the enlarged hull's overhung stern
// (the hull's stern plates carried there), its tallest point the published 4.40 m with both radars raised and its length
// with the guns forward the published 7.99 m (docs/references/tanks/type87_aw.md); both guns clear the turret (its fixed
// pods, cheeks and radars) through the whole -5 to +85 degree arc and the hull at every bearing.
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { INTERNAL_LAYOUT_BY_TANK } from '../internalLayoutRegistry.ts';
import { armorVolumeOverflows } from '../armorInterior.ts';
import { combatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';
import { SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';
import { BODY_EXCLUDED_SEAT_ROLES, bodyGeometryWithout } from '../../../tools/body-height-parts.mjs';
import { TYPE74_HULL_STATIONS as HULL } from './type74Family.ts';
import {
  TYPE87_GUNS as G, TYPE87_HULL as H, TYPE87_RADARS as R, TYPE87_RING as RING, TYPE87_TRUNNION as AXIS, TYPE87_TURRET as T,
} from './type87Frame.ts';

const ID = 'type87_aw';
const DEG = Math.PI / 180;
const near = (actual, expected, label, tolerance = 0.002) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} against ${expected}`);

// ---- the combat frame is the drawn frame
const spec = getSpec(ID);
assert.equal(spec.name, 'Type 87 Self-Propelled Anti-Aircraft Gun');
assert.equal(spec.nation, 'Japan');
spec.armor.turretPivot.forEach((v, i) => near(v, RING[i], `turret pivot ${i}`));
spec.armor.gunPivot.forEach((v, i) => near(v, AXIS[i], `elevation axis ${i}`));
near(spec.armor.gunBarrel.lengthM, G.muzzleZ, 'barrel length to the brakes\' faces');
assert.deepEqual(spec.gun.muzzles.map((m) => [m.x, m.y]), [[-G.boreX, 0], [G.boreX, 0]], 'one bore per KDA, right then left');
assert.equal(spec.gun.launcherMuzzles, undefined, 'the Type 87 carries no missiles');
assert.equal(spec.gun.caliberMm, 35);
assert.equal(spec.gunElevationDeg, 85);
assert.equal(spec.gunDepressionDeg, 5);
// three crew: the driver in the hull, the gunner (left, +x) and the commander (right) in the central body under their
// hatches
const layout = INTERNAL_LAYOUT_BY_TANK[ID];
assert.equal(layout.layoutKey, 'spaaType87');
assert.deepEqual(layout.crew.map((c) => c.role).sort(), ['commander', 'driver', 'gunner']);
assert.deepEqual(spec.armor.crew.filter((c) => c.turretLocal).map((c) => c.crew).sort(), ['commander', 'gunner']);
// in the central body or the basket under it: the fleet's seat fitter (tools/crew-seat-fit.mjs) seats turret crew down
// through the ring, and internalPlacement.selftest.mjs holds every interior volume to armorInterior.ts's turret-or-basket rule
const overflows = armorVolumeOverflows(spec.armor, combatAnatomyCalibration(ID)?.turretRing);
for (const box of spec.armor.crew.filter((c) => c.turretLocal)) {
  const out = Math.max(...overflows.filter((part) => part.turretLocal && part.name === box.crew).map((part) => part.overflow));
  assert.ok(out <= 0.15, `${box.crew} sits inside the central body or the basket under it (${out.toFixed(3)} m out)`);
}
assert.ok(spec.armor.crew.find((c) => c.crew === 'gunner').min[0] > 0, 'the gunner on the left (+x)');
// the driver on the left (photos 03, 05), the radio module beside him moved with him off the APU's side
const driver = spec.armor.crew.find((c) => c.crew === 'driver' && !c.turretLocal);
assert.ok(Math.sign(driver.min[0] + driver.max[0]) === H.driverSide, 'the driver on the Type 87\'s side');
const radio = spec.armor.modules.find((m) => m.module === 'radio' && !m.turretLocal);
assert.ok(!radio || radio.max[0] <= driver.min[0] || radio.min[0] >= driver.max[0], 'the hull radio clear of the driver');
// the search antenna stands just over the tracking dish's rim (photos 03, 05, 06: about 0.05 m)
const rim = R.dishY + R.dishR * Math.cos(R.dishTiltDeg * Math.PI / 180);
assert.ok(R.antennaBottomY - rim >= 0.03 && R.antennaBottomY - rim <= 0.07, `the antenna ${(R.antennaBottomY - rim).toFixed(3)} m over the dish`);
// the turret's plates stay on the drawn shell's envelope (the body, the cheeks and the fixed pods)
for (const p of spec.armor.turretPlates) for (const [x, y, z] of p.verts) {
  assert.ok(Math.abs(x) <= T.podOuterX + 1e-9 && y >= T.floorY - 1e-9 && y <= T.podFrontTopY + 1e-9 && z >= T.rearZ - 1e-9
    && z <= T.faceZ + 1e-9, `${p.name} within the drawn turret`);
}
// the hull's stern plates follow the enlarged hull's overhung stern (profiles/type74Family.ts Type74FamilyOptions): the
// upper face at the deck's end, the lower plate raked forward to the belly
const sternAt = (y) => H.sternZ + (y >= HULL.overhungSternFootY ? 0 : y >= HULL.overhungSternKneeY
  ? HULL.overhungSternKneeZ * (HULL.overhungSternFootY - y) / (HULL.overhungSternFootY - HULL.overhungSternKneeY)
  : HULL.overhungSternKneeZ + (HULL.overhungSternToeZ - HULL.overhungSternKneeZ)
    * Math.min(1, (HULL.overhungSternKneeY - y) / (HULL.overhungSternKneeY - HULL.bellyY)));
const rear = spec.armor.hullPlates.find((p) => p.name === 'hull_rear');
for (const [, y, z] of rear.verts) near(z, sternAt(y), `the hull's rear plate at y ${y}`, 1e-6);
for (const p of spec.armor.hullPlates) if (!/^track/.test(p.name)) {
  for (const [, y, z] of p.verts) if (z < -3.0) near(z, sternAt(y), `${p.name}'s stern vertex at y ${y}`, 1e-6);
}
for (const p of spec.armor.hullPlates) {
  const minZ = Math.min(...p.verts.map((v) => v[2]));
  if (/^track/.test(p.name)) assert.ok(minZ > -3.5, `${p.name} keeps the running gear's length`);
  else assert.ok(minZ >= H.sternZ - 1e-9, `${p.name} inside the enlarged hull`);
}
near(spec.dims.hullLengthM, 3.37 - H.sternZ + H.basketDepth, 'the enlarged hull\'s length', 0.01);

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
    turret.position.toArray().forEach((v, i) => near(v, RING[i], `${quality} drawn yaw axis ${i}`));
    gun.position.toArray().forEach((v, i) => near(v, AXIS[i], `${quality} drawn elevation axis ${i}`));
    // the two fire anchors on their bores at the brakes' faces
    const tip = new THREE.Vector3();
    for (const [index, side] of [[0, -1], [1, 1]]) {
      tank.gunMuzzleWorld(tip, index);
      near(tip.x, side * G.boreX, `${quality}: muzzle ${index} across`, 0.01);
      near(tip.y, RING[1] + AXIS[1], `${quality}: muzzle ${index} height`, 0.01);
      near(tip.z, RING[2] + AXIS[2] + G.muzzleZ, `${quality}: muzzle ${index} reach`, 0.01);
    }
    // the envelope: the published 7.99 m with the guns forward and 3.18 m across (1 %); the enlarged hull's stern
    const box = new THREE.Box3().setFromObject(tank.root);
    const length = box.max.z - box.min.z, width = box.max.x - box.min.x;
    near(length, 7.99, `${quality}: ${length.toFixed(3)} m overall, guns forward`, 0.08);
    assert.ok(width <= 3.18 * 1.01, `${quality}: ${width.toFixed(3)} m across`);
    const hullBox = new THREE.Box3();
    for (const mesh of meshesUnder(tank.root, [turret])) hullBox.union(new THREE.Box3().setFromObject(mesh));
    const sternBack = H.sternZ - H.basketDepth;
    assert.ok(hullBox.min.z <= sternBack + 1e-3 && hullBox.min.z >= sternBack - 0.05,
      `${quality}: the hull ends at the enlarged stern's basket (${hullBox.min.z.toFixed(3)})`);
    // tallest: the search radar's antenna raised to the published 4.40 m (1 %), the whips left out
    const top = bodyTop(tank.root);
    near(top, RING[1] + R.antennaTopY, `${quality}: tallest`, 0.01);
    near(top, 4.40, `${quality}: the raised radar's published height`, 0.044);

    // Both guns clear the turret through the whole arc: every gun surface sample (2 cm) keeps 15 mm from every turret
    // surface at each degree from -5 to +85 (round 3: no trunnion shaft left to except).
    const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
    const grid = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, { cell: 0.05, rq: 0.065 });
    const all = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
    const samples = [];
    for (let i = 0; i < all.length; i += 3) samples.push(all[i], all[i + 1], all[i + 2]);
    const [, py, pz] = AXIS;
    let worst = Infinity, worstPitch = 0;
    for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg++) {
      const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
      for (let i = 0; i < samples.length; i += 3) {
        const y = samples[i + 1], z = samples[i + 2];
        const d = grid.distance(samples[i], py + y * c + z * s, pz + z * c - y * s);
        if (d < worst) { worst = d; worstPitch = deg; }
      }
    }
    assert.ok(worst >= 0.015, `${quality}: the guns come ${(worst * 1000).toFixed(1)} mm from the turret at ${worstPitch} degrees`);
    console.log(`${quality}: ${length.toFixed(3)} m long, ${width.toFixed(3)} m wide, ${top.toFixed(3)} m tall; the guns keep `
      + `${(worst * 1000).toFixed(0)} mm from the turret (at ${worstPitch} degrees)`);
  } finally {
    tank.dispose?.();
  }
}

// ---- the guns clear the hull at every 5 degrees of yaw and pitch, full depression to full elevation (the gun-hull
// receipt's measure and keep)
const probe = gunHullProbe(ID, { suit: false });
try {
  let worst = { d: Infinity };
  const pitches = [];
  for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg += 5) pitches.push(deg * DEG);
  for (let yd = 0; yd <= 180; yd += 5) for (const sign of yd % 180 ? [-1, 1] : [1]) {
    for (const pitch of pitches) {
      const d = probe.distance(sign * yd * DEG, pitch, GUN_HULL_KEEP_M);
      if (d < worst.d) worst = { d, yaw: sign * yd, pitch: +(pitch / DEG).toFixed(1), part: probe.part };
    }
  }
  assert.ok(worst.d >= GUN_HULL_KEEP_M, `the guns keep ${GUN_HULL_KEEP_M} m from the hull (worst ${worst.d.toFixed(3)} at yaw `
    + `${worst.yaw}, pitch ${worst.pitch}, ${worst.part})`);
} finally {
  probe.dispose();
}
console.log('type87.selftest: the Type 87\'s ring, elevation axis, twin bores and brake faces, three crew, the enlarged '
  + 'hull\'s stern, the 4.40 m radar and 7.99 m length hold at both qualities; both guns clear the turret through -5 to +85 '
  + 'degrees and the hull at every bearing');
