// Release 275 (lane roof-station-keepout-275, from the owner's Oplot ask: the "light tower" must stop blocking the
// machine gun): every roof station's swept volume is reserved from the decor. The decor seated its loads, whips and lamps
// without knowing where the stations swing: the fleet cargo's turretRoof route stood an insulated chest 0.5 m from the
// Oplot-T's M240 at its bore height, and a read-only fleet pass (integ/274.0) found 50 stations on 48 tanks with decor
// inside their authored traverse (object148_proto 88 degrees, leo2_improved 74, leo2a4_otco 58 ...). One keep-out now
// serves them all: a station's barrel and moving stock, swept round its yaw axis over its authored arc from level to full
// elevation, is a floor over each radius from the axis; a decor piece whose top stands above that floor anywhere in its
// footprint is in the sweep, and decorations.ts turns it away (it takes its next station or route, or drops), as it turns
// away loads from a launcher's or a drone dock's volume. The fleet receipt (tools/vehicle-controls-inventory.mjs writes
// decorInStationArcs.generated.ts; roofStationKeepOut.selftest.mjs fails on any entry) measures the built decor against
// the barrel lines tools/roof-station-arcs.mjs sweeps.
import * as THREE from 'three';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { ROOF_STATION_ARCS } from './roofStationArcs.ts';

/** The barrel starts ahead of the trunnion block it is seated in (m). */
export const STATION_MIN_REACH_M = 0.12;
/** The station's barrel radius for the sweep: a little over the calibre's tube, never under 3 cm. */
export function barrelSweepRadius(caliberMm: number): number { return Math.max(0.03, caliberMm / 1000 * 1.6); }

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

/** Radial bin of a sweep's floor, the decor's clearance off the swept surface, and the elevation step between poses. */
const BIN_M = 0.02;
const CLEAR_M = 0.02;
const POSE_STEP_RAD = 0.05;
/** A partial arc's samples are grouped by rest bearing in bins this wide; nearer the axis than AXIS_M a sample has no
 *  useful bearing and joins the bin that sweeps the full circle. */
const BEARING_BIN_RAD = Math.PI / 12;
const AXIS_M = 0.1;

interface SweepBin {
  /** rest bearings (station-local, radians) the bin's samples span; -Infinity..Infinity for the full circle */
  a0: number;
  a1: number;
  /** the lowest swept point (station-local y) over each radial bin from the yaw axis; +Infinity where nothing sweeps */
  floor: Float32Array;
}
/** One station's reserved volume, read in its decor frame. */
export interface StationSweep {
  readonly name: string;
  /** decor frame → station-local (the yaw axis is local +Y through the origin) */
  readonly toStation: THREE.Matrix4;
  readonly arc: readonly [number, number] | null;
  readonly bins: readonly SweepBin[];
  /** the sweep's outer radius and lowest floor (station-local), for a quick miss */
  readonly reach: number;
  readonly bottom: number;
}

/** The decor frame a station turns with: its nearest ancestor among `frames`. */
function frameOf(station: THREE.Object3D, frames: readonly THREE.Object3D[]): THREE.Object3D | null {
  for (let p = station.parent; p; p = p.parent) if (frames.includes(p)) return p;
  return null;
}

/** The meshes of a station's moving stock that a sweep reads: drawn, not shadow stand-ins or markings. */
function stockMeshes(station: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  station.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.shadowOnly || /Shadow/.test(mesh.name) || /^vehicleMarking/.test(mesh.name)) return;
    for (let p: THREE.Object3D | null = mesh; p && p !== station.parent; p = p.parent) if (p.visible === false) return;
    if (!mesh.geometry?.getAttribute('position')) return;
    out.push(mesh);
  });
  return out;
}

/** The nearest distance from the yaw axis (the origin) to the triangle (ax, az), (bx, bz), (cx, cz) in plan. */
function planTriangleDistance(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const d1 = (bx - ax) * (0 - az) - (bz - az) * (0 - ax), d2 = (cx - bx) * (0 - bz) - (cz - bz) * (0 - bx);
  const d3 = (ax - cx) * (0 - cz) - (az - cz) * (0 - cx);
  if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return 0;
  return Math.min(segmentDistance(ax, az, bx, bz), segmentDistance(bx, bz, cx, cz), segmentDistance(cx, cz, ax, az));
}
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
    this.full = { a0: -Infinity, a1: Infinity, floor: new Float32Array(size).fill(Infinity) };
  }
  /** The floor `y` over radii rMin..rMax for samples at rest bearings a0..a1 (unwrapped, a1 - a0 < pi). */
  stamp(rMin: number, rMax: number, y: number, a0: number, a1: number): void {
    let bin = this.full;
    if (this.partial && rMin > AXIS_M) {
      const key = Math.floor(((a0 + a1) / 2) / BEARING_BIN_RAD);
      bin = this.byBearing.get(key) ?? { a0: Infinity, a1: -Infinity, floor: new Float32Array(this.size).fill(Infinity) };
      this.byBearing.set(key, bin);
      bin.a0 = Math.min(bin.a0, a0); bin.a1 = Math.max(bin.a1, a1);
    }
    const i0 = Math.max(0, Math.floor((rMin - CLEAR_M) / BIN_M)), i1 = Math.min(this.size - 1, Math.floor((rMax + CLEAR_M) / BIN_M));
    const f = y - CLEAR_M;
    for (let i = i0; i <= i1; i++) if (f < bin.floor[i]) bin.floor[i] = f;
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
 * The swept volume of one station, station-local: each triangle of its moving stock (the pitch group posed from level
 * to full elevation every POSE_STEP_RAD, each step's two poses stamped together so the chord between them is covered;
 * the yaw stage at rest) stamps its lowest point over the radii it spans, and the barrel lines tools/roof-station-arcs.mjs
 * sweeps (the axis from STATION_MIN_REACH_M to the muzzle, barrelSweepRadius round it) stamp theirs, so a piece the keep-out
 * passes is one the receipt passes. Pure over the built station: its pitch group is posed and put back.
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
  const meshes = stockMeshes(station);
  const pitchNode = station.getObjectByName('auxiliaryWeaponPitch');
  const pitched = new Set<THREE.Mesh>();
  pitchNode?.traverse((o) => { if ((o as THREE.Mesh).isMesh) pitched.add(o as THREE.Mesh); });
  station.updateWorldMatrix(true, true);
  const toStation = new THREE.Matrix4().copy(station.matrixWorld).invert();
  // the farthest any stock or barrel point reaches from the axis (an upper bound: the floor's length)
  const pivotR = Math.hypot(pivot.x, pivot.z);
  let reachMax = pivotR + length + radius;
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    m.multiplyMatrices(toStation, mesh.matrixWorld);
    const fromPivot = pitched.has(mesh);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      reachMax = Math.max(reachMax, fromPivot ? pivotR + v.distanceTo(pivot) : Math.sqrt(v.x * v.x + v.z * v.z));
    }
  }
  const partial = !!stationYawArc(vehicleId, station);
  const bins = new FloorBins(Math.ceil((reachMax + 2 * CLEAR_M) / BIN_M) + 1, partial);
  const xs = [0, 0, 0, 0, 0, 0], zs = [0, 0, 0, 0, 0, 0];
  const point = new THREE.Vector3();
  // a mesh's vertices at one pose, station-local, into a scratch array
  const posed = (mesh: THREE.Mesh, out: Float64Array): void => {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    m.multiplyMatrices(toStation, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
  };
  // each triangle stamps its lowest corner over the radii it spans; with `b`, the band between that pose and the last
  const stampTriangles = (mesh: THREE.Mesh, a: Float64Array, b: Float64Array | null): void => {
    const index = mesh.geometry.getIndex(), n = index ? index.count : a.length / 3;
    const corners = b ? 6 : 3;
    for (let k = 0; k + 2 < n; k += 3) {
      let y = Infinity, rMax = 0, rLo = Infinity, edge = 0, step = 0;
      for (let c = 0; c < 3; c++) {
        const i = (index ? index.getX(k + c) : k + c) * 3;
        xs[c] = a[i]; zs[c] = a[i + 2]; y = Math.min(y, a[i + 1]);
        if (b) { xs[c + 3] = b[i]; zs[c + 3] = b[i + 2]; y = Math.min(y, b[i + 1]); const sx = xs[c + 3] - xs[c], sz = zs[c + 3] - zs[c]; step = Math.max(step, sx * sx + sz * sz); }
      }
      for (let c = 0; c < corners; c++) { const r = Math.sqrt(xs[c] * xs[c] + zs[c] * zs[c]); rMax = Math.max(rMax, r); rLo = Math.min(rLo, r); }
      for (let c = 0; c < 3; c++) { const ex = xs[(c + 1) % 3] - xs[c], ez = zs[(c + 1) % 3] - zs[c]; edge = Math.max(edge, ex * ex + ez * ez); }
      edge = Math.sqrt(edge); step = Math.sqrt(step);
      // the nearest radius: within a bin of the corners for a small triangle (no point of it is farther than its longest
      // edge from a corner), measured for a large one. With `b`, every point of the band between the poses lies within
      // its corners' largest step of the first pose's triangle (a rotation's step is linear in the point; the arc's bulge
      // over a 0.05 rad step is under a millimetre).
      let rMin = edge <= BIN_M ? rLo - edge : planTriangleDistance(xs[0], zs[0], xs[1], zs[1], xs[2], zs[2]);
      rMin = Math.max(0, rMin - step);
      if (partial && rMin > AXIS_M) {
        const [a0, a1] = bearingSpan(xs, zs, corners);
        bins.stamp(rMin, rMax, y, a0, a1);
      } else bins.stamp(rMin, rMax, y, 0, 0);
    }
  };
  const scratch = new Map<THREE.Mesh, Float64Array>();
  const buffer = (mesh: THREE.Mesh, slot: number): Float64Array => {
    const n = (mesh.geometry.getAttribute('position') as THREE.BufferAttribute).count * 3;
    let arr = scratch.get(mesh);
    if (!arr) { arr = new Float64Array(n * 2); scratch.set(mesh, arr); }
    return arr.subarray(slot * n, slot * n + n);
  };
  // the yaw stage, at rest
  for (const mesh of meshes) {
    if (pitched.has(mesh)) continue;
    const a = buffer(mesh, 0);
    posed(mesh, a);
    stampTriangles(mesh, a, null);
  }
  // the pitch group, posed level to full elevation (as the presentation and ghillieSuit.ts roofWeaponFloor pose it)
  const pitchMeshes = meshes.filter((mesh) => pitched.has(mesh));
  if (pitchNode && pitchMeshes.length) {
    // posed as the presentation poses it (fx/auxiliaryPresentation.ts: rotation.x = -pitch, rest level), through the
    // node's local matrix so a node whose matrix is not auto-updated poses too; put back exactly as it stood
    const savedMatrix = pitchNode.matrix.clone(), savedAuto = pitchNode.matrixAutoUpdate;
    const euler = pitchNode.rotation.clone(), q = new THREE.Quaternion();
    try {
      pitchNode.matrixAutoUpdate = false;
      for (let p = 0; p < poses.length; p++) {
        euler.x = -poses[p];
        pitchNode.matrix.compose(pitchNode.position, q.setFromEuler(euler), pitchNode.scale);
        pitchNode.updateWorldMatrix(false, true);
        for (const mesh of pitchMeshes) {
          const cur = buffer(mesh, p & 1), prev = buffer(mesh, (p + 1) & 1);
          posed(mesh, cur);
          stampTriangles(mesh, cur, p ? prev : null);
        }
      }
    } finally {
      pitchNode.matrix.copy(savedMatrix);
      pitchNode.matrixAutoUpdate = savedAuto;
      pitchNode.updateWorldMatrix(false, true);
    }
  }
  // the barrel lines (tools/roof-station-arcs.mjs stationProbe): the axis, the radius round it, each pose and the next
  const dir = new THREE.Vector3(), xAxis = new THREE.Vector3(1, 0, 0);
  const steps = Math.max(1, Math.ceil((length - STATION_MIN_REACH_M) / BIN_M));
  for (let p = 0; p < poses.length; p++) {
    for (const pose of p ? [poses[p - 1], poses[p]] : [poses[p]]) {
      dir.copy(reachVec).applyAxisAngle(xAxis, -pose).normalize();
      for (let s = 0; s <= steps; s++) {
        const t = STATION_MIN_REACH_M + (length - STATION_MIN_REACH_M) * s / steps;
        point.copy(pivot).addScaledVector(dir, t);
        const r = Math.hypot(point.x, point.z);
        const a = Math.atan2(point.x, point.z), w = r > radius ? Math.asin(radius / r) : Math.PI;
        bins.stamp(Math.max(0, r - radius), r + radius, point.y - radius, a - w, a + w);
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
    out.push({ name: station.name, toStation, arc: stationYawArc(vehicleId, station), ...swept });
  }
  return out;
}

const corner = new THREE.Vector3();
const PX = new Float64Array(8), PY = new Float64Array(8), PZ = new Float64Array(8);
/** The station whose swept volume a frame-local box enters (its top over the sweep's floor anywhere in its plan within
 *  the authored arc), or null. */
export function stationSweepMet(sweeps: readonly StationSweep[], box: THREE.Box3): StationSweep | null {
  if (box.isEmpty()) return null;
  for (const sweep of sweeps) {
    let top = -Infinity;
    for (let k = 0; k < 8; k++) {
      corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyMatrix4(sweep.toStation);
      PX[k] = corner.x; PY[k] = corner.y; PZ[k] = corner.z;
      top = Math.max(top, corner.y);
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
      for (let i = i0; i <= i1 && i < bin.floor.length; i++) if (top >= bin.floor[i]) return sweep;
    }
  }
  return null;
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
