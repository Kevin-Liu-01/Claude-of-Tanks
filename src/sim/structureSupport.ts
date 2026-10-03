/**
 * Structure support — round 30 (owner 2026-09-20: tanks "glitch out and go crazy when they hit buildings or are on
 * or in them ... it should literally just be in our engine as all just primitives").
 *
 * The ride used to sample only the terrain height field, so a hull that landed on a roof (a jump, a knock, a
 * ramp) had no floor under it: it fell through the building until the ground OBB solver found it inside the
 * footprint and shoved it out sideways in one frame — the "goes crazy" pop. This module wraps the height field
 * per hull so every support sample also sees the tops of the collision primitives under the point: a hull whose
 * belly is above a part's top stands on that top exactly like on terrain, drives across it and falls off the
 * edge. Parts the hull is already below (it is beside or inside them) are ignored — the OBB solver keeps owning
 * those contacts. Pure and allocation-free per tick; solo and authoritative sims share it.
 */
import type { CollisionRecord, SimpleCollisionShape } from '../world/collision.ts';
import { driveGroundTypeAt } from './terrainMobility.ts';
import { tankContactRect } from './tankContactShape.ts';
import { HULL_STANDABLE_HEIGHT_M, HULL_STEP_UP_M, hullUndersideOver, pointInsideCollisionRecord } from '../world/collision.ts';

/** A hull stands on a part whose top is at most this far above the hull's current belly line (the same step the
 * ground OBB solver treats as "on top of", collision.ts hullPassesObstacleTop). */
export const SUPPORT_STEP_UP_M = HULL_STEP_UP_M;
/** Parts lower than this (kerbs, sandbags, wreck plates) are driven over by the ride spring, not stood on. */
export const SUPPORT_MIN_HEIGHT_M = HULL_STANDABLE_HEIGHT_M;
/** Query margin around the hull for candidate primitives. */
const SUPPORT_QUERY_MARGIN_M = 6;

interface SupportHeightField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getContactHeightAt?(x: number, z: number): number;
  getGroundType(x: number, z: number): string;
  getDriveGroundType?(x: number, z: number): string;
}

interface SupportObstacleSource {
  queryObstacles?(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]): CollisionRecord[];
  getObstacles?(): CollisionRecord[];
}

/**
 * The hull's contact rect and attitude for the floor rule (physics lane, 2026-10-03): with it, a part is a floor when
 * its top is within the step-up of the hull's lowest underside point over that part's footprint — the ground OBB
 * solver's standing rule (world/collision.ts hullUndersideOver) — instead of the belly line at the hull's origin. The
 * origin alone dropped the roof from under a hull pivoting off its edge (belly on the edge, origin already behind and
 * below it): the hull fell into the building, which the solver then judged it to be standing on.
 */
export interface HullSupportPose {
  centerX: number;
  centerZ: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
  halfLength: number;
  halfWidth: number;
  sinPitch: number;
  sinRoll: number;
  frontLift: number;
  rearLift: number;
}

export interface StructureSupportField extends SupportHeightField {
  /** Select the hull about to be stepped: gathers the primitives within reach and its belly line (and, with a pose,
   * its underside over each primitive). */
  beginHull(x: number, z: number, bellyY: number, pose?: HullSupportPose | null): void;
  /** Number of primitives considered for the current hull (probes / receipts). */
  readonly candidateCount: number;
}

function partTop(record: CollisionRecord, part: SimpleCollisionShape | null): number {
  return part?.y1 ?? record.max[1];
}

/** Highest standable top under (x, z) among the candidates, or -Infinity. `floors` (beginHull's pose rule) holds each
 * candidate's own belly line; without it every candidate uses `bellyY`. */
export function structureTopAt(
  candidates: readonly CollisionRecord[], count: number, x: number, z: number, bellyY: number,
  floors: Float64Array | null = null,
): number {
  let best = -Infinity;
  for (let i = 0; i < count; i++) {
    const ceiling = (floors ? floors[i] : bellyY) + SUPPORT_STEP_UP_M;
    const record = candidates[i];
    if (record.crushed || record.dead || record.crushable) continue; // crushable cover is crushed, not stood on
    if (record.max[1] - record.min[1] < SUPPORT_MIN_HEIGHT_M) continue;
    if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
    const shape = record.shape2;
    if (shape && shape.kind === 'compound') {
      for (const part of shape.parts) {
        const top = partTop(record, part);
        if (top > ceiling || top <= best) continue;
        if (pointInsideCollisionRecord(record, part, x, z)) best = top;
      }
    } else {
      const top = record.max[1];
      if (top > ceiling || top <= best) continue;
      if (pointInsideCollisionRecord(record, shape ?? null, x, z)) best = top;
    }
  }
  return best;
}

type PoseSpec = Parameters<typeof tankContactRect>[0];
interface PoseState { pos: { x: number; z: number }; yaw: number; visualPitch?: number; visualRoll?: number }

/** Fill `out` with the hull's contact rect and rendered attitude (the ground OBB solver's frame). */
export function hullSupportPose(spec: PoseSpec, state: PoseState, out: HullSupportPose): HullSupportPose {
  const rect = tankContactRect(spec);
  const forwardX = Math.sin(state.yaw), forwardZ = Math.cos(state.yaw);
  out.forwardX = forwardX;
  out.forwardZ = forwardZ;
  out.rightX = forwardZ;
  out.rightZ = -forwardX;
  out.centerX = state.pos.x + forwardZ * rect.centerX + forwardX * rect.centerZ;
  out.centerZ = state.pos.z - forwardX * rect.centerX + forwardZ * rect.centerZ;
  out.halfLength = rect.halfLength;
  out.halfWidth = rect.halfWidth;
  out.sinPitch = Math.sin(state.visualPitch || 0);
  out.sinRoll = Math.sin(state.visualRoll || 0);
  out.frontLift = rect.frontLiftM;
  out.rearLift = rect.rearLiftM;
  return out;
}

/** A pose object for one caller's reuse (allocation-free stepping). */
export function createHullSupportPose(): HullSupportPose {
  return { centerX: 0, centerZ: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, halfLength: 0, halfWidth: 0,
    sinPitch: 0, sinRoll: 0, frontLift: 0, rearLift: 0 };
}

export function createStructureSupportField(
  terrain: SupportHeightField,
  source: SupportObstacleSource,
): StructureSupportField {
  const candidates: CollisionRecord[] = [];
  let count = 0;
  let belly = -Infinity;
  let floors = new Float64Array(16);
  let posed = false;
  const terrainAt = terrain.getHeightAt.bind(terrain);
  const terrainFast = terrain.getHeightAtFast ? terrain.getHeightAtFast.bind(terrain) : terrainAt;
  const sample = (base: (x: number, z: number) => number) => (x: number, z: number): number => {
    const ground = base(x, z);
    if (count === 0) return ground;
    const top = structureTopAt(candidates, count, x, z, belly, posed ? floors : null);
    return top > ground ? top : ground;
  };
  const getHeightAt = sample(terrainAt);
  const getHeightAtFast = sample(terrainFast);
  const getContactHeightAt = sample(terrain.getContactHeightAt?.bind(terrain) ?? terrainFast);
  return {
    getHeightAt,
    getHeightAtFast,
    getContactHeightAt,
    getGroundType: (x, z) => terrain.getGroundType(x, z),
    getDriveGroundType: (x, z) => driveGroundTypeAt(terrain, x, z),
    beginHull(x, z, bellyY, pose) {
      belly = bellyY;
      candidates.length = 0;
      if (source.queryObstacles) {
        source.queryObstacles(x - SUPPORT_QUERY_MARGIN_M, z - SUPPORT_QUERY_MARGIN_M,
          x + SUPPORT_QUERY_MARGIN_M, z + SUPPORT_QUERY_MARGIN_M, candidates);
      } else if (source.getObstacles) {
        for (const record of source.getObstacles()) {
          if (record.max[0] < x - SUPPORT_QUERY_MARGIN_M || record.min[0] > x + SUPPORT_QUERY_MARGIN_M
            || record.max[2] < z - SUPPORT_QUERY_MARGIN_M || record.min[2] > z + SUPPORT_QUERY_MARGIN_M) continue;
          candidates.push(record);
        }
      }
      count = candidates.length;
      posed = !!pose;
      if (!pose) return;
      if (floors.length < count) floors = new Float64Array(Math.max(count, floors.length * 2));
      for (let i = 0; i < count; i++) {
        floors[i] = hullUndersideOver(candidates[i], pose.centerX, pose.centerZ, pose.forwardX, pose.forwardZ,
          pose.rightX, pose.rightZ, pose.halfLength, pose.halfWidth, bellyY, pose.sinPitch, pose.sinRoll,
          pose.frontLift, pose.rearLift);
      }
    },
    get candidateCount() { return count; },
  };
}
