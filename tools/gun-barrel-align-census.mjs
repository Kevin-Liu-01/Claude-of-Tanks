#!/usr/bin/env node
// Gun-barrel alignment census: does the combat gunBarrel cylinder the shots hit run down the gun the player sees?
//
//   node tools/gun-barrel-align-census.mjs --ids=kv2,strv103b [--json=path] [--gate] [--seed-pivot-m=<m>]
//   node tools/gun-barrel-align-census.mjs --all [--gate]
//   node tools/gun-barrel-align-census.mjs --ledger=docs/geometry-gate/gun-barrel-align.json --update|--check --ids=<a,b>|--all
//
// 230 (gallery-anatomy finding, 2026-10-21): the Gallery anatomy layers draw the combat barrel, and on the Strv 103B
// the two barrels pointed in different directions, on the KV-2 the drawn gun sat high and forward of the combat one,
// so a shot could hit the gun where none is drawn and pass through the drawn one. The combat barrel (src/sim/armor.ts
// traceGunBarrel) is a cylinder of armor.gunBarrel.radiusM along +Z of hull · T(turretPivot) · Ry(turretYaw) ·
// T(gunPivot) · Rx(-gunPitch), from the trunnion to armor.gunBarrel.lengthM, where the shell leaves
// (authoritativeMatch gunWorldPose). Builders may place rig_turret and rig_gun themselves and set their own muzzle
// station, and a fixed gun is printed into the hull, so nothing ties that cylinder to the drawn gun but this census.
//
// Each tank is built first-party (createTank, proceduralOnly, LOD level 0) and posed the way the runtime poses it
// (rig_turret.rotation.y = turretYaw, clamped to a casemate's bearing by casemateGunYaw; rig_gun.rotation.x =
// -gunPitch) at the stations of tools/gun-barrel-align.mjs alignPoses: three yaws at rest, full elevation and full
// depression for a turret, the arc ends for a casemate, the one pose the sim allows a hull-aimed gun (Strv 103: the
// hull lays it, turretYaw and gunPitch stay zero). At each pose every main-gun mouth the factory publishes
// (userData.physicalMouth: origin on the mouth plane, +Z out of the bore; under rig_gun, or in the hull for a gun
// fixed there) seeds the drawn axis, and the drawn tube is cut by planes across that axis every 40 mm from the mouth
// back toward the trunnion: each round section (bounding box of the cut within a slender cap round the axis) gives a
// centre and a radius, the run stops where the cut widens into the mantlet or glacis, and a least-squares line
// through the centres is the drawn bore axis. Against the combat cylinder at the same pose the census reads
//   offset: the largest distance from the drawn axis to the combat centre line over the measured tube (mouth and the
//     run's rear end), angle: between the two axes, axial: the drawn mouth past (+) or short of (-) the combat far end,
//   radius: the combat radius less the drawn tube's median section radius,
// and a tank is ALIGNED when every pose is within ALIGN_TOLERANCE (offset 20 mm, angle 0.5 deg, axial 30 mm, radius
// 20 mm). A twin-bore gun is measured on the mean of its tubes and the radius is not judged.
//
// --ledger keeps one row per tank (status, kind, mouths, the worst reading of each measure) bound to the tank's turret
// and gun group digests in docs/references/fleet-geometry-ledger.json (the hull group too for a gun fixed in the hull)
// and to tools/gun-barrel-align.mjs combatBarrelDigest of its spec, so the receipt
// (tools/gun-barrel-align-census.selftest.mjs) holds the whole fleet without building a tank. --update re-measures and
// writes the rows for --ids (or --all); --check re-measures them and compares, failing on a moved reading or a stale
// binding. --gate exits non-zero when a measured tank is not aligned. --seed-pivot-m=<m> raises the combat trunnion by
// m metres in the census's copy (the negative control): it must read as a ~m offset.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import './tank-surface-collect.mjs'; // node canvas shim: builders paint their canvas textures as in the browser
import { uniqueIds } from './id-list.mjs';
import { ALIGN_TOLERANCE, alignPoses, boundGroups, combatBarrelDigest, hullAimed } from './gun-barrel-align.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const LEDGER_PATH = opt('ledger', '');
const FLEET_LEDGER_PATH = 'docs/references/fleet-geometry-ledger.json';
const SEED_PIVOT_M = Number(opt('seed-pivot-m', '0'));
const RIGS_PATH = opt('rigs', '');
// A gun fixed in the hull: its smallest main-gun bore is 15 mm, so a hull machine gun's mouth is never taken for it.
const HULL_GUN_MIN_BORE_M = 0.015;
const STATION_STEP_M = 0.04, FIRST_STATION_M = 0.03;
// A thermal sleeve or collar reaches ~1.8x the muzzle radius (Leclerc 146 mm over 85 mm): the run stops only past 2x its
// narrowest round section, or where the cut fills the cap (mantlet, glacis, turret face).
const ROUND_ASPECT = 1.15, WIDEN_FACTOR = 2, MIN_RUN_M = 0.12, CAP_FACTOR = 2.5;

const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('../src/vehicles/specs.ts');
const { casemateGunYaw } = await import('../src/vehicles/casemateGunPose.ts');
const ids = flag('all') ? [...ALL_TANK_IDS] : uniqueIds(opt('ids', '').split(',').map((s) => s.trim()).filter(Boolean), 'gun-barrel-align-census --ids');
if (!ids.length) { console.error('gun-barrel-align-census: pass --ids=<a,b> or --all'); process.exit(2); }
if (LEDGER_PATH && flag('update') === flag('check')) { console.error('gun-barrel-align ledger: pass exactly one of --update or --check'); process.exit(2); }
if (RIGS_PATH && !flag('update')) { console.error('gun-barrel-align --rigs: pass --update'); process.exit(2); }
const { COMBAT_GUN_RIGS } = await import('../src/vehicles/combatGunRigs.generated.ts');
const ledger = LEDGER_PATH && existsSync(resolve(LEDGER_PATH)) ? JSON.parse(readFileSync(resolve(LEDGER_PATH), 'utf8')) : null;
const DEG = Math.PI / 180;

function isUnder(o, ancestor) { for (let p = o; p; p = p.parent) if (p === ancestor) return true; return false; }
function visibleInTree(object) { for (let p = object; p; p = p.parent) if (!p.visible) return false; return true; }
function writesColor(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((m) => m && m.visible !== false && m.colorWrite !== false);
}

/** Show only LOD level 0 (the close-up surface); returns a restore function. */
function nearestLodOnly(root) {
  const hidden = [];
  root.traverse((o) => {
    if (!o.isLOD) return;
    o.levels.forEach((level, i) => { if (i > 0 && level.object.visible) { level.object.visible = false; hidden.push(level.object); } });
  });
  return () => { for (const o of hidden) o.visible = true; };
}

/** Main-gun mouths at the current pose: under rig_gun, or (none there) a cannon-bore mouth fixed in the hull. */
function collectMouths(root) {
  const gun = root.getObjectByName('rig_gun'), turretRig = root.getObjectByName('rig_turret');
  const all = [];
  root.traverseVisible((o) => {
    const seat = o.userData?.muzzleSeatReceipt;
    if (!o.userData?.physicalMouth || !seat) return;
    const r = Number(seat.physicalInnerRadiusM ?? seat.innerRadiusM) || 0;
    const outer = Math.max(r, Number(seat.outerRadiusM ?? seat.measuredOuterRadiusM) || 0, Number(seat.supportOuterRadiusM) || 0);
    const main = !!gun && isUnder(o, gun), turret = !!turretRig && isUnder(o, turretRig);
    const scale = Math.abs(o.getWorldScale(new THREE.Vector3()).x) || 1;
    all.push({
      name: o.name, main, hullFixed: !main && !turret && r >= HULL_GUN_MIN_BORE_M, outer: (outer || 0.05) * scale,
      origin: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld),
      axis: new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld).normalize(),
    });
  });
  const main = all.filter((m) => m.main);
  return main.length ? { kind: 'turret', mouths: main } : all.some((m) => m.hullFixed)
    ? { kind: 'hull-fixed', mouths: all.filter((m) => m.hullFixed) } : { kind: 'none', mouths: [] };
}

/** The meshes a section can cut: visible LOD-0 colour surfaces, bore furniture and shadow proxies left out. */
function sectionMeshes(root) {
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry?.getAttribute('position')) return;
    if (/muzzleBore|shadow/i.test(o.name || '') || !visibleInTree(o) || !writesColor(o)) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    meshes.push(o);
  });
  return meshes;
}

const _p = new THREE.Vector3(), _c = new THREE.Vector3();
/**
 * Cut the drawn tube behind one mouth: sections every STATION_STEP_M from the mouth back to sMax, each the bounding box
 * of the cut within `cap` of the seed axis. Returns the least-squares bore line (point on the mouth plane, forward
 * direction), the sections used and the drawn radius, or null when no round run of MIN_RUN_M was found.
 */
function fitBore(meshes, mouth, sMax, cap) {
  const a = mouth.axis, O = mouth.origin;
  const up = Math.abs(a.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(up, a).normalize();
  const e2 = new THREE.Vector3().crossVectors(a, e1).normalize();
  const stations = [];
  for (let s = FIRST_STATION_M; s <= sMax + 1e-9; s += STATION_STEP_M) stations.push({ s, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, n: 0 });
  const reach = Math.hypot(sMax, cap);
  _c.copy(a).multiplyScalar(-sMax / 2).add(O);
  for (const mesh of meshes) {
    const sphere = mesh.geometry.boundingSphere;
    _p.copy(sphere.center).applyMatrix4(mesh.matrixWorld);
    const radius = sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    if (_p.distanceTo(_c) > radius + reach) continue;
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = pos.count;
    const lv = new Float64Array(count * 3);
    for (let i = 0; i < count; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(O);
      lv[i * 3] = -_p.dot(a); lv[i * 3 + 1] = _p.dot(e1); lv[i * 3 + 2] = _p.dot(e2);
    }
    const tris = index ? index.count / 3 : count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const v = [i0, i1, i2];
      let sLo = Infinity, sHi = -Infinity, rMin = Infinity;
      for (const i of v) { const s = lv[i * 3]; if (s < sLo) sLo = s; if (s > sHi) sHi = s; rMin = Math.min(rMin, Math.hypot(lv[i * 3 + 1], lv[i * 3 + 2])); }
      if (sHi < FIRST_STATION_M || sLo > sMax || sHi - sLo < 1e-9) continue;
      const k0 = Math.max(0, Math.ceil((sLo - FIRST_STATION_M) / STATION_STEP_M)), k1 = Math.min(stations.length - 1, Math.floor((sHi - FIRST_STATION_M) / STATION_STEP_M));
      for (let k = k0; k <= k1; k++) {
        const st = stations[k], plane = st.s;
        for (let e = 0; e < 3; e++) {
          const p = v[e], q = v[(e + 1) % 3];
          const sp = lv[p * 3], sq = lv[q * 3];
          if ((sp - plane) * (sq - plane) > 0 || sp === sq) continue;
          const u = (plane - sp) / (sq - sp);
          const x = lv[p * 3 + 1] + (lv[q * 3 + 1] - lv[p * 3 + 1]) * u, y = lv[p * 3 + 2] + (lv[q * 3 + 2] - lv[p * 3 + 2]) * u;
          if (Math.hypot(x, y) > cap) continue;
          if (x < st.minX) st.minX = x; if (x > st.maxX) st.maxX = x;
          if (y < st.minY) st.minY = y; if (y > st.maxY) st.maxY = y;
          st.n++;
        }
      }
    }
  }
  // The run: round sections from the mouth back, stopping where the cut widens past twice the run's narrowest section or
  // fills the cap (mantlet, glacis, turret face), or after 0.24 m with nothing to cut.
  const run = [];
  let gap = 0;
  for (const st of stations) {
    const rx = (st.maxX - st.minX) / 2, ry = (st.maxY - st.minY) / 2;
    const ok = st.n >= 6 && rx > 0.002 && ry > 0.002;
    const radius = ok ? (rx + ry) / 2 : 0, aspect = ok ? Math.max(rx, ry) / Math.min(rx, ry) : Infinity;
    if (!ok) { if (run.length && ++gap > 6) break; continue; }
    if (Math.max(rx, ry) > cap * 0.95) { if (run.length >= 3) break; continue; }
    if (run.length && radius > Math.min(...run.map((r) => r.radius)) * WIDEN_FACTOR) break;
    if (aspect > ROUND_ASPECT) { gap++; continue; }
    gap = 0;
    run.push({ s: st.s, x: (st.minX + st.maxX) / 2, y: (st.minY + st.maxY) / 2, radius, aspect });
  }
  if (run.length < 3 || run[run.length - 1].s - run[0].s < MIN_RUN_M) return null;
  const n = run.length, ms = run.reduce((t, r) => t + r.s, 0) / n;
  const mx = run.reduce((t, r) => t + r.x, 0) / n, my = run.reduce((t, r) => t + r.y, 0) / n;
  let sss = 0, ssx = 0, ssy = 0;
  for (const r of run) { sss += (r.s - ms) ** 2; ssx += (r.s - ms) * (r.x - mx); ssy += (r.s - ms) * (r.y - my); }
  const kx = ssx / sss, ky = ssy / sss, x0 = mx - kx * ms, y0 = my - ky * ms;
  const point = O.clone().addScaledVector(e1, x0).addScaledVector(e2, y0);
  const direction = a.clone().addScaledVector(e1, -kx).addScaledVector(e2, -ky).normalize();
  const radius = run.map((r) => r.radius).sort((x, y) => x - y)[n >> 1];
  return { point, direction, radius, sEnd: run[n - 1].s, sections: n };
}

/** The combat barrel at a pose, in the root's frame exactly as buildFrames composes it (src/sim/armor.ts). */
function combatBarrel(root, armor, yaw, pitch) {
  // `armor` is the authority's copy, taken before the build: a builder that writes P.spec.armor changes only the client's
  const tp = armor.turretPivot || [0, 0, 0], gp = [...(armor.gunPivot || [0, 0, 0])];
  gp[1] += SEED_PIVOT_M;
  const m = new THREE.Matrix4().copy(root.matrixWorld)
    .multiply(new THREE.Matrix4().makeTranslation(tp[0], tp[1], tp[2]))
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeTranslation(gp[0], gp[1], gp[2]))
    .multiply(new THREE.Matrix4().makeRotationX(-pitch));
  const scale = m.getMaxScaleOnAxis();
  return {
    origin: new THREE.Vector3().setFromMatrixPosition(m),
    direction: new THREE.Vector3(0, 0, 1).transformDirection(m).normalize(),
    lengthM: armor.gunBarrel.lengthM * scale, radiusM: armor.gunBarrel.radiusM * scale,
  };
}

const lineDistance = (point, origin, direction) => {
  const d = point.clone().sub(origin);
  return d.addScaledVector(direction, -d.dot(direction)).length();
};
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

function measurePose(root, spec, combat, meshes, pose) {
  const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
  const yaw = pose.yawDeg * DEG, pitch = pose.pitchDeg * DEG;
  if (turret) turret.rotation.y = spec.armor.turretless ? casemateGunYaw(spec, yaw) : yaw;
  if (gun) gun.rotation.x = -pitch;
  root.updateMatrixWorld(true);
  const { kind, mouths } = collectMouths(root);
  if (!mouths.length) return { kind, mouths: 0 };
  const rigGun = gun ? new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld) : null;
  const fits = mouths.map((mouth) => {
    const nearest = Math.min(Infinity, ...mouths.filter((m) => m !== mouth).map((m) => m.origin.distanceTo(mouth.origin)));
    const cap = Math.max(0.03, Math.min(0.35, mouth.outer * CAP_FACTOR, nearest * 0.45));
    const span = kind === 'turret' && rigGun ? mouth.origin.distanceTo(rigGun) * 0.7 : spec.dims.hullLengthM * 0.5;
    return fitBore(meshes, mouth, Math.min(3, Math.max(0.4, span)), cap)
      ?? { point: mouth.origin.clone(), direction: mouth.axis.clone(), radius: mouth.outer, sEnd: 0, sections: 0, fallback: true };
  });
  const point = fits.reduce((t, f) => t.add(f.point), new THREE.Vector3()).divideScalar(fits.length);
  const direction = fits.reduce((t, f) => t.add(f.direction), new THREE.Vector3()).normalize();
  const sEnd = Math.min(...fits.map((f) => f.sEnd));
  const barrel = combatBarrel(root, combat, hullAimed(spec) ? 0 : yaw, hullAimed(spec) ? 0 : pitch);
  const tip = barrel.origin.clone().addScaledVector(barrel.direction, barrel.lengthM);
  const rear = point.clone().addScaledVector(direction, -sEnd);
  const offsetMouth = lineDistance(point, barrel.origin, barrel.direction);
  const offsetRear = lineDistance(rear, barrel.origin, barrel.direction);
  const radius = fits.length === 1 ? fits[0].radius : null;
  return {
    kind, mouths: mouths.length,
    offsetMm: r1(Math.max(offsetMouth, offsetRear) * 1000), offsetMouthMm: r1(offsetMouth * 1000), offsetRearMm: r1(offsetRear * 1000),
    angleDeg: r2(Math.acos(Math.min(1, Math.max(-1, direction.dot(barrel.direction)))) / DEG),
    axialMm: r1(point.clone().sub(tip).dot(barrel.direction) * 1000),
    radiusMm: radius === null ? null : r1((barrel.radiusM - radius) * 1000),
    drawnRadiusMm: radius === null ? null : r1(radius * 1000), combatRadiusMm: r1(barrel.radiusM * 1000),
    measuredTubeMm: r1(sEnd * 1000), sections: fits.map((f) => f.sections), fallback: fits.some((f) => f.fallback),
    separationMm: fits.length > 1 ? r1(Math.max(...fits.flatMap((f) => fits.map((g) => f.point.distanceTo(g.point)))) * 1000) : null,
    drawnMouth: point.toArray().map((v) => Math.round(v * 1000) / 1000),
    line: { point: point.toArray(), direction: direction.toArray(), radius },
  };
}

const T = ALIGN_TOLERANCE;
const exceeds = (p) => [
  p.offsetMm > T.offsetM * 1000 && 'offset',
  p.angleDeg > T.angleDeg && 'angle',
  Math.abs(p.axialMm) > T.axialM * 1000 && 'axial',
  p.radiusMm !== null && Math.abs(p.radiusMm) > T.radiusM * 1000 && 'radius',
  p.fallback && 'no measurable tube behind the mouth',
].filter(Boolean);
const score = (p) => Math.max(p.offsetMm / (T.offsetM * 1000), p.angleDeg / T.angleDeg, Math.abs(p.axialMm) / (T.axialM * 1000),
  p.radiusMm === null ? 0 : Math.abs(p.radiusMm) / (T.radiusM * 1000), p.fallback ? 9 : 0);

const r4 = (v) => Math.round(v * 1e4) / 1e4;
/** rig_gun pitches about X inside rig_turret: a turret scale with y != z shears the pitch (the drawn gun lags the sim's). */
function turretScaleOf(root) {
  const turret = root.getObjectByName('rig_turret');
  const scale = turret ? turret.scale.toArray().map(r4) : [1, 1, 1];
  return { scale, skewed: Math.abs(scale[1] - scale[2]) > 1e-4, scaled: scale.some((v) => Math.abs(v - 1) > 1e-4) };
}

/**
 * The combat articulation frame the drawn gun implies at rest (root, rig_turret and rig_gun unrotated): the turret pivot
 * where the builder seated rig_turret, the trunnion projected onto the drawn bore line (the combat barrel can only run
 * through its pivot), the barrel from there to the drawn mouth, and the drawn tube's median radius. A hull-fixed gun
 * keeps the authored turret pivot. Null when the bore was not measured or the gun is twin-bored.
 */
function measuredRig(root, spec, combat, rest) {
  if (!rest?.line || rest.fallback || rest.mouths !== 1) return null;
  const P = new THREE.Vector3().fromArray(rest.line.point), d = new THREE.Vector3().fromArray(rest.line.direction);
  const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
  const hullFixed = rest.kind !== 'turret';
  const tp = hullFixed || !turret ? new THREE.Vector3().fromArray(combat.turretPivot || [0, 0, 0]) : new THREE.Vector3().setFromMatrixPosition(turret.matrixWorld);
  const trunnion = hullFixed || !gun ? tp.clone().add(new THREE.Vector3().fromArray(combat.gunPivot || [0, 0, 0])) : new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld);
  const Q = P.clone().addScaledVector(d, trunnion.clone().sub(P).dot(d));
  return {
    turretPivot: tp.toArray().map(r4), gunPivot: Q.clone().sub(tp).toArray().map(r4), lengthM: r4(P.clone().sub(Q).dot(d)),
    radiusM: r4(rest.line.radius), boreOffsetMm: r1(trunnion.distanceTo(Q) * 1000),
    restAngleDeg: r2(Math.acos(Math.min(1, Math.max(-1, d.z))) / DEG),
  };
}

/** Rig diagnostics at rest: where the builder put rig_turret / rig_gun and the mouth, against the combat frames. */
function rigReport(root, spec, rest) {
  const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
  const tp = spec.armor.turretPivot || [0, 0, 0], gp = spec.armor.gunPivot || [0, 0, 0];
  const out = { turretScale: turretScaleOf(root).scale };
  if (turret) out.turretPivotDeltaMm = turret.position.toArray().map((v, i) => r1((v - tp[i]) * 1000));
  if (gun && turret?.position) {
    const world = new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld);
    out.trunnionDeltaMm = world.toArray().map((v, i) => r1((v - tp[i] - gp[i]) * 1000));
  }
  if (rest?.drawnMouth) out.drawnMouth = rest.drawnMouth;
  return out;
}

/** Census one tank: build, pose, measure; returns its report row (and whether it counts as a failure). */
function censusOne(id) {
  const spec = getSpec(id);
  const started = performance.now();
  const row = { id, combat: combatBarrelDigest(spec) };
  // The authority's combat barrel, taken before the build (finalized specs, the combat-rig table applied).
  const combat = structuredClone({ turretPivot: spec.armor?.turretPivot, gunPivot: spec.armor?.gunPivot, gunBarrel: spec.armor?.gunBarrel });
  if (!spec.armor?.gunBarrel || spec.armor.gunBarrel.collision === false) {
    Object.assign(row, { status: 'no-barrel', kind: 'none', mouths: 0 });
    console.log(`${id}: no combat barrel`);
    return row;
  }
  let tank;
  try { tank = createTank(id, null, { proceduralOnly: true, batchStatic: false, deferStaticBatch: true }); }
  catch (error) { console.log(`${id}: build failed: ${error.message}`); return Object.assign(row, { status: 'build-failed', error: error.message, failed: true }); }
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const restore = nearestLodOnly(root);
    const meshes = sectionMeshes(root);
    const poses = alignPoses(spec).map((pose) => ({ ...pose, ...measurePose(root, spec, combat, meshes, pose) }));
    restore();
    const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
    if (turret) turret.rotation.y = 0;
    if (gun) gun.rotation.x = 0;
    root.updateMatrixWorld(true);
    const measured = poses.filter((p) => p.mouths > 0);
    const kind = measured[0]?.kind ?? 'none';
    Object.assign(row, { kind, mouths: measured[0]?.mouths ?? 0, poses: poses.length });
    if (!measured.length) {
      row.status = spec.gun?.fixedLaunchCanisters === true ? 'launcher' : 'no-mouth';
      if (row.status === 'no-mouth') row.failed = true;
      console.log(`${id}: ${row.status === 'launcher' ? 'launcher (fixed canisters, no cannon mouth)' : 'NO MAIN-GUN MOUTH beside a combat barrel'}`);
      return row;
    }
    const worstPose = measured.reduce((w, p) => (score(p) > score(w) ? p : w));
    const max = (key, abs = false) => measured.reduce((w, p) => (p[key] === null ? w : Math.max(w, abs ? Math.abs(p[key]) : p[key])), 0);
    const signed = (key) => measured.reduce((w, p) => (p[key] !== null && Math.abs(p[key]) > Math.abs(w) ? p[key] : w), 0);
    const problems = [...new Set(measured.flatMap(exceeds))];
    const atRest = measured.filter((p) => p.pitchDeg === 0);
    const restProblems = [...new Set(atRest.flatMap(exceeds))];
    const { skewed } = turretScaleOf(root);
    // Class 2: aligned at every yaw at rest, off only once it elevates inside a turret scale that shears the pitch.
    const status = !problems.length ? 'aligned' : skewed && kind === 'turret' && !restProblems.length ? 'skewed' : 'mismatch';
    const restMax = (key) => atRest.reduce((w, p) => (p[key] === null ? w : Math.max(w, Math.abs(p[key]))), 0);
    Object.assign(row, {
      status,
      rest: { offsetMm: restMax('offsetMm'), angleDeg: restMax('angleDeg'), axialMm: restMax('axialMm'), radiusMm: measured[0].radiusMm === null ? null : restMax('radiusMm') },
      measuredRig: measuredRig(root, spec, combat, poses[0]),
      worst: { offsetMm: max('offsetMm'), angleDeg: max('angleDeg'), axialMm: signed('axialMm'), radiusMm: measured[0].radiusMm === null ? null : signed('radiusMm') },
      worstPose: { yawDeg: worstPose.yawDeg, pitchDeg: worstPose.pitchDeg },
      rig: rigReport(root, spec, poses[0]), detail: poses,
    });
    if (problems.length) row.failed = true;
    const w = row.worst, p0 = poses[0];
    const verdict = status === 'aligned' ? 'ALIGNED' : status === 'skewed' ? `SKEWED (aligned at rest; ${problems.join(', ')} once elevated inside turret scale ${JSON.stringify(row.rig.turretScale)})` : `MISMATCH (${problems.join(', ')})`;
    console.log(`${id}: ${verdict} — ${row.mouths} mouth(s) ${kind}, ${poses.length} pose(s); `
      + `worst offset ${w.offsetMm} mm, angle ${w.angleDeg} deg, axial ${w.axialMm} mm, radius ${w.radiusMm ?? 'n/a'} mm `
      + `(drawn r ${p0.drawnRadiusMm ?? 'n/a'} / combat r ${p0.combatRadiusMm} mm, tube cut ${p0.measuredTubeMm} mm; worst pose yaw ${worstPose.yawDeg} pitch ${worstPose.pitchDeg}); `
      + `rig ${JSON.stringify(row.rig)}; measured ${JSON.stringify(row.measuredRig)} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
    return row;
  } finally {
    tank.dispose?.();
  }
}

const report = ids.map(censusOne);

// --rigs: the combat-rig table (src/vehicles/combatGunRigs.generated.ts). A tank gets a row when it is not aligned, or
// keeps one it has, and its drawn gun is one turret bore measured at rest along the hull's +Z; the radius joins the row
// when the authored one is off by more than the tolerance (or the row already carries one). The rows written are
// applied in-process and those tanks measured again: a row must reproduce itself (the builder's rig never follows the
// combat frame), so a regenerated table is a fixpoint.
if (RIGS_PATH) {
  const { applyCombatGunRig } = await import('../src/vehicles/combatAnatomy.ts');
  const rows = { ...COMBAT_GUN_RIGS };
  const rowFor = (r) => {
    const m = r.measuredRig, held = rows[r.id];
    if (!m || r.kind !== 'turret') return { skip: m ? `${r.kind} gun` : 'no measured bore (twin bore, launcher or unmeasured tube)' };
    if (m.restAngleDeg > T.angleDeg) return { skip: `drawn bore ${m.restAngleDeg} deg off the hull's +Z at rest` };
    const combatRadius = r.detail?.[0]?.combatRadiusMm / 1000;
    const radius = held?.radiusM !== undefined || Math.abs(combatRadius - m.radiusM) > T.radiusM;
    return { row: { turretPivot: m.turretPivot, gunPivot: m.gunPivot, lengthM: m.lengthM, ...(radius ? { radiusM: m.radiusM } : {}) } };
  };
  const written = [], skipped = [];
  for (const r of report) {
    if (!rows[r.id] && (r.status === 'aligned' || !['mismatch', 'skewed'].includes(r.status))) continue;
    const { row, skip } = rowFor(r);
    if (skip) { skipped.push(`${r.id}: ${skip}`); continue; }
    if (JSON.stringify(rows[r.id]) !== JSON.stringify(row)) written.push(r.id);
    rows[r.id] = row;
  }
  const lines = Object.keys(rows).sort().map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(rows[id])},`);
  const head = readFileSync(resolve(RIGS_PATH), 'utf8').split('export const COMBAT_GUN_RIGS')[0];
  writeFileSync(resolve(RIGS_PATH), `${head}export const COMBAT_GUN_RIGS: Readonly<Record<string, CombatGunRig>> = Object.freeze({\n${lines.join('\n')}\n});\n`);
  console.log(`gun-barrel-align rigs: ${written.length} row(s) written to ${RIGS_PATH} (${Object.keys(rows).length} held)${written.length ? ': ' + written.join(', ') : ''}`);
  for (const line of skipped) console.log(`  no row: ${line}`);
  let drift = 0;
  for (const id of written) {
    applyCombatGunRig(getSpec(id).armor, rows[id]);
    const again = censusOne(id);
    report[report.findIndex((r) => r.id === id)] = again;
    const { row } = rowFor(again);
    if (row && JSON.stringify(row) !== JSON.stringify(rows[id])) {
      drift++;
      console.log(`${id}: the row is not a fixpoint (the build follows the combat frame): wrote ${JSON.stringify(rows[id])}, re-measured ${JSON.stringify(row)}`);
    }
  }
  if (drift) process.exitCode = 1;
}
const jsonPath = opt('json', '');
if (jsonPath) { writeFileSync(resolve(jsonPath), JSON.stringify({ generated: new Date().toISOString(), tolerance: ALIGN_TOLERANCE, seedPivotM: SEED_PIVOT_M, tanks: report }, null, 1) + '\n'); console.log(`wrote ${jsonPath}`); }
const off = report.filter((r) => !['aligned', 'launcher', 'no-barrel'].includes(r.status)).map((r) => `${r.id}${r.status === 'skewed' ? ' (skewed)' : ''}`);
console.log(`gun-barrel-align census: ${report.length} tank(s), ${off.length} not aligned${off.length ? ': ' + off.join(', ') : ''}`);

if (LEDGER_PATH) {
  const fleet = JSON.parse(readFileSync(resolve(FLEET_LEDGER_PATH), 'utf8')).tanks;
  const binding = (id, kind) => {
    const groups = fleet[id]?.high?.groups;
    return groups ? Object.fromEntries(boundGroups(kind).map((g) => [g, groups[g]])) : null;
  };
  const rowOf = (r) => {
    const row = { status: r.status, kind: r.kind ?? 'none', mouths: r.mouths ?? 0 };
    if (r.worst) Object.assign(row, { worst: r.worst, worstPose: r.worstPose, rest: r.rest });
    if (r.rig?.turretScale?.some((v) => Math.abs(v - 1) > 1e-4)) row.turretScale = r.rig.turretScale;
    row.combat = r.combat;
    row.geometry = binding(r.id, row.kind);
    return row;
  };
  const book = ledger ?? {
    schemaVersion: 1, generator: 'tools/gun-barrel-align-census.mjs --ledger', tolerance: ALIGN_TOLERANCE,
    binding: `turret and gun group digests (hull too for a gun fixed in the hull) of ${FLEET_LEDGER_PATH} at high quality, and tools/gun-barrel-align.mjs combatBarrelDigest`,
    tanks: {},
  };
  const near = (a, b, tol) => (a === null || b === null ? a === b : Math.abs(a - b) <= tol);
  let problems = 0;
  for (const r of report) {
    const row = rowOf(r);
    if (!row.geometry) { console.log(`${r.id}: no ${FLEET_LEDGER_PATH} row (run node tools/fleet-geometry-ledger.mjs --update --ids=${r.id} first)`); problems++; continue; }
    if (flag('update')) { book.tanks[r.id] = row; continue; }
    const held = book.tanks[r.id];
    if (!held) { console.log(`${r.id}: no gun-barrel-align ledger row`); problems++; continue; }
    const diffs = ['status', 'kind', 'mouths', 'combat'].filter((k) => held[k] !== row[k]).map((k) => `${k} ${held[k]} -> ${row[k]}`);
    for (const [key, tol] of [['offsetMm', 0.5], ['angleDeg', 0.02], ['axialMm', 0.5], ['radiusMm', 0.5]]) {
      if (!near(held.worst?.[key] ?? null, row.worst?.[key] ?? null, tol)) diffs.push(`${key} ${held.worst?.[key]} -> ${row.worst?.[key]}`);
    }
    for (const [group, digest] of Object.entries(row.geometry)) if (held.geometry?.[group] !== digest) diffs.push(`${group} geometry moved since the row was measured`);
    if (diffs.length) { console.log(`${r.id}: ledger differs: ${diffs.join('; ')}`); problems++; }
  }
  if (flag('update')) {
    const tanks = Object.fromEntries(Object.keys(book.tanks).sort().map((id) => [id, book.tanks[id]]));
    const head = JSON.stringify({ ...book, tanks: undefined }, null, 1).replace(/\n}$/, '');
    const body = Object.entries(tanks).map(([id, row]) => `  ${JSON.stringify(id)}: ${JSON.stringify(row)}`).join(',\n');
    writeFileSync(resolve(LEDGER_PATH), `${head},\n "tanks": {\n${body}\n }\n}\n`);
    console.log(`gun-barrel-align ledger: wrote ${report.length} row(s) to ${LEDGER_PATH} (${Object.keys(tanks).length} held)`);
  } else console.log(`gun-barrel-align ledger: ${problems ? `FAIL: ${problems} difference(s)` : `PASS: ${report.length} tank(s) match ${LEDGER_PATH}`}`);
  if (problems) process.exit(1);
}
if (flag('gate') && report.some((r) => r.failed)) process.exit(1);
