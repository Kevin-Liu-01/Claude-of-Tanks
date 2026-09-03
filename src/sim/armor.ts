/**
 * armor.ts — armor zone lookup: traces world-space shell segments through a
 * tank's ArmorModel (closed collision shells, precise module/crew volumes,
 * external plates and gun barrel) and returns
 * ordered intersections for damage resolution and HUD/AI armor queries.
 *
 * Pure-logic module (ARCHITECTURE.md §3.5.2): three math classes only, no
 * top-level side effects, node-runnable.
 *
 * Frames (ARCHITECTURE.md §1.1, §2.3):
 * - Hull local: origin at ground-contact center, +Z forward, +Y up. The visual
 *   root mapping is locked as rotation.order 'YXZ' with rotation.y = yaw,
 *   rotation.x = -visualPitch, rotation.z = visualRoll; this module implements
 *   the exact inverse of that transform.
 * - Turret local: hull local translated by armorModel.turretPivot then rotated
 *   by turretYaw about +Y. Turret plates/boxes live here.
 * - Gun-follow frame: turret local additionally pitched by gunPitch about the
 *   trunnion (armorModel.gunPivot, X axis). Mantlet plates with
 *   gunFollow:true live here; the barrel cylinder runs along +Z from the
 *   trunnion.
 */

import { Vector3, Matrix4, Quaternion, Euler } from 'three';
import type { ModuleId } from './moduleCatalog.ts';

type FrameIndex = 0 | 1 | 2 | 3;
type Vec3Tuple = readonly [number, number, number];
type TrackModuleId = 'trackL' | 'trackR';

export interface ArmorPoseState {
  pos: Vector3;
  yaw: number;
  visualPitch: number;
  visualRoll: number;
  turretYaw: number;
  gunPitch: number;
}

export interface TankArmorPose {
  pos: Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
}

export interface EraProtection {
  keReduction: number;
  ceFlatMm: number;
}

export interface ArmorPlate {
  name: string;
  verts: readonly Vec3Tuple[];
  physicalMm: number;
  keMm: number;
  ceMm: number;
  kind: 'main' | 'spaced' | 'external' | 'era' | string;
  era?: EraProtection | null;
  moduleLink?: ModuleId | null;
  gunFollow?: boolean;
}

export interface ArmorCollisionFace {
  indices: readonly number[];
  normal: Vec3Tuple;
  center: Vec3Tuple;
  internal?: boolean;
  constant: number;
  plate: ArmorPlate;
}

export interface ArmorCollisionCell {
  min: Vec3Tuple;
  max: Vec3Tuple;
  vertices: readonly Vec3Tuple[];
  faces: ArmorCollisionFace[];
}

interface AabbPart {
  min: Vec3Tuple;
  max: Vec3Tuple;
  center?: Vec3Tuple;
  kind?: never;
}

interface EllipsoidShape {
  kind: 'ellipsoid';
  center: Vec3Tuple;
  radii: Vec3Tuple;
}

interface EllipticCylinderShape {
  kind: 'ellipticCylinder';
  center: Vec3Tuple;
  radii: readonly [number, number];
  axis: 0 | 1 | 2;
  halfLength: number;
}

interface CapsuleShape {
  kind: 'capsule';
  a: Vec3Tuple;
  b: Vec3Tuple;
  radius: number;
}

type ArmorVolumeShape = EllipsoidShape | EllipticCylinderShape | CapsuleShape;

interface ArmorVolumeBase extends AabbPart {
  turretLocal?: boolean;
  external?: boolean;
  shapes?: ArmorVolumeShape[];
  parts?: AabbPart[];
}

interface ArmorModuleVolume extends ArmorVolumeBase {
  module: ModuleId;
}

interface ArmorCrewVolume extends ArmorVolumeBase {
  crew: string;
}

interface TrackPrismShape {
  x0: number;
  x1: number;
  poly: readonly (readonly [number, number])[];
  module: TrackModuleId;
  plate: ArmorPlate;
}

export interface ArmorModel {
  turretPivot?: Vec3Tuple | number[];
  gunPivot?: Vec3Tuple | number[];
  hullPlates?: ArmorPlate[];
  turretPlates?: ArmorPlate[];
  collisionShells?: {
    hull?: readonly ArmorCollisionCell[];
    turret?: readonly ArmorCollisionCell[];
  };
  trackShapes?: TrackPrismShape[];
  modules?: ArmorModuleVolume[];
  crew?: ArmorCrewVolume[];
  gunBarrel?: { lengthM: number; radiusM: number };
  boundingRadiusM?: number;
  turretless?: boolean;
  _seamMm?: number;
  _seamPlate?: ArmorPlate | null;
  __hullAabb?: { min: number[]; max: number[] } | null;
}

interface IntersectionBase {
  t: number;
  tExit?: number;
  point: Vector3;
  normal?: Vector3;
  impactFrame: string;
  impactLocalX: number;
  impactLocalY: number;
  impactLocalZ: number;
  impactLocalDirX: number;
  impactLocalDirY: number;
  impactLocalDirZ: number;
  impactLocalNormalX?: number;
  impactLocalNormalY?: number;
  impactLocalNormalZ?: number;
}

export interface ArmorPlateIntersection extends IntersectionBase {
  kind: 'plate';
  plate: ArmorPlate;
  impactAngleDeg: number;
  normal: Vector3;
  collisionFace?: ArmorCollisionFace;
}

export interface ArmorModuleIntersection extends IntersectionBase {
  kind: 'module';
  module: ModuleId;
  external?: boolean;
  barrel?: boolean;
  barrelRadiusM?: number;
}

export interface ArmorCrewIntersection extends IntersectionBase {
  kind: 'crew';
  crew: string;
}

export type ArmorIntersection =
  | ArmorPlateIntersection
  | ArmorModuleIntersection
  | ArmorCrewIntersection;

interface RawArmorIntersection {
  t: number;
  tExit?: number;
  kind: 'plate' | 'module' | 'crew';
  plate?: ArmorPlate;
  module?: ModuleId;
  crew?: string;
  impactAngleDeg?: number;
  collisionFace?: ArmorCollisionFace;
  external?: boolean;
  barrel?: boolean;
  barrelRadiusM?: number;
  point?: Vector3;
  normal?: Vector3;
  impactFrame?: string;
  impactLocalX?: number;
  impactLocalY?: number;
  impactLocalZ?: number;
  impactLocalDirX?: number;
  impactLocalDirY?: number;
  impactLocalDirZ?: number;
  impactLocalNormalX?: number;
  impactLocalNormalY?: number;
  impactLocalNormalZ?: number;
}

interface CellInterval {
  t: number;
  tExit: number;
  face: ArmorCollisionFace | null;
}

export interface AimArmorInfo {
  plate: ArmorPlate;
  impactAngleDeg: number;
  point: Vector3;
  distM: number;
  layers: ArmorPlateIntersection[];
}

export interface BlastTarget {
  kind: 'module' | 'crew';
  name: string;
  external: boolean;
  point: Vector3;
}

function volumeCenter(shape: AabbPart | ArmorVolumeShape): Vec3Tuple {
  if (shape.kind === 'capsule') {
    return [
      (shape.a[0] + shape.b[0]) * 0.5,
      (shape.a[1] + shape.b[1]) * 0.5,
      (shape.a[2] + shape.b[2]) * 0.5,
    ];
  }
  if (shape.kind === 'ellipsoid' || shape.kind === 'ellipticCylinder') return shape.center;
  if (shape.center) return shape.center;
  return [
    (shape.min[0] + shape.max[0]) * 0.5,
    (shape.min[1] + shape.max[1]) * 0.5,
    (shape.min[2] + shape.max[2]) * 0.5,
  ];
}

const DEG_PER_RAD = 180 / Math.PI;

// --- module-scope scratch (no per-call allocation beyond returned hits) ----
const _euler = new Euler();
const _quat = new Quaternion();
const _unitScale = new Vector3(1, 1, 1);

const _hullM = new Matrix4();
const _hullInv = new Matrix4();
const _turretM = new Matrix4();
const _turretInv = new Matrix4();
const _gunM = new Matrix4();
const _gunInv = new Matrix4();
const _barrelM = new Matrix4();
const _barrelInv = new Matrix4();
const _mA = new Matrix4();
const _mB = new Matrix4();
const _mC = new Matrix4();

// Frame indices into the local-ray scratch arrays.
const FR_HULL = 0;
const FR_TURRET = 1;
const FR_GUN = 2;
const FR_BARREL = 3;
const FRAME_NAME = ['hull', 'turret', 'gun', 'barrel'] as const;
const _fromL = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _toL = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _dirL = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _dirN = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _forward = [_hullM, _turretM, _gunM, _barrelM];
const _inverse = [_hullInv, _turretInv, _gunInv, _barrelInv];

const _v0 = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _n = new Vector3();
const _pt = new Vector3();
const _tmp = new Vector3();
const _to = new Vector3();

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * Extract the rigid pose combat needs from a TankState (ARCHITECTURE.md
 * §3.5.2). `pitch`/`roll` are the movement spring's visualPitch/visualRoll —
 * the same values tankFactory feeds the visual root, so hitboxes track the
 * rendered attitude.
 *
 * @param {object} state TankState
 * @param {object} [out] PERF (performance_budget r3): optional reusable pose
 *   — the HUD aim path calls this once per bounding-gated enemy per frame
 *   (main.ts computeAimInfo) and the Vector3 clone + fresh object were the
 *   last steady per-frame allocations in the hot loop. Pass a module-scope
 *   scratch to reuse; omit for the allocating form (identical result).
 * @returns {{pos: Vector3, yaw: number, pitch: number, roll: number, turretYaw: number, gunPitch: number}} Pose
 */
export function tankPoseFromState(
  state: ArmorPoseState,
  out: TankArmorPose | null = null,
): TankArmorPose {
  const pose = out || {
    pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
  };
  if (!pose.pos) pose.pos = new Vector3();
  pose.pos.copy(state.pos);
  pose.yaw = state.yaw;
  pose.pitch = state.visualPitch;
  pose.roll = state.visualRoll;
  pose.turretYaw = state.turretYaw;
  pose.gunPitch = state.gunPitch;
  return pose;
}

/**
 * Build the four frame matrices (+inverses) for a pose/armor model.
 * @param {object} pose Pose from tankPoseFromState
 * @param {object} armorModel ArmorModel
 */
function buildFrames(pose: TankArmorPose, armorModel: ArmorModel): void {
  // Forward hull matrix — exact tankFactory mapping ('YXZ', y=yaw,
  // x=-pitch, z=roll), inverted here for world → hull local.
  _euler.set(-pose.pitch, pose.yaw, pose.roll, 'YXZ');
  _quat.setFromEuler(_euler);
  _hullM.compose(pose.pos, _quat, _unitScale);
  _hullInv.copy(_hullM).invert();

  const tp = armorModel.turretPivot || [0, 0, 0];
  const gp = armorModel.gunPivot || [0, 0, 0];

  // Turret frame: hull · T(turretPivot) · Ry(turretYaw)
  _mA.makeRotationY(pose.turretYaw);
  _mA.setPosition(tp[0], tp[1], tp[2]);
  _turretM.multiplyMatrices(_hullM, _mA);
  _turretInv.copy(_turretM).invert();

  // Gun-follow frame: turret geometry pitched about the trunnion —
  // turret · T(gunPivot) · Rx(-gunPitch) · T(-gunPivot)
  _mA.makeTranslation(gp[0], gp[1], gp[2]);
  _mB.makeRotationX(-pose.gunPitch);
  _mC.makeTranslation(-gp[0], -gp[1], -gp[2]);
  _mA.multiply(_mB).multiply(_mC);
  _gunM.multiplyMatrices(_turretM, _mA);
  _gunInv.copy(_gunM).invert();

  // Barrel frame: cylinder geometry sits at the origin along +Z —
  // turret · T(gunPivot) · Rx(-gunPitch)
  _mA.makeTranslation(gp[0], gp[1], gp[2]);
  _mB.makeRotationX(-pose.gunPitch);
  _mA.multiply(_mB);
  _barrelM.multiplyMatrices(_turretM, _mA);
  _barrelInv.copy(_barrelM).invert();
}

/**
 * Transform the world segment into every local frame.
 * @param {Vector3} from world segment start
 * @param {Vector3} to world segment end
 */
function localizeSegment(from: Vector3, to: Vector3): void {
  for (let f = 0; f < 4; f++) {
    _fromL[f].copy(from).applyMatrix4(_inverse[f]);
    _toL[f].copy(to).applyMatrix4(_inverse[f]);
    _dirL[f].subVectors(_toL[f], _fromL[f]);
    _dirN[f].copy(_dirL[f]).normalize();
  }
}

// Convex-cell clipping state. Cells are generated from the exact procedural
// armor mesh and form a closed longitudinal shell; each face already points
// at the canonical authored plate whose thickness/statistics it inherits.
let _convexExitT = 1;
let _convexFace: ArmorCollisionFace | null = null;
function intersectConvexCell(frame: FrameIndex, cell: ArmorCollisionCell): number {
  if (intersectAABB(frame, cell.min, cell.max) < 0) return -1;
  const f = _fromL[frame];
  const d = _dirL[frame];
  let t0 = 0;
  let t1 = 1;
  let entryFace: ArmorCollisionFace | null = null;
  for (const face of cell.faces) {
    const n = face.normal;
    const distance = n[0] * f.x + n[1] * f.y + n[2] * f.z + face.constant;
    const denominator = n[0] * d.x + n[1] * d.y + n[2] * d.z;
    if (Math.abs(denominator) < 1e-12) {
      if (distance > 1e-7) return -1;
      continue;
    }
    const t = -distance / denominator;
    if (denominator < 0) {
      if (t > t0) {
        t0 = t;
        entryFace = face;
      }
    } else if (t < t1) {
      t1 = t;
    }
    if (t0 > t1 + 1e-8) return -1;
  }
  if (t1 < 0 || t0 > 1) return -1;
  _convexExitT = Math.min(1, t1);
  _convexFace = entryFace;
  return Math.max(0, t0);
}

const _cellIntervals: CellInterval[] = [];
const _cellIntervalPool: CellInterval[] = [];
function cellInterval(index: number): CellInterval {
  let record = _cellIntervalPool[index];
  if (!record) {
    record = { t: 0, tExit: 0, face: null };
    _cellIntervalPool[index] = record;
  }
  return record;
}

function traceCollisionShell(
  cells: readonly ArmorCollisionCell[] | undefined,
  frame: FrameIndex,
  out: ArmorIntersection[],
): void {
  if (!Array.isArray(cells) || !cells.length) return;
  _cellIntervals.length = 0;
  for (const cell of cells) {
    const t = intersectConvexCell(frame, cell);
    if (t < 0) continue;
    const record = cellInterval(_cellIntervals.length);
    record.t = t;
    record.tExit = _convexExitT;
    record.face = _convexFace;
    _cellIntervals.push(record);
  }
  _cellIntervals.sort((a, b) => a.t - b.t || b.tExit - a.tExit);
  for (let index = 0; index < _cellIntervals.length;) {
    const first = _cellIntervals[index++];
    let tExit = first.tExit;
    while (index < _cellIntervals.length && _cellIntervals[index].t <= tExit + 1e-6) {
      tExit = Math.max(tExit, _cellIntervals[index].tExit);
      index++;
    }
    // A combat trace always begins outside a target. A zero-entry interval
    // can occur only in a synthetic/internal probe and has no outward face to
    // resolve against, so leave it to the next closed component.
    const face = first.face;
    if (!face || !face.plate) continue;
    const n = face.normal;
    const cosI = Math.min(1, Math.max(0,
      -(_dirN[frame].x * n[0] + _dirN[frame].y * n[1] + _dirN[frame].z * n[2])));
    out.push(finishFrameHit({
      t: first.t,
      tExit,
      kind: 'plate',
      plate: face.plate,
      collisionFace: face,
      impactAngleDeg: Math.acos(cosI) * DEG_PER_RAD,
    }, frame, first.t, n[0], n[1], n[2]));
  }
}

/**
 * Preserve the articulation frame that produced an intersection. A resolved
 * world point alone is not enough for presentation: converting a rotated
 * turret or elevated mantlet hit to hull-local and later guessing its owner
 * moves the marker and makes the decal detach as the gun traverses.
 *
 * Numeric fields avoid allocating three additional arrays for every armor,
 * module and crew candidate in the hot trace. damage.ts materializes arrays
 * only for the decisive hit event that crosses the presentation boundary.
 */
function finishFrameHit(
  hit: RawArmorIntersection,
  frame: FrameIndex,
  t: number,
  nx: number | null = null,
  ny: number | null = null,
  nz: number | null = null,
): ArmorIntersection {
  _pt.copy(_fromL[frame]).addScaledVector(_dirL[frame], t);
  hit.impactFrame = FRAME_NAME[frame];
  hit.impactLocalX = _pt.x;
  hit.impactLocalY = _pt.y;
  hit.impactLocalZ = _pt.z;
  hit.impactLocalDirX = _dirN[frame].x;
  hit.impactLocalDirY = _dirN[frame].y;
  hit.impactLocalDirZ = _dirN[frame].z;
  hit.point = _pt.clone().applyMatrix4(_forward[frame]);
  if (nx !== null && ny !== null && nz !== null) {
    hit.impactLocalNormalX = nx;
    hit.impactLocalNormalY = ny;
    hit.impactLocalNormalZ = nz;
    hit.normal = _n.set(nx, ny, nz).clone().transformDirection(_forward[frame]);
  }
  return hit as ArmorIntersection;
}

/**
 * Segment-vs-convex-quad intersection in a local frame. On hit, _pt holds the
 * local point and _n the outward local normal.
 * @param {number} frame frame index
 * @param {Array} verts 4 CCW-from-outside [x,y,z] vertices
 * @returns {number} segment parameter t in [0,1], or -1 on miss
 */
function intersectQuad(frame: FrameIndex, verts: readonly Vec3Tuple[]): number {
  _v0.fromArray(verts[0]);
  _v1.fromArray(verts[1]);
  _v2.fromArray(verts[2]);
  _v3.fromArray(verts[3]);
  _e1.subVectors(_v1, _v0);
  _e2.subVectors(_v3, _v0);
  _n.crossVectors(_e1, _e2).normalize();

  const dir = _dirL[frame];
  const denom = dir.dot(_n);
  if (denom >= -1e-9) return -1; // parallel or hitting the back face
  const t = _tmp.subVectors(_v0, _fromL[frame]).dot(_n) / denom;
  if (t < 0 || t > 1) return -1;
  _pt.copy(_fromL[frame]).addScaledVector(dir, t);

  // Inside test: every CCW edge must keep the point on its left.
  if (!edgeInside(_v0, _v1)) return -1;
  if (!edgeInside(_v1, _v2)) return -1;
  if (!edgeInside(_v2, _v3)) return -1;
  if (!edgeInside(_v3, _v0)) return -1;
  return t;
}

/**
 * Half-plane test for the quad inside check (uses _pt and _n).
 * @param {Vector3} a edge start
 * @param {Vector3} b edge end
 * @returns {boolean} point is on the interior side of edge a→b
 */
function edgeInside(a: Vector3, b: Vector3): boolean {
  _e1.subVectors(b, a);
  _e2.subVectors(_pt, a);
  _tmp.crossVectors(_e1, _e2);
  return _tmp.dot(_n) >= -1e-6;
}

/**
 * Segment-vs-AABB slab test in a local frame. On hit, `_aabbExitT` holds the
 * exit parameter (the box SPAN along the segment is [entry, _aabbExitT] —
 * damage.ts rolls a module when the post-penetration path overlaps that span,
 * not merely when the entry face sits behind armor).
 * @param {number} frame frame index
 * @param {Array} min [x,y,z]
 * @param {Array} max [x,y,z]
 * @returns {number} entry parameter t in [0,1] (0 when starting inside), or -1
 */
let _aabbExitT = 1;
let _slabEntryT = 0;
let _slabExitT = 1;

function vectorAxis(vector: Vector3, axis: number): number {
  if (axis === 0) return vector.x;
  if (axis === 1) return vector.y;
  return vector.z;
}

function clipSlabAxis(origin: number, direction: number, min: number, max: number): boolean {
  if (Math.abs(direction) < 1e-12) return origin >= min && origin <= max;
  let near = (min - origin) / direction;
  let far = (max - origin) / direction;
  if (near > far) [near, far] = [far, near];
  _slabEntryT = Math.max(_slabEntryT, near);
  _slabExitT = Math.min(_slabExitT, far);
  return _slabEntryT <= _slabExitT;
}

function intersectAABB(frame: FrameIndex, min: Vec3Tuple, max: Vec3Tuple): number {
  const f = _fromL[frame];
  const d = _dirL[frame];
  _slabEntryT = 0;
  _slabExitT = 1;
  for (let ax = 0; ax < 3; ax++) {
    if (!clipSlabAxis(vectorAxis(f, ax), vectorAxis(d, ax), min[ax], max[ax])) return -1;
  }
  _aabbExitT = _slabExitT;
  return _slabEntryT;
}

let _shapeExitT = 1;
function intersectEllipsoid(frame: FrameIndex, shape: EllipsoidShape): number {
  const f = _fromL[frame];
  const d = _dirL[frame];
  const c = shape.center;
  const r = shape.radii;
  const ox = (f.x - c[0]) / r[0];
  const oy = (f.y - c[1]) / r[1];
  const oz = (f.z - c[2]) / r[2];
  const dx = d.x / r[0];
  const dy = d.y / r[1];
  const dz = d.z / r[2];
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const cc = ox * ox + oy * oy + oz * oz - 1;
  if (a < 1e-14) {
    if (cc > 0) return -1;
    _shapeExitT = 1;
    return 0;
  }
  const discriminant = b * b - 4 * a * cc;
  if (discriminant < 0) return -1;
  const root = Math.sqrt(discriminant);
  let t0 = (-b - root) / (2 * a);
  let t1 = (-b + root) / (2 * a);
  if (t0 > t1) [t0, t1] = [t1, t0];
  if (t1 < 0 || t0 > 1) return -1;
  _shapeExitT = Math.min(1, t1);
  return Math.max(0, t0);
}

let _cylinderEntryT = 0;
let _cylinderExitT = 1;

function clipEllipticCylinderRadius(
  radialOrigin0: number,
  radialOrigin1: number,
  radialDirection0: number,
  radialDirection1: number,
  radii: readonly [number, number],
): boolean {
  const o0 = radialOrigin0 / radii[0];
  const o1 = radialOrigin1 / radii[1];
  const q0 = radialDirection0 / radii[0];
  const q1 = radialDirection1 / radii[1];
  const qa = q0 * q0 + q1 * q1;
  const qb = 2 * (o0 * q0 + o1 * q1);
  const qc = o0 * o0 + o1 * o1 - 1;
  if (qa < 1e-14) return qc <= 0;
  const discriminant = qb * qb - 4 * qa * qc;
  if (discriminant < 0) return false;
  const root = Math.sqrt(discriminant);
  let near = (-qb - root) / (2 * qa);
  let far = (-qb + root) / (2 * qa);
  if (near > far) [near, far] = [far, near];
  _cylinderEntryT = Math.max(_cylinderEntryT, near);
  _cylinderExitT = Math.min(_cylinderExitT, far);
  return true;
}

function clipEllipticCylinderLength(origin: number, direction: number, half: number): boolean {
  if (Math.abs(direction) < 1e-12) return Math.abs(origin) <= half;
  let near = (-half - origin) / direction;
  let far = (half - origin) / direction;
  if (near > far) [near, far] = [far, near];
  _cylinderEntryT = Math.max(_cylinderEntryT, near);
  _cylinderExitT = Math.min(_cylinderExitT, far);
  return true;
}

function intersectEllipticCylinder(frame: FrameIndex, shape: EllipticCylinderShape): number {
  const f = _fromL[frame];
  const d = _dirL[frame];
  const axis = shape.axis;
  const fx = f.x - shape.center[0];
  const fy = f.y - shape.center[1];
  const fz = f.z - shape.center[2];
  const radialOrigin0 = axis === 0 ? fy : fx;
  const radialOrigin1 = axis === 2 ? fy : fz;
  const radialDirection0 = axis === 0 ? d.y : d.x;
  const radialDirection1 = axis === 2 ? d.y : d.z;
  _cylinderEntryT = 0;
  _cylinderExitT = 1;
  if (!clipEllipticCylinderRadius(
    radialOrigin0,
    radialOrigin1,
    radialDirection0,
    radialDirection1,
    shape.radii,
  )) return -1;
  if (!clipEllipticCylinderLength(
    axis === 0 ? fx : axis === 1 ? fy : fz,
    vectorAxis(d, axis),
    shape.halfLength,
  )) return -1;
  if (_cylinderEntryT > _cylinderExitT || _cylinderExitT < 0 || _cylinderEntryT > 1) return -1;
  _shapeExitT = Math.min(1, _cylinderExitT);
  return Math.max(0, _cylinderEntryT);
}

let _intervalT0 = 0;
let _intervalT1 = 1;
function sphereInterval(frame: FrameIndex, center: Vec3Tuple, radius: number): boolean {
  const f = _fromL[frame];
  const d = _dirL[frame];
  const ox = f.x - center[0];
  const oy = f.y - center[1];
  const oz = f.z - center[2];
  const a = d.lengthSq();
  const b = 2 * (ox * d.x + oy * d.y + oz * d.z);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-14) return false;
  const root = Math.sqrt(disc);
  let t0 = (-b - root) / (2 * a);
  let t1 = (-b + root) / (2 * a);
  if (t0 > t1) [t0, t1] = [t1, t0];
  if (t1 < 0 || t0 > 1) return false;
  _intervalT0 = Math.max(0, t0);
  _intervalT1 = Math.min(1, t1);
  return true;
}

function cylinderInterval(
  frame: FrameIndex,
  a: Vec3Tuple,
  b: Vec3Tuple,
  radius: number,
): boolean {
  const f = _fromL[frame];
  const d = _dirL[frame];
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const lengthSq = bax * bax + bay * bay + baz * baz;
  if (lengthSq < 1e-12) return false;
  const oax = f.x - a[0];
  const oay = f.y - a[1];
  const oaz = f.z - a[2];
  const dd = d.lengthSq();
  const dba = d.x * bax + d.y * bay + d.z * baz;
  const oba = oax * bax + oay * bay + oaz * baz;
  const od = oax * d.x + oay * d.y + oaz * d.z;
  const oo = oax * oax + oay * oay + oaz * oaz;
  const qa = dd - dba * dba / lengthSq;
  const qb = 2 * (od - oba * dba / lengthSq);
  const qc = oo - oba * oba / lengthSq - radius * radius;
  let t0 = 0;
  let t1 = 1;
  if (qa < 1e-14) {
    if (qc > 0) return false;
  } else {
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant < 0) return false;
    const root = Math.sqrt(discriminant);
    let x0 = (-qb - root) / (2 * qa);
    let x1 = (-qb + root) / (2 * qa);
    if (x0 > x1) [x0, x1] = [x1, x0];
    t0 = Math.max(t0, x0);
    t1 = Math.min(t1, x1);
  }
  if (Math.abs(dba) < 1e-12) {
    if (oba < 0 || oba > lengthSq) return false;
  } else {
    let x0 = -oba / dba;
    let x1 = (lengthSq - oba) / dba;
    if (x0 > x1) [x0, x1] = [x1, x0];
    t0 = Math.max(t0, x0);
    t1 = Math.min(t1, x1);
  }
  if (t0 > t1 || t1 < 0 || t0 > 1) return false;
  _intervalT0 = Math.max(0, t0);
  _intervalT1 = Math.min(1, t1);
  return true;
}

function intersectCapsule(frame: FrameIndex, shape: CapsuleShape): number {
  let t0 = Infinity;
  let t1 = -Infinity;
  if (cylinderInterval(frame, shape.a, shape.b, shape.radius)) {
    t0 = Math.min(t0, _intervalT0);
    t1 = Math.max(t1, _intervalT1);
  }
  if (sphereInterval(frame, shape.a, shape.radius)) {
    t0 = Math.min(t0, _intervalT0);
    t1 = Math.max(t1, _intervalT1);
  }
  if (sphereInterval(frame, shape.b, shape.radius)) {
    t0 = Math.min(t0, _intervalT0);
    t1 = Math.max(t1, _intervalT1);
  }
  if (!Number.isFinite(t0) || t1 < t0) return -1;
  _shapeExitT = t1;
  return t0;
}

function intersectVolumeShape(frame: FrameIndex, shape: ArmorVolumeShape): number {
  if (!shape) return -1;
  if (shape.kind === 'ellipsoid') return intersectEllipsoid(frame, shape);
  if (shape.kind === 'capsule') return intersectCapsule(frame, shape);
  if (shape.kind === 'ellipticCylinder') return intersectEllipticCylinder(frame, shape);
  return -1;
}

/**
 * Segment-vs-track-prism (TRACK-HITBOX schema, specs.attachTrackShapes): a
 * convex CCW polygon in hull-local (z,y) extruded across the lateral slab
 * [x0,x1] — the real \____/ band silhouette. Parametric half-space clipping;
 * on hit, `_prismExitT` holds the exit parameter and (_pnx,_pny,_pnz) the
 * hull-local outward normal of the ENTRY face (±X side face, or an
 * approach/departure ramp / end-wheel wrap facet with a real slope). Entry
 * t = 0 means the segment starts inside (no meaningful entry face).
 * @param {number} frame frame index (tracks are hull-local: FR_HULL)
 * @param {object} shape {x0,x1,poly} trackShapes entry
 * @returns {number} entry parameter t in [0,1], or -1
 */
let _prismExitT = 1;
let _pnx = 0;
let _pny = 0;
let _pnz = 0;
let _prismEntryT = 0;

function clipTrackPrismWidth(f: Vector3, d: Vector3, shape: TrackPrismShape): boolean {
  if (Math.abs(d.x) < 1e-12) return f.x >= shape.x0 && f.x <= shape.x1;
  let near = (shape.x0 - f.x) / d.x;
  let far = (shape.x1 - f.x) / d.x;
  let normalX = -1;
  if (near > far) {
    [near, far] = [far, near];
    normalX = 1;
  }
  if (near > _prismEntryT) {
    _prismEntryT = near;
    _pnx = normalX;
    _pny = 0;
    _pnz = 0;
  }
  _prismExitT = Math.min(_prismExitT, far);
  return _prismEntryT <= _prismExitT;
}

function clipTrackPrismEdge(
  f: Vector3,
  d: Vector3,
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
    const ez = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ez, ey);
    if (len < 1e-9) return true;
    const onz = ey / len;  // outward normal of a CCW edge in (z,y)
    const ony = -ez / len;
    const d0 = (f.z - a[0]) * onz + (f.y - a[1]) * ony;
    const dd = d.z * onz + d.y * ony;
    if (Math.abs(dd) < 1e-12) return d0 <= 1e-9;
    const tc = -d0 / dd;
    if (dd < 0) {
      if (tc > _prismEntryT) {
        _prismEntryT = tc;
        _pnx = 0;
        _pny = ony;
        _pnz = onz;
      }
    } else {
      _prismExitT = Math.min(_prismExitT, tc);
    }
    return _prismEntryT <= _prismExitT;
}

function intersectTrackPrism(frame: FrameIndex, shape: TrackPrismShape): number {
  const f = _fromL[frame];
  const d = _dirL[frame];
  _prismEntryT = 0;
  _prismExitT = 1;
  _pnx = 0;
  _pny = 0;
  _pnz = 0;
  if (!clipTrackPrismWidth(f, d, shape)) return -1;
  const poly = shape.poly;
  for (let index = 0; index < poly.length; index++) {
    if (!clipTrackPrismEdge(f, d, poly[index], poly[(index + 1) % poly.length])) return -1;
  }
  return _prismEntryT;
}

/**
 * Segment-vs-barrel-cylinder (axis +Z from the origin, barrel frame).
 * @param {number} lengthM cylinder length along +Z
 * @param {number} radiusM cylinder radius
 * @returns {number} parameter t in [0,1], or -1
 */
function intersectBarrel(lengthM: number, radiusM: number): number {
  const f = _fromL[FR_BARREL];
  const d = _dirL[FR_BARREL];
  const a = d.x * d.x + d.y * d.y;
  if (a < 1e-12) return -1;
  const b = 2 * (f.x * d.x + f.y * d.y);
  const c = f.x * f.x + f.y * f.y - radiusM * radiusM;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a);
  if (t < 0 || t > 1) return -1;
  const z = f.z + d.z * t;
  if (z < 0 || z > lengthM) return -1;
  return t;
}

function hasTrackShape(
  trackShapes: readonly TrackPrismShape[] | null,
  module: ModuleId | null | undefined,
): boolean {
  if (!trackShapes || !module) return false;
  for (const shape of trackShapes) {
    if (shape.module === module) return true;
  }
  return false;
}

function tracePlates(
  plates: readonly ArmorPlate[] | undefined,
  frame: FrameIndex,
  replaceMain: boolean,
  eraSpent: ReadonlySet<string>,
  trackShapes: readonly TrackPrismShape[] | null,
  out: ArmorIntersection[],
): void {
  if (!plates) return;
  for (const plate of plates) {
    if (replaceMain && (plate.kind || 'main') === 'main') continue;
    if (plate.kind === 'era' && eraSpent.has(plate.name)) continue;
    if (plate.kind === 'external' && hasTrackShape(trackShapes, plate.moduleLink)) continue;
    const frameForPlate = plate.gunFollow ? FR_GUN : frame;
    const t = intersectQuad(frameForPlate, plate.verts);
    if (t < 0) continue;
    const cosI = Math.min(1, Math.max(0, -_dirN[frameForPlate].dot(_n)));
    out.push(finishFrameHit({
      t,
      kind: 'plate',
      plate,
      impactAngleDeg: Math.acos(cosI) * DEG_PER_RAD,
    }, frameForPlate, t, _n.x, _n.y, _n.z));
  }
}

function pushTrackSpan(
  module: TrackModuleId,
  t: number,
  tExit: number,
  out: ArmorIntersection[],
): void {
  if (!Number.isFinite(t)) return;
  out.push(finishFrameHit({
    t,
    tExit,
    kind: 'module',
    module,
    external: false,
  }, FR_HULL, t));
}

function traceTrackShapes(
  trackShapes: readonly TrackPrismShape[],
  out: ArmorIntersection[],
): void {
  let leftT = Infinity;
  let leftExitT = -Infinity;
  let rightT = Infinity;
  let rightExitT = -Infinity;
  for (const shape of trackShapes) {
    const t = intersectTrackPrism(FR_HULL, shape);
    if (t < 0) continue;
    if (t > 0) {
      const cosI = Math.min(1, Math.max(0,
        -(_dirN[FR_HULL].x * _pnx + _dirN[FR_HULL].y * _pny + _dirN[FR_HULL].z * _pnz)));
      out.push(finishFrameHit({
        t,
        kind: 'plate',
        plate: shape.plate,
        impactAngleDeg: Math.acos(cosI) * DEG_PER_RAD,
      }, FR_HULL, t, _pnx, _pny, _pnz));
    }
    if (shape.module === 'trackL') {
      if (t < leftT) leftT = t;
      if (_prismExitT > leftExitT) leftExitT = _prismExitT;
    } else {
      if (t < rightT) rightT = t;
      if (_prismExitT > rightExitT) rightExitT = _prismExitT;
    }
  }
  pushTrackSpan('trackL', leftT, leftExitT, out);
  pushTrackSpan('trackR', rightT, rightExitT, out);
}

let _volumeExitT = -Infinity;
function intersectShapeGroup(frame: FrameIndex, shapes: readonly ArmorVolumeShape[]): number {
  let t = Infinity;
  _volumeExitT = -Infinity;
  for (const shape of shapes) {
    const shapeT = intersectVolumeShape(frame, shape);
    if (shapeT < 0) continue;
    if (shapeT < t) t = shapeT;
    if (_shapeExitT > _volumeExitT) _volumeExitT = _shapeExitT;
  }
  return t;
}

function intersectAabbGroup(frame: FrameIndex, parts: readonly AabbPart[]): number {
  let t = Infinity;
  _volumeExitT = -Infinity;
  for (const part of parts) {
    const partT = intersectAABB(frame, part.min, part.max);
    if (partT < 0) continue;
    if (partT < t) t = partT;
    if (_aabbExitT > _volumeExitT) _volumeExitT = _aabbExitT;
  }
  return t;
}

function intersectModuleVolume(frame: FrameIndex, volume: ArmorModuleVolume): number {
  if (volume.shapes?.length) return intersectShapeGroup(frame, volume.shapes);
  if (volume.parts?.length) return intersectAabbGroup(frame, volume.parts);
  const t = intersectAABB(frame, volume.min, volume.max);
  _volumeExitT = _aabbExitT;
  return t;
}

function traceModuleVolumes(
  volumes: readonly ArmorModuleVolume[] | undefined,
  trackShapes: readonly TrackPrismShape[] | null,
  out: ArmorIntersection[],
): void {
  if (!volumes) return;
  for (const volume of volumes) {
    if (hasTrackShape(trackShapes, volume.module)) continue;
    const frame = volume.turretLocal ? FR_TURRET : FR_HULL;
    const t = intersectModuleVolume(frame, volume);
    if (t < 0 || !Number.isFinite(t)) continue;
    out.push(finishFrameHit({
      t,
      tExit: _volumeExitT,
      kind: 'module',
      module: volume.module,
      external: volume.external !== undefined ? !!volume.external : volume.module === 'optics',
    }, frame, t));
  }
}

function intersectCrewVolume(frame: FrameIndex, volume: ArmorCrewVolume): number {
  if (volume.shapes?.length) return intersectShapeGroup(frame, volume.shapes);
  const t = intersectAABB(frame, volume.min, volume.max);
  _volumeExitT = _aabbExitT;
  return t;
}

function traceCrewVolumes(
  volumes: readonly ArmorCrewVolume[] | undefined,
  out: ArmorIntersection[],
): void {
  if (!volumes) return;
  for (const volume of volumes) {
    const frame = volume.turretLocal ? FR_TURRET : FR_HULL;
    const t = intersectCrewVolume(frame, volume);
    if (t < 0 || !Number.isFinite(t)) continue;
    out.push(finishFrameHit({
      t,
      tExit: _volumeExitT,
      kind: 'crew',
      crew: volume.crew,
    }, frame, t));
  }
}

function traceGunBarrel(
  gunBarrel: ArmorModel['gunBarrel'],
  out: ArmorIntersection[],
): void {
  if (!gunBarrel) return;
  const t = intersectBarrel(gunBarrel.lengthM, gunBarrel.radiusM);
  if (t < 0) return;
  out.push(finishFrameHit({
    t,
    kind: 'module',
    module: 'gun',
    external: true,
    barrel: true,
    barrelRadiusM: gunBarrel.radiusM,
  }, FR_BARREL, t));
}

/**
 * Trace a world-space segment through a tank's armor model. Returns every
 * intersection — armor plates (front faces only, with world outward normal
 * and raw impact angle), module boxes, crew boxes and the external gun
 * barrel — sorted by distance along the segment. ERA plates whose names are
 * in `eraSpent` are skipped (the tile is gone).
 *
 * @param {Vector3} from world segment start
 * @param {Vector3} to world segment end
 * @param {object} pose Pose from tankPoseFromState
 * @param {object} armorModel ArmorModel (ARCHITECTURE.md §2.3)
 * @param {Set<string>} [eraSpent] names of detonated ERA plates
 * @returns {Array<object>} sorted Intersection[] (ARCHITECTURE.md §3.5.2)
 */
export function traceTank(
  from: Vector3,
  to: Vector3,
  pose: TankArmorPose,
  armorModel: ArmorModel,
  eraSpent: ReadonlySet<string> = EMPTY_SET,
): ArmorIntersection[] {
  buildFrames(pose, armorModel);
  localizeSegment(from, to);

  const out: ArmorIntersection[] = [];

  // TRACK-HITBOX schema: real track prisms REPLACE the legacy full-length
  // rectangle plate + AABB pair for ray tests (specs.attachTrackShapes).
  // The legacy entries stay in the model for their non-ray consumers
  // (HE blast targets, hull AABB, killcam bands) — models without
  // trackShapes keep the legacy path bit-identical.
  const trackShapes = armorModel.trackShapes?.length ? armorModel.trackShapes : null;

  const collisionShells = armorModel.collisionShells || null;

  const hullCells = collisionShells?.hull;
  const turretCells = collisionShells?.turret;
  tracePlates(armorModel.hullPlates, FR_HULL, !!hullCells?.length, eraSpent, trackShapes, out);
  tracePlates(armorModel.turretPlates, FR_TURRET, !!turretCells?.length, eraSpent, trackShapes, out);
  traceCollisionShell(hullCells, FR_HULL, out);
  traceCollisionShell(turretCells, FR_TURRET, out);

  if (trackShapes) traceTrackShapes(trackShapes, out);
  traceModuleVolumes(armorModel.modules, trackShapes, out);
  traceCrewVolumes(armorModel.crew, out);
  traceGunBarrel(armorModel.gunBarrel, out);

  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * Armor stack a ray would strike — used by the HUD penetration indicator and
 * AI weak-spot probing. `plate` is the first 'main' or 'spaced' surface (the
 * layer that historically gated the estimate); `layers` is EVERY plate
 * intersection (ERA tiles, spaced screens, external tracks, main armor) in
 * ray order up to and including the first 'main' plate, so the estimate can
 * aggregate the whole stack exactly like damage resolution does.
 *
 * @param {Vector3} from world ray origin
 * @param {Vector3} dir world unit ray direction
 * @param {number} maxDist max query distance in meters
 * @param {object} pose Pose from tankPoseFromState
 * @param {object} armorModel ArmorModel
 * @param {Set<string>} [eraSpent] names of already-detonated ERA tiles
 * @returns {null | {plate: object, impactAngleDeg: number, point: Vector3, distM: number, layers: Array<object>}}
 */
export function queryAimArmor(
  from: Vector3,
  dir: Vector3,
  maxDist: number,
  pose: TankArmorPose,
  armorModel: ArmorModel,
  eraSpent: ReadonlySet<string> = EMPTY_SET,
): AimArmorInfo | null {
  _to.copy(from).addScaledVector(dir, maxDist);
  const hits = traceTank(from, _to, pose, armorModel, eraSpent);
  const layers: ArmorPlateIntersection[] = [];
  let first: ArmorPlateIntersection | null = null;
  for (const hit of hits) {
    if (hit.kind !== 'plate') continue;
    layers.push(hit);
    if (!first && (hit.plate.kind === 'main' || hit.plate.kind === 'spaced')) first = hit;
    if (hit.plate.kind === 'main') break; // stack ends at the first main plate
  }
  if (!first) return null;
  return {
    plate: first.plate,
    impactAngleDeg: first.impactAngleDeg,
    point: first.point,
    distM: first.t * maxDist,
    layers,
  };
}

/**
 * Enumerate every module/crew box of an armor model with its world-space
 * center. The HE blast sweep (damage.ts) distance-tests these against the
 * blast sphere so boxes OFF the flight/burst ray — tracks beside a ground
 * burst, the rear engine on a turret hit — are still reachable, per shells
 * doc §6 / armor doc §8 step 3. Order is fixed for RNG determinism: modules
 * in model order, then crew in model order.
 *
 * `external` marks boxes damageable at full blast odds: explicit
 * box.external wins; by default optics and tracks count as external here
 * (armor doc §12 — for penetration rays the track PLATE's moduleLink already
 * provides the external track path, so traceTank keeps track boxes internal).
 *
 * @param {object} pose Pose from tankPoseFromState
 * @param {object} armorModel ArmorModel
 * @returns {Array<{kind: ('module'|'crew'), name: string, external: boolean, point: Vector3}>}
 */
export function blastTargets(pose: TankArmorPose, armorModel: ArmorModel): BlastTarget[] {
  buildFrames(pose, armorModel);
  const out: BlastTarget[] = [];
  appendBlastModuleTargets(armorModel.modules, out);
  appendBlastCrewTargets(armorModel.crew, out);
  return out;
}

function blastModuleShapes(box: ArmorModuleVolume): readonly (AabbPart | ArmorVolumeShape)[] {
  if (box.shapes?.length) return box.shapes;
  if (box.parts?.length) return box.parts;
  return [box];
}

function blastModuleExternal(box: ArmorModuleVolume): boolean {
  if (box.external !== undefined) return box.external;
  return box.module === 'optics' || box.module === 'trackL' || box.module === 'trackR';
}

function appendBlastModuleTargets(
  modules: readonly ArmorModuleVolume[] | undefined,
  out: BlastTarget[],
): void {
  if (!modules) return;
  for (const box of modules) {
    const matrix = box.turretLocal ? _turretM : _hullM;
    const external = blastModuleExternal(box);
    for (const shape of blastModuleShapes(box)) {
      const center = volumeCenter(shape);
      out.push({
        kind: 'module',
        name: box.module,
        external,
        point: new Vector3(center[0], center[1], center[2]).applyMatrix4(matrix),
      });
    }
  }
}

function appendBlastCrewTargets(
  crew: readonly ArmorCrewVolume[] | undefined,
  out: BlastTarget[],
): void {
  if (!crew) return;
  for (const box of crew) {
    const matrix = box.turretLocal ? _turretM : _hullM;
    const shapes = box.shapes?.length ? box.shapes : [box];
    for (const shape of shapes) {
      const center = volumeCenter(shape);
      out.push({
        kind: 'crew',
        name: box.crew,
        external: false,
        point: new Vector3(center[0], center[1], center[2]).applyMatrix4(matrix),
      });
    }
  }
}
