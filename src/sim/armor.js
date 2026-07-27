/**
 * armor.js — armor zone lookup: traces world-space shell segments through a
 * tank's ArmorModel (plates, module boxes, crew boxes, gun barrel) and returns
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
const _fromL = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _toL = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _dirL = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _dirN = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _forward = [_hullM, _turretM, _gunM, _barrelM];

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

const EMPTY_SET = new Set();

/**
 * Extract the rigid pose combat needs from a TankState (ARCHITECTURE.md
 * §3.5.2). `pitch`/`roll` are the movement spring's visualPitch/visualRoll —
 * the same values tankFactory feeds the visual root, so hitboxes track the
 * rendered attitude.
 *
 * @param {object} state TankState
 * @returns {{pos: Vector3, yaw: number, pitch: number, roll: number, turretYaw: number, gunPitch: number}} Pose
 */
export function tankPoseFromState(state) {
  return {
    pos: state.pos.clone(),
    yaw: state.yaw,
    pitch: state.visualPitch,
    roll: state.visualRoll,
    turretYaw: state.turretYaw,
    gunPitch: state.gunPitch,
  };
}

/**
 * Build the four frame matrices (+inverses) for a pose/armor model.
 * @param {object} pose Pose from tankPoseFromState
 * @param {object} armorModel ArmorModel
 */
function buildFrames(pose, armorModel) {
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
function localizeSegment(from, to) {
  const invs = [_hullInv, _turretInv, _gunInv, _barrelInv];
  for (let f = 0; f < 4; f++) {
    _fromL[f].copy(from).applyMatrix4(invs[f]);
    _toL[f].copy(to).applyMatrix4(invs[f]);
    _dirL[f].subVectors(_toL[f], _fromL[f]);
    _dirN[f].copy(_dirL[f]).normalize();
  }
}

/**
 * Segment-vs-convex-quad intersection in a local frame. On hit, _pt holds the
 * local point and _n the outward local normal.
 * @param {number} frame frame index
 * @param {Array} verts 4 CCW-from-outside [x,y,z] vertices
 * @returns {number} segment parameter t in [0,1], or -1 on miss
 */
function intersectQuad(frame, verts) {
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
function edgeInside(a, b) {
  _e1.subVectors(b, a);
  _e2.subVectors(_pt, a);
  _tmp.crossVectors(_e1, _e2);
  return _tmp.dot(_n) >= -1e-6;
}

/**
 * Segment-vs-AABB slab test in a local frame.
 * @param {number} frame frame index
 * @param {Array} min [x,y,z]
 * @param {Array} max [x,y,z]
 * @returns {number} entry parameter t in [0,1] (0 when starting inside), or -1
 */
function intersectAABB(frame, min, max) {
  const f = _fromL[frame];
  const d = _dirL[frame];
  let t0 = 0;
  let t1 = 1;
  for (let ax = 0; ax < 3; ax++) {
    const fa = ax === 0 ? f.x : ax === 1 ? f.y : f.z;
    const da = ax === 0 ? d.x : ax === 1 ? d.y : d.z;
    if (Math.abs(da) < 1e-12) {
      if (fa < min[ax] || fa > max[ax]) return -1;
    } else {
      let ta = (min[ax] - fa) / da;
      let tb = (max[ax] - fa) / da;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

/**
 * Segment-vs-barrel-cylinder (axis +Z from the origin, barrel frame).
 * @param {number} lengthM cylinder length along +Z
 * @param {number} radiusM cylinder radius
 * @returns {number} parameter t in [0,1], or -1
 */
function intersectBarrel(lengthM, radiusM) {
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
export function traceTank(from, to, pose, armorModel, eraSpent = EMPTY_SET) {
  buildFrames(pose, armorModel);
  localizeSegment(from, to);

  /** @type {Array<object>} */
  const out = [];

  const testPlates = (plates, frame) => {
    if (!plates) return;
    for (const plate of plates) {
      if (plate.kind === 'era' && eraSpent.has(plate.name)) continue;
      const fr = plate.gunFollow ? FR_GUN : frame;
      const t = intersectQuad(fr, plate.verts);
      if (t < 0) continue;
      const cosI = Math.min(1, Math.max(0, -_dirN[fr].dot(_n)));
      out.push({
        t,
        kind: 'plate',
        plate,
        point: _pt.clone().applyMatrix4(_forward[fr]),
        normal: _n.clone().transformDirection(_forward[fr]),
        impactAngleDeg: Math.acos(cosI) * DEG_PER_RAD,
      });
    }
  };

  testPlates(armorModel.hullPlates, FR_HULL);
  testPlates(armorModel.turretPlates, FR_TURRET);

  if (armorModel.modules) {
    for (const box of armorModel.modules) {
      const fr = box.turretLocal ? FR_TURRET : FR_HULL;
      const t = intersectAABB(fr, box.min, box.max);
      if (t < 0) continue;
      out.push({
        t,
        kind: 'module',
        module: box.module,
        point: _pt.copy(_fromL[fr]).addScaledVector(_dirL[fr], t).clone().applyMatrix4(_forward[fr]),
      });
    }
  }

  if (armorModel.crew) {
    for (const box of armorModel.crew) {
      const fr = box.turretLocal ? FR_TURRET : FR_HULL;
      const t = intersectAABB(fr, box.min, box.max);
      if (t < 0) continue;
      out.push({
        t,
        kind: 'crew',
        crew: box.crew,
        point: _pt.copy(_fromL[fr]).addScaledVector(_dirL[fr], t).clone().applyMatrix4(_forward[fr]),
      });
    }
  }

  if (armorModel.gunBarrel) {
    const t = intersectBarrel(armorModel.gunBarrel.lengthM, armorModel.gunBarrel.radiusM);
    if (t >= 0) {
      out.push({
        t,
        kind: 'module',
        module: 'gun',
        point: _pt
          .copy(_fromL[FR_BARREL])
          .addScaledVector(_dirL[FR_BARREL], t)
          .clone()
          .applyMatrix4(_forward[FR_BARREL]),
      });
    }
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * First armor surface ('main' or 'spaced') a ray would strike — used by the
 * HUD penetration indicator and AI weak-spot probing. ERA and external layers
 * are skipped so the indicator reads the plate that actually gates damage.
 *
 * @param {Vector3} from world ray origin
 * @param {Vector3} dir world unit ray direction
 * @param {number} maxDist max query distance in meters
 * @param {object} pose Pose from tankPoseFromState
 * @param {object} armorModel ArmorModel
 * @returns {null | {plate: object, impactAngleDeg: number, point: Vector3, distM: number}}
 */
export function queryAimArmor(from, dir, maxDist, pose, armorModel) {
  _to.copy(from).addScaledVector(dir, maxDist);
  const hits = traceTank(from, _to, pose, armorModel, EMPTY_SET);
  for (const hit of hits) {
    if (hit.kind !== 'plate') continue;
    if (hit.plate.kind !== 'main' && hit.plate.kind !== 'spaced') continue;
    return {
      plate: hit.plate,
      impactAngleDeg: hit.impactAngleDeg,
      point: hit.point,
      distM: hit.t * maxDist,
    };
  }
  return null;
}
