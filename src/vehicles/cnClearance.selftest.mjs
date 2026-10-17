// Release 227 (owner 2026-10-16): "for the qilin and kunlun, make their machine guns much smalelr and make thhem into the
// more classic machine gunn emplacement on the turrets ... make the yun keep all its extra add ons and modifications but
// altered slightly to be wrapped around the type 96b turret base". Round 2 of the CN track: the moving-part clearances,
// measured densely and both ways, so a fix can never pass while a part still goes through another.
//  1. The main gun (every mesh under rig_gun, the recoiling parts at recoil 0 and 0.135 m) keeps 25 mm from every hull
//     mesh (nets included) at every turret yaw (1 degree steps), at the published depression stop for that yaw, at zero
//     and at full elevation.
//  2. The main gun keeps 25 mm from every turret add-on and from the roof station at rest at every legal pitch.
//  3. The turret underside and bustle (every turret mesh below 0.35 m, the ring collar aside) keep 25 mm from the hull
//     at every yaw.
//  4. Each roof station's moving mass (its pitch group at recoil 0 and the presentation's 0.025 m firing recoil, and its
//     yaw stage above the foot) keeps 20 mm from every other turret mesh over its whole published arc and its pitch range
//     [-depression(yaw), elevation], measured with dense surface samples in both directions; the arc and table the
//     builder publishes are the loadout's and the combat anatomy's rows.
//  Negative controls: the Yun's and Kunlun's guns without their depression curves, and the Qilin's station without its
//  depression table, must fail the same checks.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { NATIONAL_ROOF_LOADOUTS } from './nationalRoofConfig.ts';
import { NATIONAL_DONOR_TURRETS } from './nationalDonorTurrets.ts';
import { AUXILIARY_ROOF_GUNS } from './auxiliaryRoofGuns.generated.ts';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';
import { SurfaceGrid, meshTriangles, densePoints, censusPart } from './cnTurretGeometry.test-support.mjs';

const DEG = Math.PI / 180;
const meshesUnder = (obj, exclude = []) => {
  const out = [];
  obj.traverse((o) => { if (!o.isMesh || /Shadow/.test(o.name)) return; for (let p = o; p; p = p.parent) if (exclude.includes(p)) return; out.push(o); });
  return out;
};
/** Edge samples every h along each triangle edge plus centroids (one-way clearance against a surface grid). */
function edgePoints(tri, h) {
  const out = [];
  for (let t = 0; t < tri.length; t += 9) {
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
      const n = Math.max(1, Math.ceil(Math.hypot(tri[t + b] - tri[t + a], tri[t + b + 1] - tri[t + a + 1], tri[t + b + 2] - tri[t + a + 2]) / h));
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) out.push(tri[t + a + k] + (tri[t + b + k] - tri[t + a + k]) * i / n);
    }
    for (let k = 0; k < 3; k++) out.push((tri[t + k] + tri[t + 3 + k] + tri[t + 6 + k]) / 3);
  }
  return new Float64Array(out);
}
const v = new THREE.Vector3();
/** Smallest distance from the points (transformed by M) to the grid's surface, stopping early below `stop`. */
function minDistance(points, M, grid, stop = 0, backZ = 0) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 3) {
    v.set(points[i], points[i + 1], points[i + 2] - backZ).applyMatrix4(M);
    const d = grid.distance(v.x, v.y, v.z); if (d < best) { best = d; if (best < stop) return best; }
  }
  return best;
}
// The donor turrets' ring collars (their builders' own: the Type 96B cylY(1.00, 1.04, 0.15) at y 0.045, the ZTZ-99A2
// cylY(1.08, 1.14, 0.10) at (0, -0.03, -0.12)) bear on the hull's ring race by design: [centre z, radius, top y].
const RING_COLLAR = { type96b: [0, 1.05, .125], ztz99a2: [-.12, 1.15, .025] };
const yawPose = (pos, q, yaw) => new THREE.Matrix4().compose(pos, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)), new THREE.Vector3(1, 1, 1));
const pitchPose = (pos, pitch) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, 0)), new THREE.Vector3(1, 1, 1));

for (const id of ['t72b3_qilin', 't72b3m_kunlun', 't80u_yun']) {
  const spec = getSpec(id), l = NATIONAL_ROOF_LOADOUTS[id];
  const kit = [];
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242,
    partCensus(bucket, g) { const p = censusPart(bucket, g); if (p.role && bucket.startsWith('turret')) kit.push(p); } });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
    const hull = turret.parent;
    let station = null; turret.traverse((o) => { if (!station && o.userData.remoteControlled && o.userData.firingAxis === '+Z') station = o; });
    assert.ok(station, `${id}: one working roof station`);
    const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), hInv = new THREE.Matrix4().copy(hull.matrixWorld).invert();
    const recoiling = new Set(); recoil?.traverse((o) => recoiling.add(o));
    const gunMeshes = meshesUnder(gun);
    const gunFixed = edgePoints(meshTriangles(gunMeshes.filter((m) => !recoiling.has(m)), gInv), .015);
    const gunRecoil = edgePoints(meshTriangles(gunMeshes.filter((m) => recoiling.has(m)), gInv), .015);
    const hullGrid = new SurfaceGrid(meshTriangles(meshesUnder(hull, [turret]), hInv), { cell: .05, rq: .04 });
    const elev = (spec.gunElevationDeg ?? 14) * DEG;
    // ---- 1. the main gun over the hull at every yaw
    const gunHull = (curveSpec) => {
      let worst = { d: Infinity };
      for (let yd = 0; yd < 360; yd++) {
        const yaw = yd * DEG, T = yawPose(turret.position, turret.quaternion, yaw), lo = minimumMechanicalGunPitch(curveSpec, yaw);
        for (const pitch of [lo, 0, elev]) {
          const M = T.clone().multiply(pitchPose(gun.position, pitch));
          for (const [pts, backs] of [[gunFixed, [0]], [gunRecoil, [0, .135]]]) for (const back of backs) {
            const d = minDistance(pts, M, hullGrid, .025, back); if (d < worst.d) worst = { d, yd, pitch };
          }
        }
      }
      return worst;
    };
    const g1 = gunHull(spec);
    assert.ok(g1.d >= .025 - 1e-4, `${id}: the main gun keeps 25 mm from the hull at every yaw (${(g1.d * 1000).toFixed(1)} mm at yaw ${g1.yd}, pitch ${(g1.pitch / DEG).toFixed(2)})`);
    if (spec.gunPitchByYawDeg) {
      const bare = gunHull({ gunDepressionDeg: spec.gunDepressionDeg });
      assert.ok(bare.d < .025, `${id}: negative control: without its depression curve the gun meets the hull (${(bare.d * 1000).toFixed(1)} mm)`);
    }
    // ---- 2. the main gun against the turret add-ons and the station at rest, at every legal pitch
    const deepest = Math.min(...Array.from({ length: 73 }, (_, k) => minimumMechanicalGunPitch(spec, k * Math.PI / 72)));
    // every tagged add-on part of the national fit (turret-local census triangles) and the roof station at rest
    const roofTris = Float64Array.from([...kit.flatMap((p) => Array.from(p.tri)), ...meshTriangles(meshesUnder(station), tInv)]);
    const roofGrid = new SurfaceGrid(roofTris, { cell: .05, rq: .04 });
    let g2 = { d: Infinity };
    for (let pitch = deepest; pitch <= elev + 1e-9; pitch += .5 * DEG) {
      const M = pitchPose(gun.position, pitch);
      for (const [pts, backs] of [[gunFixed, [0]], [gunRecoil, [0, .135]]]) for (const back of backs) {
        const d = minDistance(pts, M, roofGrid, 0, back); if (d < g2.d) g2 = { d, pitch };
      }
    }
    assert.ok(g2.d >= .025 - 1e-4, `${id}: the main gun keeps 25 mm from every add-on and the station at every pitch (${(g2.d * 1000).toFixed(1)} mm at ${(g2.pitch / DEG).toFixed(2)} deg)`);
    // ---- 3. the turret underside and bustle over the hull (the ring collar rides on its race by design)
    const [collarZ, collarR, collarTop] = RING_COLLAR[NATIONAL_DONOR_TURRETS[id].donor];
    const under = [], body = densePoints(meshTriangles(meshesUnder(turret, [gun, station]).filter((m) => !/^vehicleMarking/.test(m.name)), tInv), .02);
    for (let i = 0; i < body.length; i += 3) {
      const x = body[i], y = body[i + 1], z = body[i + 2];
      if (y > .35) continue;
      if (y < collarTop && Math.hypot(x, z - collarZ) < collarR) continue;
      under.push(x, y, z);
    }
    let g3 = { d: Infinity };
    for (let yd = 0; yd < 360; yd += 2) { const d = minDistance(under, yawPose(turret.position, turret.quaternion, yd * DEG), hullGrid, 0); if (d < g3.d) g3 = { d, yd }; }
    assert.ok(g3.d >= .025 - 1e-4, `${id}: the turret underside keeps 25 mm from the hull at every yaw (${(g3.d * 1000).toFixed(1)} mm at yaw ${g3.yd})`);
    // ---- 4. the roof station's moving mass, two ways, over its arc and pitch range
    const pitchGroup = station.getObjectByName('auxiliaryWeaponPitch');
    const others = meshesUnder(turret, [station]).filter((m) => !/^vehicleMarking/.test(m.name));
    const fixedTris = meshTriangles(others, tInv), fixedGrid = new SurfaceGrid(fixedTris, { cell: .04, rq: .03 });
    const pitchMeshes = [], yawMeshes = [];
    station.traverse((o) => { if (!o.isMesh || /Shadow/.test(o.name)) return; let inPitch = false; for (let p = o; p; p = p.parent) if (p === pitchGroup) inPitch = true; (inPitch ? pitchMeshes : yawMeshes).push(o); });
    const pInv = new THREE.Matrix4().copy(pitchGroup.matrixWorld).invert(), sInv = new THREE.Matrix4().copy(station.matrixWorld).invert();
    const pitchTris = meshTriangles(pitchMeshes, pInv), yawTris = meshTriangles(yawMeshes, sInv);
    const pitchPts = densePoints(pitchTris, .015), pitchGrid = new SurfaceGrid(pitchTris, { cell: .04, rq: .03 });
    const yawAll = densePoints(yawTris, .015), yawPts = [];
    for (let i = 0; i < yawAll.length; i += 3) if (yawAll[i + 1] > .06) yawPts.push(yawAll[i], yawAll[i + 1], yawAll[i + 2]);
    const yawGrid = new SurfaceGrid(yawTris, { cell: .04, rq: .03 });
    const sp = station.position, nearAll = [];
    { const d = densePoints(fixedTris, .015); for (let i = 0; i < d.length; i += 3) if (Math.hypot(d[i] - sp.x, d[i + 2] - sp.z) < 1.45 && d[i + 1] > sp.y - .15) nearAll.push(d[i], d[i + 1], d[i + 2]); }
    const near = Float64Array.from(nearAll);
    const profile = auxiliaryWeaponProfile(station.userData.caliberMm, id);
    const arc = station.userData.yawArc ?? [-Math.PI, Math.PI];
    const depAt = (table) => (yaw) => { if (!table || yaw < table[0][0] || yaw > table.at(-1)[0]) return profile.depressionRad;
      for (let i = 1; i < table.length; i++) if (yaw <= table[i][0]) return Math.min(profile.depressionRad, table[i - 1][1], table[i][1]); return profile.depressionRad; };
    const restP = pitchGroup.position.clone();
    const sweep = (dep, stopBelow = 0) => {
      let worst = { d: Infinity };
      for (let yaw = arc[0]; yaw <= arc[1] + 1e-9; yaw += 1.5 * DEG) {
        const S = yawPose(station.position, station.quaternion, yaw), Si = S.clone().invert();
        let d = Math.min(minDistance(yawPts, S, fixedGrid, stopBelow), (() => { let b = Infinity; for (let i = 0; i < near.length; i += 3) { v.set(near[i], near[i + 1], near[i + 2]).applyMatrix4(Si); if (v.y > .06) b = Math.min(b, yawGrid.distance(v.x, v.y, v.z)); } return b; })());
        if (d < worst.d) worst = { d, yaw, el: 'yaw stage' };
        const dp = dep(yaw);
        for (const el of [-dp, -dp / 2, 0, .25, .5, profile.elevationRad]) for (const rc of [0, .025]) {
          const M = S.clone().multiply(pitchPose(new THREE.Vector3(restP.x, restP.y, restP.z - rc), el)), Mi = M.clone().invert();
          d = minDistance(pitchPts, M, fixedGrid, stopBelow);
          if (d >= stopBelow) for (let i = 0; i < near.length; i += 3) { v.set(near[i], near[i + 1], near[i + 2]).applyMatrix4(Mi); d = Math.min(d, pitchGrid.distance(v.x, v.y, v.z)); if (d < stopBelow) break; }
          if (d < worst.d) worst = { d, yaw, el, rc };
          if (worst.d < stopBelow) return worst;
        }
      }
      return worst;
    };
    const s4 = sweep(depAt(station.userData.depressionByYaw));
    assert.ok(s4.d >= .020 - 1e-4, `${id}: ${station.name} moving mass keeps 20 mm from the turret over its arc (${(s4.d * 1000).toFixed(1)} mm at yaw ${(s4.yaw / DEG).toFixed(1)}, el ${typeof s4.el === 'number' ? (s4.el / DEG).toFixed(1) : s4.el})`);
    if (station.userData.depressionByYaw) {
      const bare = sweep(depAt(null), .020);
      assert.ok(bare.d < .020, `${id}: negative control: without its depression table the station meets the turret (${(bare.d * 1000).toFixed(1)} mm)`);
    }
    // the published arc and table are the loadout's and the combat anatomy's
    assert.deepEqual(station.userData.yawArc ?? null, l.yawArc ? [...l.yawArc] : null, `${id}: the built station publishes the loadout's arc`);
    assert.deepEqual(station.userData.depressionByYaw ?? null, l.depressionByYaw ? l.depressionByYaw.map((r) => [...r]) : null, `${id}: the built station publishes the loadout's table`);
    const row = AUXILIARY_ROOF_GUNS[id];
    assert.deepEqual(row?.yawArc ?? null, l.yawArc ? [...l.yawArc] : null, `${id}: the combat anatomy carries the station's arc`);
    assert.deepEqual(row?.depressionByYaw ?? null, l.depressionByYaw ? l.depressionByYaw.map((r) => [...r]) : null, `${id}: the combat anatomy carries the station's table`);
    console.log(`${id}: gun/hull ${(g1.d * 1000).toFixed(1)} mm, gun/roof ${(g2.d * 1000).toFixed(1)} mm, underside ${(g3.d * 1000).toFixed(1)} mm, station ${(s4.d * 1000).toFixed(1)} mm over ${((arc[1] - arc[0]) / DEG).toFixed(0)} deg PASS`);
  } finally { tank.dispose(); }
}
console.log('cnClearance: the CN guns, undersides and roof stations clear everything they sweep past PASS');
