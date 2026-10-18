// Release 227 (owner 2026-10-16): "for the qilin and kunlun, make their machine guns much smalelr and make thhem into the
// more classic machine gunn emplacement on the turrets ... make the yun keep all its extra add ons and modifications but
// altered slightly to be wrapped around the type 96b turret base". The CN track's moving-part clearances, measured
// densely, so a fix can never pass while a part still goes through another. Each tank is built once and every check
// reads that build.
//  1. The main gun (every mesh under rig_gun, the recoiling parts at recoil 0 and 0.135 m) keeps 25 mm from every hull
//     mesh (nets included) at every turret yaw, at the published depression stop for that yaw, at zero and at full
//     elevation (the boot over the driver's hatch at full elevation, the barrel over the deck and the Yun's cooling-panel
//     slats). Yaw is swept at 5 degrees and refined at 1 degree within 6 degrees of any sample under 60 mm, of every
//     depression-curve breakpoint and over the rear deck (165-195 degrees); the hull is cut to the gun's swept annulus.
//  2. The main gun keeps 25 mm from every turret add-on (tagged kit parts) and from the roof station at rest at every
//     legal pitch.
//  3. The turret's underside and bustle (every turret mesh below 0.35 m) keep 20 mm from the hull at every yaw (the
//     coordinator's plan; the 96B's lower side edge passes 21.7 mm over the Kunlun's driver's hatch at yaw 252); the ring
//     collar is excused only inside its own circle on the pivot (it bears on the deck's ring race); that circle must be
//     concentric with the pivot, and its skirt keeps 20 mm from every fender, sponson, hatch and cover at every yaw.
//  4. Each roof station's moving mass (its pitch group at recoil 0 and the presentation's 0.025 m firing recoil, and its
//     yaw stage above the foot; round 4, critic CN3-D1: a riding-cradle emplacement's gun recoils 12 mm alone, so round
//     each minimum its whole pitch group is also posed at half and full that stroke, which holds the gun's every real
//     pose and the cradle beyond its own) keeps 25 mm from every other turret mesh over its whole published arc and its pitch
//     range [-depression(yaw), elevation]: 2-degree yaw steps by 0.05 rad pitch steps one way (the moving surface's
//     30 mm samples against the fixed stock), then both ways (15 mm samples of each against the other) at 0.5-degree by
//     0.0125 rad steps round every local minimum under 75 mm. The arc and table the builder publishes are the loadout's and the
//     combat anatomy's rows.
//  5. Every Type 96B donor (Kunlun, Yun) sets boxSightOnGun: its box sight rides the boot on the gun's pitch group, seated (no gap
//     anywhere under it, the saddle no more than 5 mm into the boot), and keeps 10 mm from every turret mesh over the
//     whole pitch range.
//  Negative controls must fail the same checks: the Yun's and Kunlun's guns without their depression curves, the Qilin's
//  station without its depression table, the fleet Type 96B's turret-fixed box sight (inside its boot), and the fleet
//  99A2 collar on the Qilin (0.12 m off the pivot, sweeping into the B3's fenders).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { NATIONAL_ROOF_LOADOUTS } from './nationalRoofConfig.ts';
import { NATIONAL_DONOR_TURRETS } from './nationalDonorTurrets.ts';
import { AUXILIARY_ROOF_GUNS } from './auxiliaryRoofGuns.generated.ts';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';
import { SurfaceGrid, meshTriangles, densePoints, censusPart, insideClosed } from './cnTurretGeometry.test-support.mjs';

const DEG = Math.PI / 180, T0 = Date.now();
const secs = (t) => ((Date.now() - t) / 1000).toFixed(0);
const progress = (id, what) => { if (process.env.CN_CLEARANCE_PROGRESS) console.error(`  ${id}: ${what}`); };
const meshesUnder = (obj, exclude = []) => {
  const out = [];
  obj.traverse((o) => { if (!o.isMesh || /Shadow/.test(o.name)) return; for (let p = o; p; p = p.parent) if (exclude.includes(p)) return; out.push(o); });
  return out;
};
const v = new THREE.Vector3();
/** Smallest distance from the points (transformed by M, optionally pushed back along -Z first) to the grid's surface,
 * stopping early below `stop`. */
function minDistance(points, M, grid, stop = 0, backZ = 0) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 3) {
    v.set(points[i], points[i + 1], points[i + 2] - backZ).applyMatrix4(M);
    const d = grid.distance(v.x, v.y, v.z); if (d < best) { best = d; if (best < stop) return best; }
  }
  return best;
}
/** The triangles of a soup with a vertex inside the cylinder r <= reach round (cx, cz), y in [y0, y1] (or crossing it). */
function annulus(tris, cx, cz, reach, y0, y1) {
  const out = [];
  for (let t = 0; t < tris.length; t += 9) {
    let lo = Infinity, hi = -Infinity, near = Infinity;
    for (let k = 0; k < 9; k += 3) { lo = Math.min(lo, tris[t + k + 1]); hi = Math.max(hi, tris[t + k + 1]); near = Math.min(near, Math.hypot(tris[t + k] - cx, tris[t + k + 2] - cz)); }
    // a triangle larger than the cylinder may cross it with every vertex outside: keep any whose box reaches it
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 9; k += 3) { x0 = Math.min(x0, tris[t + k]); x1 = Math.max(x1, tris[t + k]); z0 = Math.min(z0, tris[t + k + 2]); z1 = Math.max(z1, tris[t + k + 2]); }
    const boxNear = Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(z0 - cz, 0, cz - z1));
    if (hi < y0 || lo > y1 || Math.min(near, boxNear) > reach) continue;
    for (let k = 0; k < 9; k++) out.push(tris[t + k]);
  }
  return new Float64Array(out);
}
const yawPose = (pos, q, yaw) => new THREE.Matrix4().compose(pos, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)), new THREE.Vector3(1, 1, 1));
const pitchPose = (pos, pitch) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, 0)), new THREE.Vector3(1, 1, 1));
/** Yaw (degrees) refinement: the 5-degree samples, then 1-degree steps round every sample under `near`, round each
 * extra centre, and over the extra ranges. */
function yawSweep(measure, { near = .060, centres = [], ranges = [], stop = 0 } = {}) {
  const seen = new Map(), at = (yd) => { yd = ((yd % 360) + 360) % 360; if (!seen.has(yd)) seen.set(yd, measure(yd)); return seen.get(yd); };
  let worst = { d: Infinity };
  const take = (yd) => { const r = at(yd); if (r.d < worst.d) worst = { ...r, yd: ((yd % 360) + 360) % 360 }; return r; };
  for (let yd = 0; yd < 360; yd += 5) if (take(yd).d < stop) return worst;
  const refine = new Set();
  for (const [yd, r] of [...seen]) if (r.d < near) for (let k = -6; k <= 6; k++) refine.add(yd + k);
  for (const c of centres) for (let k = -6; k <= 6; k++) refine.add(Math.round(c) + k);
  for (const [a, b] of ranges) for (let yd = a; yd <= b; yd++) refine.add(yd);
  for (const yd of refine) if (take(yd).d < stop) return worst;
  return worst;
}

// The fleet Type 96B: its turret-fixed box sight stands inside its pitching boot (the negative control for check 5).
function boxSightInsideFleetBoot() {
  const parts = [];
  const tank = createTank('type96b', null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242, partCensus(b, g) { parts.push(censusPart(b, g)); } });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const sight = parts.filter((p) => p.bucket === 'turretDetail' && Math.abs(p.box.min.x + p.box.max.x) < .01 && Math.abs(p.box.max.x - p.box.min.x - .25) < .002
      && Math.abs(p.box.max.z - p.box.min.z - .396) < .002);
    assert.equal(sight.length, 1, 'type96b: its box sight');
    // the boot (added outside the census on the fleet build) is the mantlet bucket's mesh under rig_gun
    const recoilRig = tank.root.getObjectByName('rig_recoil'), boot = meshesUnder(gun, recoilRig ? [recoilRig] : []);
    assert.ok(boot.length, 'type96b: the pitching mantlet and boot under rig_gun');
    const bootTris = meshTriangles(boot, new THREE.Matrix4().copy(turret.matrixWorld).invert());
    const grid = new SurfaceGrid(bootTris, { cell: .04, rq: .08 }), solid = { tri: bootTris, box: new THREE.Box3().setFromArray(bootTris) };
    // the sight's bottom face: how deep inside the boot do its samples lie at rest (ray parity, both faces counted)
    const pts = densePoints(sight[0].tri, .01);
    let deepest = 0;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i + 1] > sight[0].box.min.y + 1e-6) continue;
      if (insideClosed(solid, pts[i], pts[i + 1], pts[i + 2])) deepest = Math.max(deepest, grid.distance(pts[i], pts[i + 1], pts[i + 2]));
    }
    return deepest;
  } finally { tank.dispose(); }
}

// CN_CLEARANCE_IDS=<ids> limits a local run (the suite runs all three)
for (const id of (process.env.CN_CLEARANCE_IDS ?? 't72b3_qilin,t72b3m_kunlun,t80u_yun').split(',')) {
  const t0 = Date.now(), spec = getSpec(id), l = NATIONAL_ROOF_LOADOUTS[id], donor = NATIONAL_DONOR_TURRETS[id];
  const kit = [], census = [];
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242,
    partCensus(bucket, g) { const p = censusPart(bucket, g); census.push(p); if (p.role && bucket.startsWith('turret')) kit.push(p); } });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
    const hull = turret.parent;
    let station = null; turret.traverse((o) => { if (!station && o.userData.remoteControlled && o.userData.firingAxis === '+Z') station = o; });
    assert.ok(station, `${id}: one working roof station`);
    const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), hInv = new THREE.Matrix4().copy(hull.matrixWorld).invert();
    const recoiling = new Set(); recoil?.traverse((o) => recoiling.add(o));
    const gunMeshes = meshesUnder(gun);
    const gunFixedTris = meshTriangles(gunMeshes.filter((m) => !recoiling.has(m)), gInv), gunRecoilTris = meshTriangles(gunMeshes.filter((m) => recoiling.has(m)), gInv);
    const gunFixed = densePoints(gunFixedTris, .015), gunRecoil = densePoints(gunRecoilTris, .015);
    // the gun's reach from the turret axis (hull frame): its farthest point plus the recoil travel
    let reach = 0; for (const T of [gunFixedTris, gunRecoilTris]) for (let i = 0; i < T.length; i += 3) reach = Math.max(reach, Math.hypot(T[i], T[i + 1], T[i + 2] + gun.position.z));
    const ring = turret.position;
    const hullAll = meshTriangles(meshesUnder(hull, [turret]), hInv);
    const gunHullGrid = new SurfaceGrid(annulus(hullAll, ring.x, ring.z, reach + .30, ring.y - .60, ring.y + .90), { cell: .05, rq: .065 });
    const elev = (spec.gunElevationDeg ?? 14) * DEG;
    // ---- 1. the main gun over the hull at every yaw
    const gunHull = (curveSpec, stop = 0) => {
      const curve = curveSpec.gunPitchByYawDeg ?? [];
      return yawSweep((yd) => {
        const yaw = yd * DEG, T = yawPose(turret.position, turret.quaternion, yaw), lo = minimumMechanicalGunPitch(curveSpec, yaw);
        let r = { d: Infinity };
        for (const pitch of [lo, 0, elev]) {
          const M = T.clone().multiply(pitchPose(gun.position, pitch));
          for (const [pts, backs] of [[gunFixed, [0]], [gunRecoil, [0, .135]]]) for (const back of backs) {
            const d = minDistance(pts, M, gunHullGrid, stop, back); if (d < r.d) r = { d, pitch };
          }
        }
        return r;
      }, { centres: curve.flatMap(([yd]) => [yd, -yd]), ranges: [[165, 195]], stop });
    };
    let t = Date.now();
    const g1 = gunHull(spec);
    assert.ok(g1.d >= .025 - 1e-4, `${id}: the main gun keeps 25 mm from the hull at every yaw (${(g1.d * 1000).toFixed(1)} mm at yaw ${g1.yd}, pitch ${(g1.pitch / DEG).toFixed(2)})`);
    const t1 = secs(t); progress(id, `gun/hull ${t1} s`);
    if (spec.gunPitchByYawDeg) {
      const bare = gunHull({ gunDepressionDeg: spec.gunDepressionDeg }, .025);
      assert.ok(bare.d < .025, `${id}: negative control: without its depression curve the gun meets the hull (${(bare.d * 1000).toFixed(1)} mm)`);
    }
    // ---- 2. the main gun against the turret add-ons and the station at rest, at every legal pitch
    t = Date.now();
    const deepest = Math.min(...Array.from({ length: 73 }, (_, k) => minimumMechanicalGunPitch(spec, k * Math.PI / 72)));
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
    const t2 = secs(t); progress(id, `gun/roof ${t2} s`);
    // ---- 3. the turret underside and bustle over the hull; the collar excused only inside its circle on the pivot
    t = Date.now();
    const collar = donor.donor === 'type96b' ? { z: 0, r: 1.04, top: .125 } : { z: donor.builderOptions?.ringCollar?.z ?? -.12, r: donor.builderOptions?.ringCollar?.radiusM ?? 1.14, top: .025 };
    assert.equal(collar.z, 0, `${id}: the ring collar is concentric with the turret's pivot (it turns in place)`);
    const under = [], body = densePoints(meshTriangles(meshesUnder(turret, [gun, station]).filter((m) => !/^vehicleMarking/.test(m.name)), tInv), .02);
    for (let i = 0; i < body.length; i += 3) {
      const x = body[i], y = body[i + 1], z = body[i + 2];
      if (y > .35) continue;
      if (y < collar.top && Math.hypot(x, z - collar.z) < collar.r + .002) continue;
      under.push(x, y, z);
    }
    const underGrid = new SurfaceGrid(annulus(hullAll, ring.x, ring.z, 3.2, ring.y - .5, ring.y + .5), { cell: .05, rq: .065 });
    const g3 = yawSweep((yd) => ({ d: minDistance(under, yawPose(turret.position, turret.quaternion, yd * DEG), underGrid, 0) }));
    assert.ok(g3.d >= .020 - 1e-4, `${id}: the turret underside keeps 20 mm from the hull at every yaw (${(g3.d * 1000).toFixed(1)} mm at yaw ${g3.yd})`);
    // the collar's skirt (its bottom rim 2 mm over its bottom and its mid-height ring) keeps 20 mm, at every yaw, from
    // every hull part that does not span the turret's axis (the deck plates it is seated in do; fenders, sponsons,
    // hatches and shoulder covers do not)
    const free = census.filter((p) => !p.bucket.startsWith('turret') && !p.bucket.startsWith('gun')
      && !(p.box.min.x < ring.x && p.box.max.x > ring.x && p.box.min.z < ring.z && p.box.max.z > ring.z) && p.box.max.y > ring.y - .25 && p.box.min.y < ring.y + .25)
      .map((p) => ({ p, g: new SurfaceGrid(p.tri, { cell: .05, rq: .05 }) }));
    const skirt = (cz, r, bottom, height) => { const out = []; for (let k = 0; k < 144; k++) { const b = k * 2.5 * DEG; for (const y of [bottom + .002, bottom + height / 2]) out.push(r * Math.cos(b), y, cz + r * Math.sin(b)); } return out; };
    const skirtClear = (pts) => { let best = { d: Infinity };
      for (let yd = 0; yd < 360; yd += 5) { const M = yawPose(turret.position, turret.quaternion, yd * DEG);
        for (let i = 0; i < pts.length; i += 3) { v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(M);
          for (const { p, g } of free) { if (p.box.distanceToPoint(v) > .05) continue; const d = g.distance(v.x, v.y, v.z); if (d < best.d) best = { d, yd, part: p }; } } }
      return best; };
    const collarSize = donor.donor === 'type96b' ? { bottom: -.03, height: .15 } : { bottom: -.08, height: .10 };
    const c3 = skirtClear(skirt(collar.z, collar.r, collarSize.bottom, collarSize.height));
    assert.ok(c3.d >= .020 - 1e-4, `${id}: its ring collar's skirt keeps 20 mm from every fender, sponson and hatch at every yaw (${(c3.d * 1000).toFixed(1)} mm at yaw ${c3.yd}${c3.part ? `, ${c3.part.bucket} [${c3.part.box.min.toArray().map((x) => x.toFixed(2))}..${c3.part.box.max.toArray().map((x) => x.toFixed(2))}]` : ''})`);
    // negative control: the fleet 99A2 collar (r 1.14, 0.12 m behind the pivot) sweeps into the B3's fenders
    if (id === 't72b3_qilin') {
      const fleet = skirtClear(skirt(-.12, 1.14, -.08, .10));
      assert.ok(fleet.d < .020, `negative control: the fleet 99A2 collar sweeps into the B3's fenders (${(fleet.d * 1000).toFixed(1)} mm at yaw ${fleet.yd})`);
    }
    const t3 = secs(t); progress(id, `underside ${t3} s`);
    // ---- 4. the roof station's moving mass over its arc and pitch range
    t = Date.now();
    const pitchGroup = station.getObjectByName('auxiliaryWeaponPitch');
    const others = meshesUnder(turret, [station]).filter((m) => !/^vehicleMarking/.test(m.name));
    const fixedTris = meshTriangles(others, tInv);
    const pitchMeshes = [], yawMeshes = [];
    station.traverse((o) => { if (!o.isMesh || /Shadow/.test(o.name)) return; let inPitch = false; for (let p = o; p; p = p.parent) if (p === pitchGroup) inPitch = true; (inPitch ? pitchMeshes : yawMeshes).push(o); });
    const pInv = new THREE.Matrix4().copy(pitchGroup.matrixWorld).invert(), sInv = new THREE.Matrix4().copy(station.matrixWorld).invert();
    const pitchTris = meshTriangles(pitchMeshes, pInv), yawTris = meshTriangles(yawMeshes, sInv);
    const pitchPts = densePoints(pitchTris, .015), pitchCoarse = densePoints(pitchTris, .03), pitchGrid = new SurfaceGrid(pitchTris, { cell: .04, rq: .065 });
    const yawAll = densePoints(yawTris, .015), yawPts = [], yawCoarseAll = densePoints(yawTris, .03), yawCoarse = [];
    for (let i = 0; i < yawAll.length; i += 3) if (yawAll[i + 1] > .06) yawPts.push(yawAll[i], yawAll[i + 1], yawAll[i + 2]);
    for (let i = 0; i < yawCoarseAll.length; i += 3) if (yawCoarseAll[i + 1] > .06) yawCoarse.push(yawCoarseAll[i], yawCoarseAll[i + 1], yawCoarseAll[i + 2]);
    const yawGrid = new SurfaceGrid(yawTris, { cell: .04, rq: .065 });
    const sp = station.position;
    let stationReach = 0; for (let i = 0; i < pitchTris.length; i += 3) stationReach = Math.max(stationReach, Math.hypot(pitchTris[i], pitchTris[i + 1] - pitchGroup.position.y, pitchTris[i + 2]));
    const fixedNear = annulus(fixedTris, sp.x, sp.z, stationReach + .25, sp.y - .3, sp.y + 1.5);
    const fixedGrid = new SurfaceGrid(fixedNear, { cell: .04, rq: .065 });
    // the fixed stock the moving mass can reach (both-ways pass): dense samples within its reach of the pivot, in 3D
    const pivotT = pitchGroup.getWorldPosition(new THREE.Vector3()).applyMatrix4(tInv);
    const near = (() => { const d = densePoints(fixedNear, .015), out = []; for (let i = 0; i < d.length; i += 3) if (Math.hypot(d[i] - pivotT.x, d[i + 1] - pivotT.y, d[i + 2] - pivotT.z) < stationReach + .07) out.push(d[i], d[i + 1], d[i + 2]); return Float64Array.from(out); })();
    const profile = auxiliaryWeaponProfile(station.userData.caliberMm, id);
    const arc = station.userData.yawArc ?? [-Math.PI, Math.PI];
    const depAt = (table) => (yaw) => { if (!table || yaw < table[0][0] || yaw > table.at(-1)[0]) return profile.depressionRad;
      for (let i = 1; i < table.length; i++) if (yaw <= table[i][0]) return Math.min(profile.depressionRad, table[i - 1][1], table[i][1]); return profile.depressionRad; };
    const restP = pitchGroup.position.clone();
    const stroke = Number(station.userData.auxiliaryRecoilM), fineRecoils = stroke > 0 && stroke < .025 ? [0, stroke / 2, stroke, .025] : [0, .025];
    const posesAt = (dep, step) => { const els = []; for (let el = -dep; el < profile.elevationRad; el += step) els.push(el); els.push(profile.elevationRad); return els; };
    /** One pose: the moving surface's samples against the fixed stock, and (`both`) the fixed stock's against it. */
    const pose = (yaw, el, rc, pts, both, stop) => {
      const S = yawPose(station.position, station.quaternion, yaw);
      const M = S.clone().multiply(pitchPose(new THREE.Vector3(restP.x, restP.y, restP.z - rc), el));
      let d = minDistance(pts, M, fixedGrid, stop);
      if (both && d >= stop) { const Mi = M.clone().invert(); for (let i = 0; i < near.length; i += 3) { v.set(near[i], near[i + 1], near[i + 2]).applyMatrix4(Mi); d = Math.min(d, pitchGrid.distance(v.x, v.y, v.z)); if (d < stop) break; } }
      return d;
    };
    const yawStage = (yaw, pts, both, stop) => {
      const S = yawPose(station.position, station.quaternion, yaw);
      let d = minDistance(pts, S, fixedGrid, stop);
      if (both && d >= stop) { const Si = S.clone().invert(); for (let i = 0; i < near.length; i += 3) { v.set(near[i], near[i + 1], near[i + 2]).applyMatrix4(Si); if (v.y > .06) d = Math.min(d, yawGrid.distance(v.x, v.y, v.z)); if (d < stop) break; } }
      return d;
    };
    /** The coarse sweep (2 degrees by 0.05 rad, 30 mm samples, one way), then both ways with the 15 mm samples at 0.5
     * degree by 0.0125 rad round each local minimum under 75 mm (60 mm plus the coarse samples' 15 mm). */
    const sweep = (dep, stop = 0) => {
      let worst = { d: Infinity }; const rows = [];
      for (let yaw = arc[0]; yaw <= arc[1] + 1e-9; yaw += 2 * DEG) {
        let best = { d: yawStage(yaw, yawCoarse, false, stop), el: null };
        for (const el of posesAt(dep(yaw), .05)) for (const rc of [0, .025]) { const d = pose(yaw, el, rc, pitchCoarse, false, stop); if (d < best.d) best = { d, el }; }
        if (best.d < worst.d) worst = { d: best.d, yaw, el: best.el ?? 'yaw stage' };
        if (worst.d < stop) return worst;
        rows.push({ yaw, ...best });
      }
      const minima = rows.filter((r, i) => r.d < .075 && (i === 0 || rows[i - 1].d >= r.d) && (i === rows.length - 1 || rows[i + 1].d >= r.d));
      worst = { d: Infinity };
      for (const { yaw: y0, el: e0 } of minima) for (let k = -4; k <= 4; k++) {
        const yaw = Math.min(arc[1], Math.max(arc[0], y0 + k * .5 * DEG)), dp = dep(yaw);
        const dy = yawStage(yaw, yawPts, true, stop); if (dy < worst.d) worst = { d: dy, yaw, el: 'yaw stage' };
        if (e0 === null) continue;
        for (let j = -4; j <= 4; j++) { const el = Math.min(profile.elevationRad, Math.max(-dp, e0 + j * .0125));
          for (const rc of fineRecoils) { const d = pose(yaw, el, rc, pitchPts, true, stop); if (d < worst.d) worst = { d, yaw, el, rc }; if (worst.d < stop) return worst; } }
      }
      // with no pose under 75 mm the coarse sweep's own minimum stands (less its sampling slack)
      if (!minima.length) { const c = rows.reduce((a, b) => (b.d < a.d ? b : a)); worst = { d: c.d - .015, yaw: c.yaw, el: c.el ?? 'yaw stage' }; }
      return worst;
    };
    const s4 = sweep(depAt(station.userData.depressionByYaw));
    assert.ok(s4.d >= .025 - 1e-4, `${id}: ${station.name} moving mass keeps 25 mm from the turret over its arc (${(s4.d * 1000).toFixed(1)} mm at yaw ${(s4.yaw / DEG).toFixed(1)}, el ${typeof s4.el === 'number' ? (s4.el / DEG).toFixed(1) : s4.el})`);
    if (station.userData.depressionByYaw) {
      const bare = sweep(depAt(null), .025);
      assert.ok(bare.d < .025, `${id}: negative control: without its depression table the station meets the turret (${(bare.d * 1000).toFixed(1)} mm)`);
    }
    // the published arc and table are the loadout's and the combat anatomy's
    assert.deepEqual(station.userData.yawArc ?? null, l.yawArc ? [...l.yawArc] : null, `${id}: the built station publishes the loadout's arc`);
    assert.deepEqual(station.userData.depressionByYaw ?? null, l.depressionByYaw ? l.depressionByYaw.map((r) => [...r]) : null, `${id}: the built station publishes the loadout's table`);
    const row = AUXILIARY_ROOF_GUNS[id];
    assert.deepEqual(row?.yawArc ?? null, l.yawArc ? [...l.yawArc] : null, `${id}: the combat anatomy carries the station's arc`);
    assert.deepEqual(row?.depressionByYaw ?? null, l.depressionByYaw ? l.depressionByYaw.map((r) => [...r]) : null, `${id}: the combat anatomy carries the station's table`);
    const t4 = secs(t); progress(id, `station ${t4} s`);
    // ---- 5. the box sight on the gun (Kunlun, Yun; round 3, critic D5: both must keep the option, without it the fleet's
    // turret-fixed box sight stands 1-5 cm inside the pitching boot)
    let s5 = '';
    assert.equal(Boolean(donor.builderOptions?.boxSightOnGun), donor.donor === 'type96b', `${id}: the Type 96B's box sight rides the gun (boxSightOnGun)`);
    if (donor.builderOptions?.boxSightOnGun) {
      t = Date.now();
      const gunParts = census.filter((p) => p.bucket.startsWith('gunMount'));
      const boot = gunParts.find((p) => p.bucket === 'gunMount' && p.box.max.x > .2);
      const sight = gunParts.filter((p) => p !== boot && p.box.max.x < .13 && p.box.min.x > -.13 && p.box.max.y > .3);
      assert.ok(boot && sight.length >= 4, `${id}: the boot and the box sight (box, saddle, bezel, glass) ride the gun`);
      const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = (p) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p.tri), 3)); return new THREE.Mesh(g, mat); };
      // the samples cover the saddle's footprint (the sight's lowest part), 3 mm inside its edges
      const saddle = sight.reduce((a, b) => (b.box.min.y < a.box.min.y ? b : a)), box = saddle.box.clone().expandByScalar(.003); // (the loop starts 6 mm in)
      const bootMesh = mesh(boot), sightMeshes = sight.map(mesh);
      let bury = 0, gap = 0, n = 0;
      for (let x = box.min.x + .006; x <= box.max.x - .006; x += .01) for (let z = box.min.z + .006; z <= box.max.z - .006; z += .01) {
        const b = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0), 0, 5).intersectObject(bootMesh, false)[0]; if (!b) continue;
        const s = new THREE.Raycaster(new THREE.Vector3(x, b.point.y - .05, z), new THREE.Vector3(0, 1, 0), 0, 1).intersectObjects(sightMeshes, false)[0];
        assert.ok(s, `${id}: the box sight covers the boot at ${x.toFixed(3)}, ${z.toFixed(3)}`);
        n++; const d = s.point.y - b.point.y; if (d < 0) bury = Math.max(bury, -d); else gap = Math.max(gap, d);
      }
      mat.dispose(); for (const m of [bootMesh, ...sightMeshes]) m.geometry.dispose();
      assert.ok(n > 500 && gap < 1e-4 && bury <= .005 + 1e-4, `${id}: the box sight is seated on the boot (${n} samples: gap ${(gap * 1000).toFixed(1)} mm, saddle ${(bury * 1000).toFixed(1)} mm in)`);
      const fixedTurret = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]).filter((m) => !/^vehicleMarking/.test(m.name)), tInv), { cell: .05, rq: .05 });
      const pts = densePoints(Float64Array.from(sight.flatMap((p) => Array.from(p.tri))), .01);
      let worst = { d: Infinity };
      for (let pitch = deepest; pitch <= elev + 1e-9; pitch += .5 * DEG) { const d = minDistance(pts, pitchPose(gun.position, pitch), fixedTurret, 0); if (d < worst.d) worst = { d, pitch }; }
      assert.ok(worst.d >= .010 - 1e-4, `${id}: the box sight keeps 10 mm from the turret over the pitch range (${(worst.d * 1000).toFixed(1)} mm at ${(worst.pitch / DEG).toFixed(1)} deg)`);
      s5 = `, box sight seated (saddle ${(bury * 1000).toFixed(1)} mm in) and ${(worst.d * 1000).toFixed(1)} mm from the turret`;
      s5 += ` [${secs(t)} s]`;
    }
    console.log(`${id}: gun/hull ${(g1.d * 1000).toFixed(1)} mm (yaw ${g1.yd}) [${t1} s], gun/roof ${(g2.d * 1000).toFixed(1)} mm [${t2} s], underside ${(g3.d * 1000).toFixed(1)} mm [${t3} s], station ${(s4.d * 1000).toFixed(1)} mm over ${((arc[1] - arc[0]) / DEG).toFixed(0)} deg [${t4} s]${s5} PASS (${secs(t0)} s)`);
  } finally { tank.dispose(); }
}
const control = boxSightInsideFleetBoot();
assert.ok(control > .010, `negative control: the fleet Type 96B's turret-fixed box sight stands inside its boot (${(control * 1000).toFixed(1)} mm deep)`);
console.log(`cnClearance: the CN guns, undersides, collars, roof stations and box sights clear everything they sweep past PASS (${secs(T0)} s)`);
