// Roof-station barrel probe (VH.02, 2026-10-14; split from tools/roof-station-arcs.mjs in 275 so the controls inventory
// reads it without that tool's canvas shim): where a remote roof station's barrel would sweep through the stock beside
// it. Each yaw is tested at the weapon profile's full depression, level and full elevation, along the barrel's axis and
// four lines a barrel radius off it, against every triangle of its own rig (the turret, or the hull for a hull station)
// outside the station's own moving stock (other stations at rest included). tools/roof-station-arcs.mjs is the CLI.
import * as THREE from 'three';
// 275: the station predicate, the barrel's reach and radius have one owner, the decor's station keep-out
import { STATION_MIN_REACH_M as MIN_REACH_M, barrelSweepRadius, isRoofStation, stationYawArc } from '../src/vehicles/stationSweepKeepOut.ts';
import { auxiliaryWeaponProfile } from '../src/vehicles/auxiliaryWeapons.ts';

export function stationsOf(root) {
  const turret = root.getObjectByName('rig_turret'), out = [];
  root.traverse((o) => { if (isRoofStation(o)) out.push(o); });
  return { turret, stations: out };
}

/** A decor mesh: one under a rig_decor group (decorations.ts). */
function isDecorMesh(mesh) {
  for (let p = mesh; p; p = p.parent) if ((p.name || '').startsWith('rig_decor')) return true;
  return false;
}

/** The rig a station turns with (VH.14: hull-owned stations on turretless vehicles sweep against the hull's stock). */
function ownerRig(root, station) {
  for (let p = station; p; p = p.parent) if (p.name === 'rig_turret') return p;
  return root.getObjectByName('rig_hull') ?? root;
}

/** Turret triangles in one station's yaw frame (rest pose), skipping that station's own moving stock; `only` keeps the
 *  meshes it answers true for (275: the decor alone, for the fleet receipt). */
function obstacleTriangles(turret, station, only = null) {
  const own = new Set(); station.traverse((o) => own.add(o));
  const toLocal = new THREE.Matrix4().copy(station.matrixWorld).invert();
  const tris = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Matrix4();
  turret.traverseVisible((mesh) => {
    if (!mesh.isMesh || own.has(mesh) || mesh.userData.shadowOnly || !mesh.geometry?.getAttribute('position')) return;
    if (only && !only(mesh)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((mat) => mat && mat.visible !== false && mat.colorWrite !== false && !(mat.transparent && mat.opacity < .05))) return;
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const count = mesh.isInstancedMesh ? mesh.count : 1, inst = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      m.copy(toLocal).multiply(mesh.matrixWorld);
      if (mesh.isInstancedMesh) { mesh.getMatrixAt(k, inst); m.multiply(inst); }
      const n = index ? index.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(m); b.fromBufferAttribute(pos, ib).applyMatrix4(m); c.fromBufferAttribute(pos, ic).applyMatrix4(m);
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
  });
  return new Float64Array(tris);
}

/** Möller–Trumbore: does the segment o + t·d, t in [0, len], cross triangle i of `tris`? */
function segmentHits(tris, i, ox, oy, oz, dx, dy, dz, len) {
  const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
  const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az, e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az, u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 && t <= len;
}

/** A clearance probe for one station: probe(yawRad, pitchRad) is true when the barrel at that pose touches stock. */
export function stationProbe(root, station, only = null) {
  root.updateMatrixWorld(true);
  const tris = obstacleTriangles(ownerRig(root, station), station, only);
  const pivot = new THREE.Vector3(...station.userData.auxiliaryPivot);
  const muzzle = new THREE.Vector3(...(station.userData.auxiliaryMuzzle ?? [0, station.userData.barrelAxisLocalY, station.userData.muzzleLocalZ]));
  const radius = barrelSweepRadius(station.userData.caliberMm || 12.7);
  const reach = muzzle.clone().sub(pivot), length = reach.length();
  // Only triangles the barrel can reach: within its swept sphere round the trunnion.
  const near = [];
  for (let i = 0; i < tris.length; i += 9) {
    let close = false;
    for (let k = 0; k < 9 && !close; k += 3) close = Math.hypot(tris[i + k] - pivot.x, tris[i + k + 1] - pivot.y, tris[i + k + 2] - pivot.z) <= length + radius + .05;
    if (close) near.push(i);
  }
  const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
  const dir = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), start = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  const probe = (yaw, pitch) => {
    // The station's own construction: pitch about the trunnion (x), then yaw about the ring (y).
    dir.copy(reach).applyAxisAngle(xAxis, -pitch).normalize();
    start.copy(pivot).addScaledVector(dir, MIN_REACH_M).applyAxisAngle(yAxis, yaw);
    dir.applyAxisAngle(yAxis, yaw);
    side.crossVectors(dir, yAxis).normalize(); up.crossVectors(side, dir).normalize();
    for (const [sx, sy] of offsets) {
      const ox = start.x + side.x * sx + up.x * sy, oy = start.y + side.y * sx + up.y * sy, oz = start.z + side.z * sx + up.z * sy;
      for (const i of near) if (segmentHits(tris, i, ox, oy, oz, dir.x, dir.y, dir.z, length - MIN_REACH_M)) return true;
    }
    return false;
  };
  return { probe, radius, length };
}

/**
 * The traverse: blocked yaws (degrees, level to full elevation) and the clear arc round the rest bearing 0. Depression
 * is the depression table's business (stationDepression). `limits` = {elevationRad}. Pure over the built tank.
 */
export function stationSweep(root, station, limits, { stepDeg = 1, only = null } = {}) {
  const { probe, radius, length } = stationProbe(root, station, only);
  // Level to full elevation every 0.05 rad: a barrel lifting through a neighbour's barrel is caught on the way up.
  const pitches = [];
  for (let p = 0; p < limits.elevationRad; p += .05) pitches.push(p);
  pitches.push(limits.elevationRad);
  const blocked = [];
  for (let deg = -180; deg < 180; deg += stepDeg) {
    const yaw = deg * Math.PI / 180;
    if (pitches.some((pitch) => probe(yaw, pitch))) blocked.push(deg);
  }
  const isBlocked = new Set(blocked);
  let lo = 0, hi = 0;
  if (isBlocked.has(0)) return { name: station.name, blocked, arc: null, restBlocked: true, radius, length };
  while (lo - stepDeg > -360 && !isBlocked.has(((lo - stepDeg + 540) % 360) - 180)) lo -= stepDeg;
  while (hi + stepDeg < 360 && !isBlocked.has(((hi + stepDeg + 540) % 360) - 180)) hi += stepDeg;
  const full = hi - lo >= 360 - stepDeg;
  return { name: station.name, blocked, arc: full ? null : [lo, hi], restBlocked: false, radius, length };
}

/** The deepest depression the authority lets a station take at `yaw` (src/sim/auxiliarySystems.ts depressionAt). */
function depressionAt(station, yaw, weapon) {
  const table = station.userData.depressionByYaw;
  if (!table?.length || yaw < table[0][0] || yaw > table[table.length - 1][0]) return weapon;
  for (let i = 1; i < table.length; i++) if (yaw <= table[i][0]) return Math.min(weapon, table[i - 1][1], table[i][1]);
  return Math.min(weapon, table[table.length - 1][1]);
}

/**
 * Release 275 (lane roof-station-keepout-275): the decor inside each roof station's traverse on a tank built with its
 * decor. Each station's barrel lines are swept against the decor's triangles alone, every whole degree, from level to full
 * elevation (stationSweep) and down to the depression the authority allows it there (depressionAt: the weapon's, or its
 * mount's table), and the blocked degrees inside the arc it traverses (stationYawArc: its own, else the drone-stand
 * table's) are reported as runs: [{ station, blockedDeg: [[from, to], ...] }], empty when the decor keeps clear.
 * tools/vehicle-controls-inventory.mjs writes it for every tank (src/vehicles/decorInStationArcs.generated.ts) and
 * src/vehicles/roofStationKeepOut.selftest.mjs fails on any entry; decorations.ts keeps the decor out by construction
 * (src/vehicles/stationSweepKeepOut.ts).
 */
export function decorInStationArcs(root, vehicleId) {
  const out = [];
  for (const station of stationsOf(root).stations) {
    const profile = auxiliaryWeaponProfile(station.userData.caliberMm || 12.7, vehicleId);
    const { blocked } = stationSweep(root, station, profile, { stepDeg: 1, only: isDecorMesh });
    const { probe } = stationProbe(root, station, isDecorMesh);
    const hit = new Set(blocked);
    for (let deg = -180; deg < 180; deg++) {
      if (hit.has(deg)) continue;
      const yaw = deg * Math.PI / 180, d = depressionAt(station, yaw, profile.depressionRad);
      if (d > 0 && [d, d / 2].some((p) => probe(yaw, -p))) hit.add(deg);
    }
    const arc = stationYawArc(vehicleId, station);
    const lo = arc ? arc[0] * 180 / Math.PI : -Infinity, hi = arc ? arc[1] * 180 / Math.PI : Infinity;
    const inArc = [...hit].sort((a, b) => a - b).filter((d) => !arc || [-720, -360, 0, 360, 720].some((k) => d + k >= lo && d + k <= hi));
    if (!inArc.length) continue;
    const runs = [];
    for (const d of inArc) { const last = runs.at(-1); if (last && d - last[1] <= 1) last[1] = d; else runs.push([d, d]); }
    out.push({ station: station.name, blockedDeg: runs });
  }
  return out;
}

/** The deepest clear depression (radians, ≤ the profile's) at each sample yaw (degrees), searched to 0.005 rad. */
export function stationDepression(root, station, limits, yawsDeg) {
  const { probe } = stationProbe(root, station);
  return yawsDeg.map((deg) => {
    const yaw = deg * Math.PI / 180;
    if (!probe(yaw, -limits.depressionRad)) return limits.depressionRad;
    let clear = 0, hit = limits.depressionRad;
    while (hit - clear > .005) { const mid = (clear + hit) / 2; if (probe(yaw, -mid)) hit = mid; else clear = mid; }
    return Math.floor(clear * 1000) / 1000;
  });
}

