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
import {
  HULL_STANDABLE_HEIGHT_M, HULL_STEP_UP_M, collisionPartTopAt, collisionRecordHasDrawnTop, createHullFootprint, hullFootprint,
  hullUndersideOver, pointInsideCollisionRecord, type HullFootprint,
} from '../world/collision.ts';

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
  /** The terrain's contact surface alone (movement.ts reads its walls from it; structures are floors or walls by the
   * standing rule). */
  getTerrainContactHeightAt?(x: number, z: number): number;
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
export type HullSupportPose = HullFootprint;

export interface StructureSupportField extends SupportHeightField {
  /** Select the hull about to be stepped: gathers the primitives within reach and its belly line (and, with a pose,
   * its underside over each primitive). */
  beginHull(x: number, z: number, bellyY: number, pose?: HullSupportPose | null): void;
  /** Number of primitives considered for the current hull (probes / receipts). */
  readonly candidateCount: number;
  /**
   * Reads so far that a primitive's top answered over the ground (destruction stream, 2026-10-13): the movement takes a
   * step whose support solve raised it for a step on a record (a rock's tier, a roof), where an edge is climbed at the
   * hull's pace (movement.ts EDGE_CLIMB_*), rather than a terrain face (a trench's wall), which lifts as before.
   */
  readonly recordReads: number;
}

/** A part's top under (x, z): its drawn top where it carries one (a stone's surface: world/collision.ts
 * collisionPartTopAt), else its flat top. */
function partTop(record: CollisionRecord, part: SimpleCollisionShape | null, x: number, z: number): number {
  return collisionPartTopAt(record, part, x, z);
}

/** Highest standable top under (x, z) among the candidates, or -Infinity. `floors` (beginHull's pose rule) holds each
 * candidate's own belly line; without it every candidate uses `bellyY`. */
export function structureTopAt(
  candidates: readonly CollisionRecord[], count: number, x: number, z: number, bellyY: number,
  floors: Float64Array | null = null, plane: SupportPlane | null = null,
): number {
  let best = -Infinity;
  // (physics stream, 2026-10-13) a drawn top (a stone's surface) is a floor where it lies within the step of the hull's
  // track plane at that very point — a hull pitched up a stone's flank stands its front on it — not of the underside's
  // lowest point over the whole record, which read the stone under a hull's raised nose as a wall
  const planeCeiling = plane ? plane.y + plane.slopeX * (x - plane.cx) + plane.slopeZ * (z - plane.cz) + SUPPORT_STEP_UP_M : NaN;
  for (let i = 0; i < count; i++) {
    const ceiling = (floors ? floors[i] : bellyY) + SUPPORT_STEP_UP_M;
    const record = candidates[i];
    if (record.crushed || record.dead || record.crushable) continue; // crushable cover is crushed, not stood on
    // (a drawn top is the stone's own surface, a floor however low: the push holds a hull off only its section a step up)
    if (record.max[1] - record.min[1] < SUPPORT_MIN_HEIGHT_M && !collisionRecordHasDrawnTop(record)) continue;
    if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
    const shape = record.shape2;
    if (shape && shape.kind === 'compound') {
      for (const part of shape.parts) {
        const top = partTop(record, part, x, z);
        const limit = part.kind === 'convex' && part.tp && plane ? Math.max(ceiling, planeCeiling) : ceiling;
        if (top > limit || top <= best) continue;
        if (pointInsideCollisionRecord(record, part, x, z)) best = top;
      }
    } else {
      // (a simple shape's top is its record's, as before; a drawn top where it carries one)
      const drawn = !!shape && shape.kind === 'convex' && !!shape.tp;
      const top = drawn ? partTop(record, shape, x, z) : record.max[1];
      if (top > (drawn && plane ? Math.max(ceiling, planeCeiling) : ceiling) || top <= best) continue;
      if (pointInsideCollisionRecord(record, shape ?? null, x, z)) best = top;
    }
  }
  return best;
}

/** A hull's track plane for the drawn-top rule (structureTopAt): its height at (cx, cz) and its rise per metre in x, z. */
export interface SupportPlane { y: number; cx: number; cz: number; slopeX: number; slopeZ: number }

type PoseSpec = Parameters<typeof tankContactRect>[0];
interface PoseState { pos: { x: number; z: number }; yaw: number; visualPitch?: number; visualRoll?: number }

/** Fill `out` with the hull's footprint at its rendered attitude (the ground OBB solver's frame,
 * world/collision.ts hullFootprint). */
export function hullSupportPose(spec: PoseSpec, state: PoseState, out: HullSupportPose): HullSupportPose {
  return hullFootprint(tankContactRect(spec), state.pos.x, state.pos.z, state.yaw, state.visualPitch || 0,
    state.visualRoll || 0, out);
}

/** A pose object for one caller's reuse (allocation-free stepping). */
export function createHullSupportPose(): HullSupportPose {
  return createHullFootprint();
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
  const plane: SupportPlane = { y: 0, cx: 0, cz: 0, slopeX: 0, slopeZ: 0 };
  const terrainAt = terrain.getHeightAt.bind(terrain);
  const terrainFast = terrain.getHeightAtFast ? terrain.getHeightAtFast.bind(terrain) : terrainAt;
  let recordReads = 0;
  const sample = (base: (x: number, z: number) => number) => (x: number, z: number): number => {
    const ground = base(x, z);
    if (count === 0) return ground;
    const top = structureTopAt(candidates, count, x, z, belly, posed ? floors : null, posed ? plane : null);
    if (top > ground + 0.02) { recordReads++; return top; }
    return top > ground ? top : ground;
  };
  const getHeightAt = sample(terrainAt);
  const getHeightAtFast = sample(terrainFast);
  const terrainContact = terrain.getContactHeightAt?.bind(terrain) ?? terrainFast;
  const getContactHeightAt = sample(terrainContact);
  return {
    getHeightAt,
    getHeightAtFast,
    getContactHeightAt,
    getTerrainContactHeightAt: terrainContact,
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
      plane.y = bellyY + pose.centerRise; plane.cx = pose.centerX; plane.cz = pose.centerZ;
      plane.slopeX = pose.riseAlong * pose.forwardX + pose.riseAcross * pose.rightX;
      plane.slopeZ = pose.riseAlong * pose.forwardZ + pose.riseAcross * pose.rightZ;
      if (floors.length < count) floors = new Float64Array(Math.max(count, floors.length * 2));
      for (let i = 0; i < count; i++) {
        floors[i] = hullUndersideOver(candidates[i], pose, bellyY);
      }
    },
    get candidateCount() { return count; },
    get recordReads() { return recordReads; },
  };
}
