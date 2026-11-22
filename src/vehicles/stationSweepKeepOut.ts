// Release 275 (lane roof-station-keepout-275, from the owner's Oplot ask: the "light tower" must stop blocking the
// machine gun): no decor stands where a roof station's barrel turns. The decor seated its loads, whips and lamps without
// knowing where the stations swing: the fleet cargo's turretRoof route stood an insulated chest 0.5 m from the Oplot-T's
// M240 at its bore height, and a read-only fleet pass (integ/274.0) found 50 stations on 48 tanks with decor inside their
// authored traverse (object148_proto 88 degrees, leo2_improved 74, leo2a4_otco 58 ...). One keep-out serves them all, and
// reserves only what the barrel truly sweeps (the owner: only real blockers move; the fleet's dressing otherwise stays as
// it is): the barrel lines tools/roof-station-arcs.mjs sweeps (its axis from STATION_MIN_REACH_M to the muzzle,
// barrelSweepRadius round it), turned over the station's authored arc from level to full elevation, give the band of
// heights the barrel passes through over each radius from the yaw axis; a decor piece with a point in that band, inside
// the arc, is in the barrel's way, and decorations.ts turns it away (it takes its next station or route, or drops), as it turns away loads
// from a launcher's or a drone dock's volume. The fleet receipt (tools/vehicle-controls-inventory.mjs writes
// decorInStationArcs.generated.ts; roofStationKeepOut.selftest.mjs fails on any entry) measures the built decor against
// the same barrel lines.
import * as THREE from 'three';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { ROOF_STATION_ARCS } from './roofStationArcs.ts';

/** The barrel starts ahead of the trunnion block it is seated in (m). */
const STATION_MIN_REACH_M = 0.12;
/** The station's barrel radius for the sweep: a little over the calibre's tube, never under 3 cm. */
function barrelSweepRadius(caliberMm: number): number { return Math.max(0.03, caliberMm / 1000 * 1.6); }

/** A working roof station: a remote-controlled, +Z-firing auxiliary weapon with a pivot and a muzzle. */
export function isRoofStation(o: THREE.Object3D): boolean {
  const u = o.userData;
  return !!u && !u.primaryWeapon && !!u.remoteControlled && u.firingAxis === '+Z' && u.hasWeapon !== false
    && !!u.auxiliaryPivot && Number.isFinite(u.muzzleLocalZ);
}

/** The arc a station traverses inside (station-local yaw, radians round its rest bearing), null for the full circle: its
 *  own authored arc, else the drone-stand table's (roofStationArcs.ts), as the controls inventory resolves it. */
export function stationYawArc(vehicleId: string, station: THREE.Object3D): readonly [number, number] | null {
  const arc = (station.userData.yawArc as readonly [number, number] | undefined) ?? ROOF_STATION_ARCS[vehicleId]?.[station.name];
  return arc && Number.isFinite(arc[0]) && Number.isFinite(arc[1]) && arc[1] - arc[0] < 2 * Math.PI - 1e-6 ? arc : null;
}

/** Radial bin of a sweep's floor (fine: a bin's width is over-reach), the spacing of samples along a barrel or an edge,
 *  the decor's clearance under the barrel lines, and the elevation step between poses. */
const BIN_M = 0.005;
const SAMPLE_M = 0.02;
const CLEAR_M = 0.005;
const POSE_STEP_RAD = 0.05;
/** A partial arc's samples are grouped by rest bearing in bins this wide; nearer the axis than AXIS_M a sample has no
 *  useful bearing and joins the bin that sweeps the full circle. */
const BEARING_BIN_RAD = Math.PI / 12;
const AXIS_M = 0.1;

interface SweepBin {
  /** rest bearings (station-local, radians) the bin's samples span; -Infinity..Infinity for the full circle */
  a0: number;
  a1: number;
  /** the lowest and highest swept points (station-local y) over each radial bin from the yaw axis; +Infinity and
   *  -Infinity where nothing sweeps */
  floor: Float32Array;
  ceiling: Float32Array;
}
/** One station's reserved volume, read in its decor frame. */
export interface StationSweep {
  readonly name: string;
  /** decor frame → station-local (the yaw axis is local +Y through the origin) */
  readonly toStation: THREE.Matrix4;
  readonly arc: readonly [number, number] | null;
  readonly bins: readonly SweepBin[];
  /** the sweep's outer radius and lowest point (station-local), for a quick miss */
  readonly reach: number;
  readonly bottom: number;
  /** the station, and the pitches (radians) the receipt tests it at */
  readonly station: THREE.Object3D;
  readonly pitches: readonly number[];
}

/** The decor frame a station turns with: its nearest ancestor among `frames`. */
function frameOf(station: THREE.Object3D, frames: readonly THREE.Object3D[]): THREE.Object3D | null {
  for (let p = station.parent; p; p = p.parent) if (frames.includes(p)) return p;
  return null;
}

/** The plan distance from the origin to the segment (ax, az)-(bx, bz). */
function segmentDistance(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / l2)) : 0;
  const px = ax + dx * t, pz = az + dz * t;
  return Math.sqrt(px * px + pz * pz);
}

/** Bearing bins of one station, made as samples arrive. */
class FloorBins {
  readonly full: SweepBin;
  readonly byBearing = new Map<number, SweepBin>();
  readonly size: number;
  readonly partial: boolean;
  constructor(size: number, partial: boolean) {
    this.size = size;
    this.partial = partial;
    this.full = { a0: -Infinity, a1: Infinity, floor: new Float32Array(size).fill(Infinity), ceiling: new Float32Array(size).fill(-Infinity) };
  }
  /** The swept band yLo..yHi over radii rMin..rMax for samples at rest bearings a0..a1 (unwrapped, a1 - a0 < pi). */
  stamp(rMin: number, rMax: number, yLo: number, yHi: number, a0: number, a1: number): void {
    let bin = this.full;
    if (this.partial && rMin > AXIS_M) {
      const key = Math.floor(((a0 + a1) / 2) / BEARING_BIN_RAD);
      bin = this.byBearing.get(key)
        ?? { a0: Infinity, a1: -Infinity, floor: new Float32Array(this.size).fill(Infinity), ceiling: new Float32Array(this.size).fill(-Infinity) };
      this.byBearing.set(key, bin);
      bin.a0 = Math.min(bin.a0, a0); bin.a1 = Math.max(bin.a1, a1);
    }
    const i0 = Math.max(0, Math.floor(rMin / BIN_M)), i1 = Math.min(this.size - 1, Math.floor(rMax / BIN_M));
    const f = yLo - CLEAR_M, c = yHi + CLEAR_M;
    for (let i = i0; i <= i1; i++) { if (f < bin.floor[i]) bin.floor[i] = f; if (c > bin.ceiling[i]) bin.ceiling[i] = c; }
  }
}

/** The rest bearing interval of plan points (x, z) round the origin, unwrapped about the first. */
function bearingSpan(xs: ArrayLike<number>, zs: ArrayLike<number>, count = xs.length): [number, number] {
  const ref = Math.atan2(xs[0], zs[0]);
  let lo = ref, hi = ref;
  for (let i = 1; i < count; i++) {
    let a = Math.atan2(xs[i], zs[i]);
    while (a - ref > Math.PI) a -= 2 * Math.PI;
    while (a - ref < -Math.PI) a += 2 * Math.PI;
    lo = Math.min(lo, a); hi = Math.max(hi, a);
  }
  return [lo, hi];
}

/**
 * The barrel's sweep of one station, station-local: the axis from STATION_MIN_REACH_M to the muzzle, barrelSweepRadius
 * round it (tools/roof-station-arcs.mjs stationProbe's lines), posed from level to full elevation every POSE_STEP_RAD
 * (each pose and the next stamped, so the chord between them is covered), stamps its lowest point over the radii it
 * reaches, so a piece the keep-out passes is one the receipt passes.
 */
function sweepStation(station: THREE.Object3D, vehicleId: string): { bins: SweepBin[]; reach: number; bottom: number } | null {
  const u = station.userData;
  const profile = auxiliaryWeaponProfile(Number(u.caliberMm) || 12.7, vehicleId);
  const elevation = Math.max(0, profile.elevationRad);
  const poses: number[] = [];
  for (let p = 0; p < elevation; p += POSE_STEP_RAD) poses.push(p);
  poses.push(elevation);
  const pivot = new THREE.Vector3(...(u.auxiliaryPivot as [number, number, number]));
  const muzzle = new THREE.Vector3(...((u.auxiliaryMuzzle as [number, number, number] | undefined) ?? [0, u.barrelAxisLocalY ?? 0, u.muzzleLocalZ]));
  const radius = barrelSweepRadius(Number(u.caliberMm) || 12.7);
  const reachVec = muzzle.clone().sub(pivot), length = reachVec.length();
  if (!(length > STATION_MIN_REACH_M)) return null;
  const reachMax = Math.hypot(pivot.x, pivot.z) + length + radius;
  const bins = new FloorBins(Math.ceil(reachMax / BIN_M) + 2, !!stationYawArc(vehicleId, station));
  const dir = new THREE.Vector3(), point = new THREE.Vector3(), xAxis = new THREE.Vector3(1, 0, 0);
  const steps = Math.max(1, Math.ceil((length - STATION_MIN_REACH_M) / SAMPLE_M));
  for (let p = 0; p < poses.length; p++) {
    for (const pose of p ? [poses[p - 1], poses[p]] : [poses[p]]) {
      dir.copy(reachVec).applyAxisAngle(xAxis, -pose).normalize();
      for (let s = 0; s <= steps; s++) {
        const t = STATION_MIN_REACH_M + (length - STATION_MIN_REACH_M) * s / steps;
        point.copy(pivot).addScaledVector(dir, t);
        const r = Math.hypot(point.x, point.z);
        // the lines a barrel radius off the axis reach no farther out than the axis point beside them (no end cap past the
        // muzzle: the receipt's barrel is its lines), and as near as a radius in
        const a = Math.atan2(point.x, point.z), w = r > radius ? Math.asin(radius / r) : Math.PI;
        bins.stamp(Math.max(0, r - radius), Math.hypot(r, radius), point.y - radius, point.y + radius, a - w, a + w);
      }
    }
  }
  let bottom = Infinity;
  const all = [bins.full, ...bins.byBearing.values()];
  for (const bin of all) for (const f of bin.floor) bottom = Math.min(bottom, f);
  return { bins: all.filter((bin) => bin.floor.some(Number.isFinite)), reach: (bins.size - 1) * BIN_M, bottom };
}

/**
 * The reserved volumes of the stations that turn with `frame` (hullG or turretG, among `frames`), read in its own
 * coordinates. Built once per decoration pass, from the built tank before any decor is seated.
 */
export function stationSweepKeepOut(frame: THREE.Object3D, frames: readonly THREE.Object3D[], vehicleId: string): StationSweep[] {
  const stations: THREE.Object3D[] = [];
  frame.traverse((o) => { if (isRoofStation(o) && frameOf(o, frames) === frame) stations.push(o); });
  if (!stations.length) return [];
  frame.updateWorldMatrix(true, true);
  const out: StationSweep[] = [];
  for (const station of stations) {
    const swept = sweepStation(station, vehicleId);
    if (!swept || !swept.bins.length) continue;
    const toStation = new THREE.Matrix4().copy(station.matrixWorld).invert().multiply(frame.matrixWorld);
    const profile = auxiliaryWeaponProfile(Number(station.userData.caliberMm) || 12.7, vehicleId);
    out.push({ name: station.name, toStation, arc: stationYawArc(vehicleId, station), ...swept, station, pitches: receiptPitches(profile.elevationRad) });
  }
  return out;
}

const corner = new THREE.Vector3();
const PX = new Float64Array(8), PY = new Float64Array(8), PZ = new Float64Array(8);
/** The station whose barrel sweep a frame-local box may enter (its height range meets the swept band anywhere in its
 *  plan within the authored arc), or null: a coarse test, which stationSweepMetGeometry settles point by point. */
export function stationSweepMet(sweeps: readonly StationSweep[], box: THREE.Box3): StationSweep | null {
  if (box.isEmpty()) return null;
  for (const sweep of sweeps) {
    let top = -Infinity, low = Infinity;
    for (let k = 0; k < 8; k++) {
      corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyMatrix4(sweep.toStation);
      PX[k] = corner.x; PY[k] = corner.y; PZ[k] = corner.z;
      top = Math.max(top, corner.y); low = Math.min(low, corner.y);
    }
    if (top < sweep.bottom) continue;
    // the box's plan, as the hull of its eight corners: its nearest and farthest radius and its bearing span
    let rMax = 0;
    for (let k = 0; k < 8; k++) rMax = Math.max(rMax, Math.hypot(PX[k], PZ[k]));
    const rMin = planHullDistance();
    if (rMin > sweep.reach) continue;
    let span: [number, number] | null = null;
    if (sweep.arc && rMin > 0) span = bearingSpan(PX, PZ, 8);
    const i0 = Math.max(0, Math.floor(rMin / BIN_M)), i1 = Math.floor(rMax / BIN_M);
    for (const bin of sweep.bins) {
      if (span && sweep.arc && Number.isFinite(bin.a0)) {
        // the bin's samples swept over the arc, widened by the clearance at the box's nearest radius
        const w = rMin > CLEAR_M ? Math.asin(Math.min(1, CLEAR_M / rMin)) : Math.PI;
        const lo = bin.a0 + sweep.arc[0] - w, hi = bin.a1 + sweep.arc[1] + w;
        if (!bearingsOverlap(lo, hi, span[0], span[1])) continue;
      }
      for (let i = i0; i <= i1 && i < bin.floor.length; i++) if (top >= bin.floor[i] && low <= bin.ceiling[i]) return sweep;
    }
  }
  return null;
}

/** The pitches the receipt sweeps a station at (tools/roof-station-probe.mjs stationSweep): level to full elevation every
 *  0.05 rad, and full elevation. */
export function receiptPitches(elevationRad: number): number[] {
  const out: number[] = [];
  for (let p = 0; p < elevationRad; p += 0.05) out.push(p);
  out.push(elevationRad);
  return out;
}

/** Möller–Trumbore: does the segment o + t·d, t in [0, len], cross triangle i of `tris`? */
function segmentHits(tris: Float64Array, i: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  len: number): boolean {
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

/**
 * The barrel's lines for one station against station-local triangles (VH.02; one owner since 275, read by
 * tools/roof-station-probe.mjs and the decor keep-out alike): probe(yaw, pitch) is true when the barrel at that pose (its
 * axis from STATION_MIN_REACH_M to the muzzle and four lines barrelSweepRadius off it) crosses a triangle.
 */
export function barrelLinesProbe(station: THREE.Object3D, tris: Float64Array):
  { probe: (yaw: number, pitch: number) => boolean; radius: number; length: number } {
  const u = station.userData;
  const pivot = new THREE.Vector3(...(u.auxiliaryPivot as [number, number, number]));
  const muzzle = new THREE.Vector3(...((u.auxiliaryMuzzle as [number, number, number] | undefined) ?? [0, u.barrelAxisLocalY, u.muzzleLocalZ]));
  const radius = barrelSweepRadius(Number(u.caliberMm) || 12.7);
  const reach = muzzle.clone().sub(pivot), length = reach.length();
  // only triangles the barrel can reach: within its swept sphere round the trunnion
  const near: number[] = [];
  for (let i = 0; i < tris.length; i += 9) {
    let close = false;
    for (let k = 0; k < 9 && !close; k += 3) close = Math.hypot(tris[i + k] - pivot.x, tris[i + k + 1] - pivot.y, tris[i + k + 2] - pivot.z) <= length + radius + 0.05;
    if (close) near.push(i);
  }
  const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
  const dir = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), start = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  const probe = (yaw: number, pitch: number): boolean => {
    if (!near.length) return false;
    // the station's own construction: pitch about the trunnion (x), then yaw about the ring (y)
    dir.copy(reach).applyAxisAngle(xAxis, -pitch).normalize();
    start.copy(pivot).addScaledVector(dir, STATION_MIN_REACH_M).applyAxisAngle(yAxis, yaw);
    dir.applyAxisAngle(yAxis, yaw);
    side.crossVectors(dir, yAxis).normalize(); up.crossVectors(side, dir).normalize();
    for (const [sx, sy] of offsets) {
      const ox = start.x + side.x * sx + up.x * sy, oy = start.y + side.y * sx + up.y * sy, oz = start.z + side.z * sx + up.z * sy;
      for (const i of near) if (segmentHits(tris, i, ox, oy, oz, dir.x, dir.y, dir.z, length - STATION_MIN_REACH_M)) return true;
    }
    return false;
  };
  return { probe, radius, length };
}

/** Whether whole degree `deg` lies inside `arc` (radians; null for the full circle), as the receipt reads it. */
export function degreeInArc(deg: number, arc: readonly [number, number] | null): boolean {
  if (!arc) return true;
  const lo = arc[0] * 180 / Math.PI, hi = arc[1] * 180 / Math.PI;
  return [-720, -360, 0, 360, 720].some((k) => deg + k >= lo && deg + k <= hi);
}

/**
 * Whether placed geometry (each geometry under `matrix`, frame-local) stands in a station's barrel's way exactly as the
 * receipt judges it: the station's barrel lines (barrelLinesProbe) at every whole degree inside its arc and every receipt
 * pitch, against the geometry's triangles. The band test (stationSweepMet) only picks the placements worth this.
 */
export function stationSweepBlocks(sweeps: readonly StationSweep[], geos: readonly THREE.BufferGeometry[], matrix: THREE.Matrix4): boolean {
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const sweep of sweeps) {
    m.multiplyMatrices(sweep.toStation, matrix);
    const tris: number[] = [];
    let lo = Infinity, hi = -Infinity, rMin = Infinity, ref = NaN;
    for (const geo of geos) {
      const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!pos) continue;
      const index = geo.getIndex(), n = index ? index.count : pos.count;
      for (let k = 0; k + 2 < n; k += 3) for (let c = 0; c < 3; c++) {
        v.fromBufferAttribute(pos, index ? index.getX(k + c) : k + c).applyMatrix4(m);
        tris.push(v.x, v.y, v.z);
        // the bearings the geometry spans round the yaw axis, unwrapped about its first point
        const r = Math.hypot(v.x, v.z);
        rMin = Math.min(rMin, r);
        let a = Math.atan2(v.x, v.z);
        if (Number.isNaN(ref)) ref = a;
        while (a - ref > Math.PI) a -= 2 * Math.PI;
        while (a - ref < -Math.PI) a += 2 * Math.PI;
        lo = Math.min(lo, a); hi = Math.max(hi, a);
      }
    }
    if (!tris.length) continue;
    const { probe, radius } = barrelLinesProbe(sweep.station, Float64Array.from(tris));
    // yaws whose barrel can reach the geometry's bearings: their span, widened by the barrel's radius and the trunnion's
    // offset from the axis at the geometry's nearest radius (every yaw when it comes near the axis)
    const pivot = sweep.station.userData.auxiliaryPivot as [number, number, number];
    const wide = rMin > 0.2 ? Math.asin(Math.min(1, (radius + Math.hypot(pivot[0], pivot[2]) + 0.05) / rMin)) + Math.PI / 90 : Math.PI;
    for (let deg = -180; deg < 180; deg++) {
      if (!degreeInArc(deg, sweep.arc)) continue;
      const yaw = deg * Math.PI / 180;
      if (wide < Math.PI && !bearingsOverlap(lo - wide, hi + wide, yaw, yaw)) continue;
      if (sweep.pitches.some((p) => probe(yaw, p))) return true;
    }
  }
  return false;
}

/** Whether bearing intervals [a0, a1] and [b0, b1] (radians, each shorter than a turn or a whole turn) share a bearing. */
function bearingsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  if (a1 - a0 >= 2 * Math.PI) return true;
  const turn = 2 * Math.PI;
  for (const k of [-2, -1, 0, 1, 2]) if (b0 + k * turn <= a1 && b1 + k * turn >= a0) return true;
  return false;
}

/** The plan distance from the yaw axis to the hull of PX/PZ's eight points (0 when the hull holds the axis). */
function planHullDistance(): number {
  // monotone chain over the eight corners (an upright box gives four distinct points)
  const idx = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => PX[a] - PX[b] || PZ[a] - PZ[b]);
  const cross = (o: number, a: number, b: number): number => (PX[a] - PX[o]) * (PZ[b] - PZ[o]) - (PZ[a] - PZ[o]) * (PX[b] - PX[o]);
  const lower: number[] = [], upper: number[] = [];
  for (const i of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop(); lower.push(i); }
  for (let j = idx.length - 1; j >= 0; j--) {
    const i = idx[j];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length < 3) {
    let d = Infinity;
    for (let k = 0; k < hull.length; k++) d = Math.min(d, segmentDistance(PX[hull[k]], PZ[hull[k]], PX[hull[(k + 1) % hull.length]], PZ[hull[(k + 1) % hull.length]]));
    return d;
  }
  let inside = true, d = Infinity;
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k], b = hull[(k + 1) % hull.length];
    // counter-clockwise hull: the origin is inside when it is left of every edge
    if ((PX[b] - PX[a]) * (0 - PZ[a]) - (PZ[b] - PZ[a]) * (0 - PX[a]) < 0) inside = false;
    d = Math.min(d, segmentDistance(PX[a], PZ[a], PX[b], PZ[b]));
  }
  return inside ? 0 : d;
}
