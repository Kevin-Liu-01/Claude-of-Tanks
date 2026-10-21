/**
 * The proving ground's range (v2 progression, owner 2026-10-17: "build out all the options": proving ground / test drive).
 * Pure, deterministic and Node-runnable: no DOM, no renderer, no wall clock, no Math.random. The rules are the ruleset's
 * (sim/matchRuleset.ts PROVING_GROUND_RULES); this module turns them into
 *  - the layout: the firing line and one mark per lane at its set range and presented angle, each on standable ground,
 *    in clear sight of the firing line and clear of every nearer lane's silhouette (planProvingRange);
 *  - the moving-target driver: a target shuttling along its own hull axis about its mark (provingPatrolInput);
 *  - the range card: every round of the player's loadout measured at every lane's range against the target hull's centre
 *    of mass and against reference plates, by the same estimate the aim overlay and the bots read (provingShellCard);
 *  - the plate rack (2026-10-20): steel plates at a set range and angle, each a face a live round strikes
 *    (provingPlateStrike) and the damage law resolves (sim/damage.ts resolvePlateStrike);
 *  - the drive course (2026-10-20): ramps, a ditch, moguls and a side slope as graded profiles the battle's ground overlay
 *    raises (planProvingCourse, sim/terrainDeformation.ts CourseStamp).
 * game/state.ts seats the layout and drives the targets; the HUD draws the card from the mode state.
 */
import { Vector3 } from 'three';
import { penAtDistanceMm } from './ballistics.ts';
import { estimatePenRatio, type AimArmorInfo, type DamageShellSpec } from './damage.ts';
import {
  queryAimArmor, tankPoseFromState, type ArmorModel, type ArmorPlate, type ArmorPlateIntersection, type ArmorPoseState,
} from './armor.ts';
import type { CourseStamp } from './terrainDeformation.ts';
import type { ProvingGroundRules } from './matchRuleset.ts';
import type { ProvingOutcome, ProvingShellCard } from './matchModes.ts';

const DEG = Math.PI / 180;

/** A point on the range and the heading a hull stands on it with (forward = (sin yaw, cos yaw)). */
export interface ProvingMark {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface ProvingLaneMark extends ProvingMark {
  readonly index: number;
  /** The set range (m) and the range actually measured from the firing line to the mark (m). */
  readonly rangeM: number;
  readonly measuredM: number;
  readonly presentDeg: number;
  /** The offset across the range axis the lane settled on (m, + along (cos b, -sin b)). */
  readonly lateralM: number;
}

/**
 * One plate of the rack as it stands on the range: the centre of its face, the face's unit normal (toward the firing line,
 * laid back by its angle), its horizontal right axis and its up axis along the face, its half extents, and the plate the
 * damage law reads (rolled homogeneous armour: its physical, kinetic and chemical thickness all `mm`).
 */
export interface ProvingPlateMark {
  readonly index: number;
  readonly id: string;
  readonly mm: number;
  readonly angleDeg: number;
  /** Range from the firing line to the face's centre (m). */
  readonly rangeM: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The ground under the plate's foot and the heading its face looks along (toward the firing line). */
  readonly groundY: number;
  readonly yaw: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly rx: number;
  readonly rz: number;
  readonly ux: number;
  readonly uy: number;
  readonly uz: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly plate: ArmorPlate;
}

/** One feature of the drive course as laid on the ground: where it begins and ends on the course line, and its figure. */
export interface ProvingCourseFeatureMark {
  readonly index: number;
  readonly kind: 'ramp' | 'ditch' | 'moguls' | 'sideSlope';
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** The figure its board shows: a ramp's climb and descent (deg), a ditch's depth (m), the moguls' height (m), the side
   * slope (deg; `second` 0). */
  readonly first: number;
  readonly second: number;
}

export interface ProvingCourseLayout {
  /** The course line's heading (forward = (sin yaw, cos yaw)), its graded width, and its two ends. */
  readonly yaw: number;
  readonly widthM: number;
  readonly start: { readonly x: number; readonly z: number };
  readonly end: { readonly x: number; readonly z: number };
  readonly features: readonly ProvingCourseFeatureMark[];
  /** The earthworks, in the order the overlay takes them. */
  readonly stamps: readonly CourseStamp[];
}

export interface ProvingRangeLayout {
  /** The firing line: where the player deploys, facing down the range. */
  readonly origin: ProvingMark;
  readonly lanes: readonly ProvingLaneMark[];
  readonly plates: readonly ProvingPlateMark[];
  readonly course: ProvingCourseLayout;
}

/** The battlefield as the planner reads it: the ground's height and whether a hull of `radius` may stand at a point. */
interface ProvingGroundView {
  heightAt(x: number, z: number): number;
  standable(x: number, z: number, radius: number): boolean;
}

/** Offsets to try for a lane, nearest the preferred one first (preferred, +step, -step, +2 step, ...). */
function lateralCandidates(preferred: number, step: number, reach: number): number[] {
  const out = [preferred];
  for (let k = 1; k * step <= reach + 1e-9; k++) out.push(preferred + k * step, preferred - k * step);
  return out;
}

/** The ground between the sight and the target stays below the line of sight by `clearance` (m), sampled every 4 m. */
function sightlineClear(ground: ProvingGroundView, from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number }, clearance = 0.35): boolean {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(2, Math.ceil(length / 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    // the first and last few metres stand on the hulls themselves
    if (t * length < 8 || (1 - t) * length < 8) continue;
    const x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
    const line = from.y + (to.y - from.y) * t;
    if (ground.heightAt(x, z) > line - clearance) return false;
  }
  return true;
}

interface AngularSpan { readonly low: number; readonly high: number }

/**
 * Lay the range out: the firing line at the rules' point (or the nearest standable offset across the axis) facing down the
 * range, then each lane in order of range at the first offset (from the preferred one outward) whose mark is standable, in
 * clear sight of the firing line and clear of every nearer lane's silhouette by the rules' separation. Fails closed: a lane
 * with no such mark within the search reach throws (the layout receipt runs the real battlefield).
 */
export function planProvingRange(rules: ProvingGroundRules, ground: ProvingGroundView): ProvingRangeLayout {
  const bearing = rules.firingLine.bearingDeg * DEG;
  const fx = Math.sin(bearing), fz = Math.cos(bearing);
  const lx = Math.cos(bearing), lz = -Math.sin(bearing);
  const radius = rules.targetRadiusM;
  let origin: ProvingMark | null = null;
  for (const offset of lateralCandidates(0, rules.lateralStepM, rules.lateralReachM)) {
    const x = rules.firingLine.x + lx * offset, z = rules.firingLine.z + lz * offset;
    if (ground.standable(x, z, radius)) { origin = { x, z, yaw: bearing }; break; }
  }
  if (!origin) throw new Error('proving ground: no standable firing line within the search reach');
  const sight = { x: origin.x, y: ground.heightAt(origin.x, origin.z) + rules.sightHeightM, z: origin.z };
  const spans: AngularSpan[] = [];
  const marks: ProvingLaneMark[] = [];
  const order = rules.lanes.map((lane, index) => ({ lane, index })).sort((a, b) => a.lane.rangeM - b.lane.rangeM || a.index - b.index);
  const separation = rules.separationDeg * DEG;
  for (const { lane, index } of order) {
    let placed: ProvingLaneMark | null = null;
    for (const lateral of lateralCandidates(lane.lateralM, rules.lateralStepM, rules.lateralReachM)) {
      const x = origin.x + fx * lane.rangeM + lx * lateral, z = origin.z + fz * lane.rangeM + lz * lateral;
      if (marks.some((mark) => Math.hypot(mark.x - x, mark.z - z) < radius * 2 + 3)) continue;
      if (!ground.standable(x, z, radius)) continue;
      const target = { x, y: ground.heightAt(x, z) + rules.targetHeightM, z };
      if (!sightlineClear(ground, sight, target)) continue;
      const dx = x - origin.x, dz = z - origin.z, distance = Math.hypot(dx, dz);
      const angle = Math.atan2(dx * lx + dz * lz, dx * fx + dz * fz);
      const half = Math.asin(Math.min(1, radius / Math.max(distance, radius)));
      const span = { low: angle - half, high: angle + half };
      if (spans.some((other) => span.low < other.high + separation && span.high > other.low - separation)) continue;
      spans.push(span);
      // nose on is the heading toward the firing line; + presented degrees turn the nose to the hull's left
      const toShooter = Math.atan2(origin.x - x, origin.z - z);
      placed = {
        index, x, z, yaw: wrapAngle(toShooter + lane.presentDeg * DEG),
        rangeM: lane.rangeM, measuredM: distance, presentDeg: lane.presentDeg, lateralM: lateral,
      };
      break;
    }
    if (!placed) throw new Error(`proving ground: no clear mark for the ${lane.rangeM} m lane within the search reach`);
    marks.push(placed);
  }
  marks.sort((a, b) => a.index - b.index);
  const plates = planPlateRack(rules, origin, ground, sight);
  return Object.freeze({
    origin: Object.freeze(origin), lanes: Object.freeze(marks.map((mark) => Object.freeze(mark))),
    plates, course: planProvingCourse(rules, origin),
  });
}

/**
 * The plate rack laid out (fails closed like the lanes): plate i across the axis at the rack's range, each standing where
 * a hull could (level, clear of every solid), facing the firing line in clear sight of it and laid back by its angle.
 */
function planPlateRack(rules: ProvingGroundRules, origin: ProvingMark, ground: ProvingGroundView,
  sight: { x: number; y: number; z: number }): readonly ProvingPlateMark[] {
  const rack = rules.plateRack;
  const fx = Math.sin(origin.yaw), fz = Math.cos(origin.yaw);
  const lx = Math.cos(origin.yaw), lz = -Math.sin(origin.yaw);
  const halfW = rack.widthM / 2;
  return Object.freeze(rack.plates.map((rule, index) => {
    const halfH = (rule.lengthM ?? rack.heightM) / 2;
    const lateral = rack.lateralM + (index - (rack.plates.length - 1) / 2) * rack.spacingM;
    const footX = origin.x + fx * rack.rangeM + lx * lateral, footZ = origin.z + fz * rack.rangeM + lz * lateral;
    if (!ground.standable(footX, footZ, halfW)) throw new Error(`proving ground: plate ${index + 1} has no standing ground`);
    const groundY = ground.heightAt(footX, footZ);
    const yaw = Math.atan2(origin.x - footX, origin.z - footZ);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const lay = rule.angleDeg * DEG, sl = Math.sin(lay), cl = Math.cos(lay);
    // the face leans back from its foot: up along the face is (-f sin a, cos a), the normal (f cos a, sin a)
    const ux = -sy * sl, uy = cl, uz = -cy * sl;
    const x = footX + ux * halfH, y = groundY + rack.liftM + uy * halfH, z = footZ + uz * halfH;
    if (!sightlineClear(ground, sight, { x, y, z })) throw new Error(`proving ground: plate ${index + 1} is out of sight`);
    const plate: ArmorPlate = Object.freeze({
      name: `range_plate_${index + 1}`, verts: Object.freeze([]), physicalMm: rule.mm, keMm: rule.mm, ceMm: rule.mm, kind: 'main',
    });
    return Object.freeze({
      index, id: `range-plate-${index + 1}`, mm: rule.mm, angleDeg: rule.angleDeg,
      rangeM: Math.hypot(x - origin.x, z - origin.z), x, y, z, groundY, yaw,
      nx: sy * cl, ny: sl, nz: cy * cl, rx: cy, rz: -sy, ux, uy, uz, halfW, halfH, plate,
    });
  }));
}

const _strike = {
  kind: 'plate' as const, t: 0, point: new Vector3(), normal: new Vector3(), impactAngleDeg: 0,
  plate: null as unknown as ArmorPlate, impactFrame: 'plate',
  impactLocalX: 0, impactLocalY: 0, impactLocalZ: 0, impactLocalDirX: 0, impactLocalDirY: 0, impactLocalDirZ: 0,
} satisfies ArmorPlateIntersection;

/**
 * The nearest rack plate a round's step crosses: the segment from `from` along the unit `dir` for `length` m against each
 * plate's face (either side; a round from behind meets the back face). Returns the strike (a reused intersection: the
 * point, the face's normal toward the round, the raw angle from it, the plate) and its distance in `t`, or null.
 */
export function provingPlateStrike(plates: readonly ProvingPlateMark[], from: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number }, length: number): ArmorPlateIntersection | null {
  let best: ProvingPlateMark | null = null;
  let bestT = length;
  let bestDot = 0;
  for (const plate of plates) {
    const dot = dir.x * plate.nx + dir.y * plate.ny + dir.z * plate.nz;
    if (Math.abs(dot) < 1e-6) continue;
    const t = ((plate.x - from.x) * plate.nx + (plate.y - from.y) * plate.ny + (plate.z - from.z) * plate.nz) / dot;
    if (!(t >= 0) || t > bestT) continue;
    const px = from.x + dir.x * t - plate.x, py = from.y + dir.y * t - plate.y, pz = from.z + dir.z * t - plate.z;
    if (Math.abs(px * plate.rx + pz * plate.rz) > plate.halfW) continue;
    if (Math.abs(px * plate.ux + py * plate.uy + pz * plate.uz) > plate.halfH) continue;
    best = plate; bestT = t; bestDot = dot;
  }
  if (!best) return null;
  const side = bestDot > 0 ? -1 : 1;
  _strike.t = bestT;
  _strike.point.set(from.x + dir.x * bestT, from.y + dir.y * bestT, from.z + dir.z * bestT);
  _strike.normal.set(best.nx * side, best.ny * side, best.nz * side);
  _strike.impactAngleDeg = Math.acos(Math.min(1, Math.abs(bestDot))) / DEG;
  _strike.plate = best.plate;
  return _strike;
}

/** The plate a strike names (its rack index; -1 when the strike is not on the rack). */
export function provingPlateIndex(plates: readonly ProvingPlateMark[], strike: ArmorPlateIntersection): number {
  for (let i = 0; i < plates.length; i++) if (plates[i].plate === strike.plate) return i;
  return -1;
}

/** Profile knots (u, h) from the feature's start, its length along the course, and its board's figures. */
function featureProfile(feature: ProvingGroundRules['course']['features'][number]):
  { knots: number[]; lengthM: number; first: number; second: number } {
  switch (feature.kind) {
    case 'ramp': {
      const up = feature.heightM / Math.tan(feature.upDeg * DEG), down = feature.heightM / Math.tan(feature.downDeg * DEG);
      const lengthM = up + feature.topM + down;
      return { knots: [0, 0, up, feature.heightM, up + feature.topM, feature.heightM, lengthM, 0], lengthM,
        first: feature.upDeg, second: feature.downDeg };
    }
    case 'ditch': {
      const wall = feature.depthM / Math.tan(feature.wallDeg * DEG);
      const lengthM = wall * 2 + feature.floorM;
      return { knots: [0, 0, wall, -feature.depthM, wall + feature.floorM, -feature.depthM, lengthM, 0], lengthM,
        first: feature.depthM, second: feature.wallDeg };
    }
    case 'moguls': {
      const lengthM = feature.periodM * feature.count;
      const knots: number[] = [];
      const steps = feature.count * 8;
      for (let i = 0; i <= steps; i++) {
        const u = (lengthM * i) / steps;
        knots.push(u, feature.heightM * 0.5 * (1 - Math.cos((Math.PI * 2 * u) / feature.periodM)));
      }
      return { knots, lengthM, first: feature.heightM, second: feature.count };
    }
    case 'sideSlope':
      return { knots: [], lengthM: feature.lengthM, first: feature.deg, second: 0 };
  }
}

/** A side slope's back face, steeper than its graded face (deg). */
const SIDE_SLOPE_BACK_DEG = 30;

/**
 * The drive course laid out beside the range (pure: the rules and the firing line decide it): the course line from its
 * start, each feature after the last with the level gap between, each one stamp. A ramp, a ditch or the moguls carry their
 * profile along the line across the graded band; the side slope's profile runs across the line (its left side raised),
 * its own length along the line with the skirt past each end.
 */
export function planProvingCourse(rules: ProvingGroundRules, origin: ProvingMark): ProvingCourseLayout {
  const course = rules.course;
  const yaw = origin.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const lx = Math.cos(yaw), lz = -Math.sin(yaw);
  const sx = origin.x + fx * course.startM + lx * course.lateralM, sz = origin.z + fz * course.startM + lz * course.lateralM;
  const half = course.widthM / 2;
  const stamps: CourseStamp[] = [];
  const features: ProvingCourseFeatureMark[] = [];
  let along = 0;
  course.features.forEach((feature, index) => {
    const shape = featureProfile(feature);
    const lead = feature.kind === 'sideSlope' ? course.skirtM : 0;
    const a0 = along + lead, a1 = a0 + shape.lengthM, mid = (a0 + a1) / 2;
    const cx = sx + fx * mid, cz = sz + fz * mid;
    let profile: number[];
    let stampYaw = yaw, hw = half;
    if (feature.kind === 'sideSlope') {
      const rise = course.widthM * Math.tan(feature.deg * DEG);
      // across the line toward its left: level at the right edge, `rise` at the left edge, a steeper back face past it
      profile = [-half, 0, half, rise, half + rise / Math.tan(SIDE_SLOPE_BACK_DEG * DEG), 0];
      stampYaw = yaw + Math.PI / 2;
      hw = shape.lengthM / 2;
    } else {
      profile = shape.knots.map((value, k) => (k % 2 === 0 ? value - shape.lengthM / 2 : value));
    }
    stamps.push(Object.freeze({
      kind: 'course' as const, cx, cz, yaw: stampYaw, c: Math.cos(stampYaw), s: Math.sin(stampYaw), hw,
      skirtM: course.skirtM, profile: new Float64Array(profile),
    }));
    features.push(Object.freeze({
      index, kind: feature.kind, x0: sx + fx * a0, z0: sz + fz * a0, x1: sx + fx * a1, z1: sz + fz * a1,
      first: shape.first, second: shape.second,
    }));
    along = a1 + lead + course.gapM;
  });
  const total = along - course.gapM;
  return Object.freeze({
    yaw, widthM: course.widthM, start: Object.freeze({ x: sx, z: sz }),
    end: Object.freeze({ x: sx + fx * total, z: sz + fz * total }),
    features: Object.freeze(features), stamps: Object.freeze(stamps),
  });
}

/** Wrap an angle to (-pi, pi]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  else if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** A moving target's shuttle direction: +1 driving forward, -1 reversing. */
export interface ProvingPatrolState { dir: 1 | -1 }

interface PatrolPose {
  readonly pos: { readonly x: number; readonly z: number };
  readonly yaw: number;
  readonly speed: number;
}

/**
 * A moving target's drive for one step: shuttle `halfLengthM` either way of the mark along the mark's hull axis, turning
 * round at each end, steering for a point `lookaheadM` ahead on the line (the hull's tail leads in reverse). Writes the
 * throttle and steer into `out`; never fires. Movement turns a reversing hull the other way for the same steer
 * (sim/movement.ts reverseSteer), so the steer is mirrored once the hull is moving backwards.
 */
export function provingPatrolInput(
  mark: ProvingMark,
  pose: PatrolPose,
  patrol: ProvingGroundRules['patrol'],
  state: ProvingPatrolState,
  out: { throttle: number; steer: number },
): void {
  const ax = Math.sin(mark.yaw), az = Math.cos(mark.yaw);
  const along = (pose.pos.x - mark.x) * ax + (pose.pos.z - mark.z) * az;
  if (state.dir > 0 && along >= patrol.halfLengthM) state.dir = -1;
  else if (state.dir < 0 && along <= -patrol.halfLengthM) state.dir = 1;
  const ahead = along + state.dir * patrol.lookaheadM;
  const tx = mark.x + ax * ahead - pose.pos.x, tz = mark.z + az * ahead - pose.pos.z;
  const travel = Math.atan2(tx, tz);
  const desired = state.dir > 0 ? travel : travel + Math.PI;
  const error = wrapAngle(desired - pose.yaw);
  const reversing = pose.speed < -0.05;
  out.throttle = state.dir * patrol.throttle;
  out.steer = Math.max(-1, Math.min(1, patrol.steerGain * error)) * (reversing ? -1 : 1);
}

/** The aim overlay's colour bands (sim/damage.ts estimatePenRatio): green at or above 1.15, amber to 0.85, red below. */
export const PROVING_PEN_RATIO = Object.freeze({ pen: 1.15, marginal: 0.85 });

export function provingOutcome(ratio: number): ProvingOutcome {
  if (!(ratio > 0)) return 'nopen';
  return ratio >= PROVING_PEN_RATIO.pen ? 'pen' : ratio >= PROVING_PEN_RATIO.marginal ? 'marginal' : 'nopen';
}

const _origin = new Vector3();
const _plateAim = { plate: { name: 'reference plate', verts: [], physicalMm: 1, keMm: 1, ceMm: 1, kind: 'main' },
  impactAngleDeg: 0, point: new Vector3(), distM: 0, layers: [] } satisfies AimArmorInfo;

/** The average round's ratio of penetration to effective thickness against rolled homogeneous plate (T mm at angle deg). */
function plateRatio(shell: DamageShellSpec, distM: number, thicknessMm: number, angleDeg: number): number {
  _plateAim.plate.physicalMm = _plateAim.plate.keMm = _plateAim.plate.ceMm = thicknessMm;
  _plateAim.impactAngleDeg = angleDeg;
  return estimatePenRatio(shell, distM, _plateAim);
}

/**
 * The thickest rolled homogeneous plate (mm, to the nearest millimetre) the average round defeats at this range and angle
 * from the plate normal: normalization, the overmatch boost and the slope law as resolution applies them. 0 when no plate
 * of a millimetre or more is defeated (a ricochet at this angle, or no penetration at all).
 */
export function plateLimitMm(shell: DamageShellSpec, distM: number, angleDeg: number): number {
  if (plateRatio(shell, distM, 1, angleDeg) < 1) return 0;
  let low = 1, high = Math.max(2, Math.ceil(penAtDistanceMm(shell, distM) * 2 + 10));
  // the ratio falls as the plate thickens (the overmatch boost only shrinks with thickness): bisect the crossing
  while (plateRatio(shell, distM, high, angleDeg) >= 1) high *= 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (plateRatio(shell, distM, mid, angleDeg) >= 1) low = mid; else high = mid;
  }
  return low;
}

interface ProvingTargetView {
  readonly state: ArmorPoseState & { readonly pos: { readonly x: number; readonly y: number; readonly z: number } };
  readonly spec: { readonly armor: ArmorModel; readonly dims: { readonly heightM: number } };
}

const _toCentre = new Vector3();

/**
 * The armor stack a round meets when laid on a target's centre of mass from the sight: the aim query the overlay and the
 * bots read (sim/armor.ts queryAimArmor), along the line from the sight to the hull's centre at half its height.
 */
export function provingCentreAim(sight: { x: number; y: number; z: number }, target: ProvingTargetView): AimArmorInfo | null {
  _origin.set(sight.x, sight.y, sight.z);
  _toCentre.set(target.state.pos.x, target.state.pos.y + target.spec.dims.heightM * 0.5, target.state.pos.z).sub(_origin);
  const distance = _toCentre.length();
  if (!(distance > 0)) return null;
  _toCentre.divideScalar(distance);
  return queryAimArmor(_origin, _toCentre, distance + 20, tankPoseFromState(target.state), target.spec.armor);
}

/**
 * One round's card for one lane: its penetration at the range, the expected outcome laid on the target's centre of mass
 * (null aim: the round meets no plate on that line, read as no penetration), and the thickest reference plate it defeats
 * at each of the rules' angles.
 */
export function provingShellCard(
  shell: DamageShellSpec,
  distM: number,
  aim: AimArmorInfo | null,
  plateAnglesDeg: readonly number[],
): ProvingShellCard {
  const ratio = aim ? estimatePenRatio(shell, aim.distM, aim) : 0;
  return {
    penMm: Math.round(penAtDistanceMm(shell, distM)),
    ratio: Math.round(ratio * 100) / 100,
    outcome: aim ? provingOutcome(ratio) : 'nopen',
    plateMm: plateAnglesDeg.map((angle) => plateLimitMm(shell, distM, angle)),
  };
}
