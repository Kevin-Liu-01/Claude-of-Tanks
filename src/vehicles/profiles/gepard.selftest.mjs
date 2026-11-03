// Flakpanzer Gepard 1A2 (268, builder G; the owner 2026-11-02: "we should add more double barrel vehicels"): the native
// fixture of profiles/gepard.ts at both qualities. Its combat frame is its drawn frame (the ring, the elevation bearing,
// the twin bores and their muzzle heads, all from profiles/gepardFrame.ts), its crew the Gepard's three, its tallest point
// the published 4.22 m with the search radar raised and its length with the guns forward the published 7.68-7.76 m
// (docs/references/tanks/gepard_1a2.md), and both guns clear the turret through the whole -10 to +85 degree arc and the
// hull at every bearing.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { INTERNAL_LAYOUT_BY_TANK } from '../internalLayoutRegistry.ts';
import { combatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';
import { SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';
import { BODY_EXCLUDED_SEAT_ROLES, bodyGeometryWithout } from '../../../tools/body-height-parts.mjs';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import {
  GEPARD_BORE, GEPARD_GUN_COVER, GEPARD_MUZZLE_Z, GEPARD_RING, GEPARD_SEARCH_RADAR, GEPARD_TRUNNION, GEPARD_TURRET,
} from './gepardFrame.ts';

const ID = 'gepard_1a2';
const DEG = Math.PI / 180;
const near = (actual, expected, label, tolerance = 0.002) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} against ${expected}`);

// ---- the combat frame is the drawn frame
const spec = getSpec(ID);
assert.equal(spec.name, 'Flakpanzer Gepard 1A2');
assert.equal(spec.nation, 'Germany');
spec.armor.turretPivot.forEach((v, i) => near(v, GEPARD_RING[i], `turret pivot ${i}`));
spec.armor.gunPivot.forEach((v, i) => near(v, GEPARD_TRUNNION[i], `elevation bearing ${i}`));
near(spec.armor.gunBarrel.lengthM, GEPARD_MUZZLE_Z, 'barrel length to the muzzle heads');
assert.deepEqual(spec.gun.muzzles.map((m) => [m.x, m.y]), [[-GEPARD_BORE.x, GEPARD_BORE.y], [GEPARD_BORE.x, GEPARD_BORE.y]],
  'one bore per KDA, right then left');
assert.equal(spec.gun.launcherMuzzles, undefined, 'the 1A2 carries no missiles');
assert.equal(spec.gun.caliberMm, 35);
assert.equal(spec.gunElevationDeg, 85);
assert.equal(spec.gunDepressionDeg, 10);
// three crew: the driver in the hull, the gunner (left) and the commander (right) in the turret's upper body
const layout = INTERNAL_LAYOUT_BY_TANK[ID];
assert.equal(layout.layoutKey, 'spaaGepard');
assert.deepEqual(layout.crew.map((c) => c.role).sort(), ['commander', 'driver', 'gunner']);
const T = GEPARD_TURRET;
// the turret crew's boxes are their fitted seats once the anatomy row exists (crew-seat-fit, crewSeats): inside the
// turret's plan with the head in its upper body under the roof, the legs down through the ring into the basket, never
// below the hull's floor
const hullFloorY = combatAnatomyCalibration(ID).hull.min[1] - GEPARD_RING[1];
assert.deepEqual(spec.armor.crew.filter((c) => c.turretLocal).map((c) => c.crew).sort(), ['commander', 'gunner']);
for (const box of spec.armor.crew.filter((c) => c.turretLocal)) {
  assert.ok(box.min[0] >= -T.bodyHalfW && box.max[0] <= T.bodyHalfW && box.max[1] > T.floorY && box.max[1] <= T.roofY
    && box.min[1] >= hullFloorY && box.min[2] >= T.rearFrontZ - 0.80 && box.max[2] <= T.frontZ,
  `${box.crew} sits inside the turret`);
}
assert.ok(spec.armor.crew.find((c) => c.crew === 'gunner').min[0] > 0, 'the gunner on the left (+x)');
// the turret's plates stay on the drawn shell's envelope: its plan and roof, its floor where the anatomy row measures
// the seated underside (the turret seated over its ring), the crew's measured cupolas standing on the roof
const seatedFloorY = Math.min(T.floorY, combatAnatomyCalibration(ID).turret.min[1]);
for (const p of spec.armor.turretPlates) for (const [x, y, z] of p.verts) {
  const topY = /cupola/.test(p.name) ? T.roofY + 0.10 : T.roofY;
  assert.ok(Math.abs(x) <= T.rearHalfW + 1e-9 && y >= seatedFloorY - 1e-9 && y <= topY + 1e-9 && z >= T.rearZ - 1e-9
    && z <= T.frontZ + 1e-9, `${p.name} within the drawn turret`);
}

/** The highest point of the visible body (whips left out, as the geometry gate's body: tools/body-height-parts.mjs). */
function bodyTop(root) {
  let top = -Infinity;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || /procShadow/.test(o.name)) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const ranges = (o.userData?.seatRoleRanges ?? []).filter((r) => BODY_EXCLUDED_SEAT_ROLES.includes(r.role));
    // (the cut body shares the merged mesh's vertices: its index names the kept corners)
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
    turret.position.toArray().forEach((v, i) => near(v, GEPARD_RING[i], `${quality} drawn yaw axis ${i}`));
    gun.position.toArray().forEach((v, i) => near(v, GEPARD_TRUNNION[i], `${quality} drawn elevation axis ${i}`));
    // the two fire anchors on their bores at the muzzle heads (7.72 m overall with the guns forward)
    const tip = new THREE.Vector3();
    for (const [index, side] of [[0, -1], [1, 1]]) {
      tank.gunMuzzleWorld(tip, index);
      near(tip.x, side * GEPARD_BORE.x, `${quality}: muzzle ${index} across`, 0.01);
      near(tip.y, GEPARD_RING[1] + GEPARD_TRUNNION[1] + GEPARD_BORE.y, `${quality}: muzzle ${index} height`, 0.01);
      near(tip.z, GEPARD_RING[2] + GEPARD_TRUNNION[2] + GEPARD_MUZZLE_Z, `${quality}: muzzle ${index} reach`, 0.01);
    }
    const box = new THREE.Box3().setFromObject(tank.root);
    const length = box.max.z - box.min.z;
    assert.ok(length >= 7.68 * 0.995 && length <= 7.76 * 1.005, `${quality}: ${length.toFixed(3)} m overall, guns forward`);
    // tallest: the search radar's reflector raised to the published 4.22 m (1 %), the whips left out
    const top = bodyTop(tank.root);
    near(top, GEPARD_RING[1] + GEPARD_SEARCH_RADAR.topY, `${quality}: tallest`, 0.0422);
    near(GEPARD_RING[1] + GEPARD_SEARCH_RADAR.topY, 4.22, 'the raised radar\'s published height', 0.005);

    // Both guns clear the turret through the whole arc: every gun surface sample (2 cm) keeps 15 mm from every turret
    // surface at each degree from -10 to +85, but the bearing hubs, which turn in the body's flank about their own axis.
    const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
    const turretTri = meshTriangles(meshesUnder(turret, [gun]), tInv).tri;
    const grid = new SurfaceGrid(turretTri, { cell: 0.05, rq: 0.065 });
    const all = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
    const samples = [];
    for (let i = 0; i < all.length; i += 3) {
      const [x, y, z] = [all[i], all[i + 1], all[i + 2]];
      if (Math.abs(x) < GEPARD_GUN_COVER.innerX && Math.hypot(y, z) < 0.16) continue; // the hub, coaxial
      samples.push(x, y, z);
    }
    const [, py, pz] = GEPARD_TRUNNION;
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
  } finally {
    tank.dispose?.();
  }
}

// ---- the guns clear the hull at every bearing from the published stop (sim/gunPitchLimits.ts: the full -10 degrees
// but over the engine deck and stern, where the muzzle heads meet the outlets' and exhaust's covers) to full elevation
// (the gun-hull receipt's measure and keep; nationalGunClearance.selftest.mjs holds every degree)
const probe = gunHullProbe(ID, { suit: false });
try {
  for (let yaw = -180; yaw < 180; yaw += 5) {
    const floor = minimumMechanicalGunPitch(spec, yaw * DEG);
    for (const pitch of [floor, 0, 30 * DEG, 60 * DEG, spec.gunElevationDeg * DEG]) {
      const d = probe.distance(yaw * DEG, pitch, GUN_HULL_KEEP_M);
      assert.ok(d >= GUN_HULL_KEEP_M, `yaw ${yaw}, pitch ${(pitch / DEG).toFixed(1)}: the guns come ${(d * 1000).toFixed(1)} mm `
        + `from ${probe.part}`);
    }
  }
} finally {
  probe.dispose();
}
console.log('gepard.selftest: the Gepard 1A2\'s ring, bearing, twin bores and muzzle heads, three crew, the 4.22 m radar '
  + 'and 7.7 m length hold at both qualities; both guns clear the turret through -10 to +85 degrees and the hull from '
  + 'their published stops');
