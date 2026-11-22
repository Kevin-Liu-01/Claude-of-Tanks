// Roof-station barrel probe (VH.02, 2026-10-14; split from tools/roof-station-arcs.mjs in 275 so the controls inventory
// reads it without that tool's canvas shim): where a remote roof station's barrel would sweep through the stock beside
// it. Each yaw is tested at the weapon profile's full depression, level and full elevation, along the barrel's axis and
// four lines a barrel radius off it, against every triangle of its own rig (the turret, or the hull for a hull station)
// outside the station's own moving stock (other stations at rest included). tools/roof-station-arcs.mjs is the CLI.
import * as THREE from 'three';
// 275: the station predicate, the barrel's reach and radius have one owner, the decor's station keep-out
import { barrelLinesProbe, degreeInArc, isRoofStation, receiptPitches, stationYawArc } from '../src/vehicles/stationSweepKeepOut.ts';
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

/** A clearance probe for one station: probe(yawRad, pitchRad) is true when the barrel at that pose touches stock
 *  (src/vehicles/stationSweepKeepOut.ts barrelLinesProbe, against the rig's triangles). */
export function stationProbe(root, station, only = null) {
  root.updateMatrixWorld(true);
  return barrelLinesProbe(station, obstacleTriangles(ownerRig(root, station), station, only));
}

/**
 * The traverse: blocked yaws (degrees, level to full elevation) and the clear arc round the rest bearing 0. Depression
 * is the depression table's business (stationDepression). `limits` = {elevationRad}. Pure over the built tank.
 */
export function stationSweep(root, station, limits, { stepDeg = 1, only = null } = {}) {
  const { probe, radius, length } = stationProbe(root, station, only);
  // Level to full elevation every 0.05 rad: a barrel lifting through a neighbour's barrel is caught on the way up.
  const pitches = receiptPitches(limits.elevationRad);
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

/**
 * Release 275 (lane roof-station-keepout-275): the decor inside each roof station's traverse on a tank built with its
 * decor. Each station's barrel lines are swept against the decor's triangles alone, every whole degree, level to full
 * elevation (stationSweep), and the blocked degrees inside the arc it traverses (stationYawArc: its own, else the
 * drone-stand table's) are reported as runs: [{ station, blockedDeg: [[from, to], ...] }], empty when the decor keeps clear.
 * tools/vehicle-controls-inventory.mjs writes it for every tank (src/vehicles/decorInStationArcs.generated.ts) and
 * src/vehicles/roofStationKeepOut.selftest.mjs fails on any entry; decorations.ts keeps the decor out by construction
 * (src/vehicles/stationSweepKeepOut.ts).
 */
export function decorInStationArcs(root, vehicleId) {
  const out = [];
  for (const station of stationsOf(root).stations) {
    const profile = auxiliaryWeaponProfile(station.userData.caliberMm || 12.7, vehicleId);
    const { blocked } = stationSweep(root, station, profile, { stepDeg: 1, only: isDecorMesh });
    const arc = stationYawArc(vehicleId, station);
    const inArc = blocked.filter((d) => degreeInArc(d, arc));
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

