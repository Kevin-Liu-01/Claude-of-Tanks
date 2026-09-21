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
import { HULL_STANDABLE_HEIGHT_M, HULL_STEP_UP_M, pointInsideCollisionRecord } from '../world/collision.ts';

/** A hull stands on a part whose top is at most this far above the hull's current belly line (the same step the
 * ground OBB solver treats as "on top of", collision.ts hullPassesObstacleTop). */
export const SUPPORT_STEP_UP_M = HULL_STEP_UP_M;
/** Parts lower than this (kerbs, sandbags, wreck plates) are driven over by the ride spring, not stood on. */
export const SUPPORT_MIN_HEIGHT_M = HULL_STANDABLE_HEIGHT_M;
/** Query margin around the hull for candidate primitives. */
const SUPPORT_QUERY_MARGIN_M = 6;

export interface SupportHeightField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getGroundType(x: number, z: number): string;
}

export interface SupportObstacleSource {
  queryObstacles?(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]): CollisionRecord[];
  getObstacles?(): CollisionRecord[];
}

export interface StructureSupportField extends SupportHeightField {
  /** Select the hull about to be stepped: gathers the primitives within reach and its belly line. */
  beginHull(x: number, z: number, bellyY: number): void;
  /** Number of primitives considered for the current hull (probes / receipts). */
  readonly candidateCount: number;
}

function partTop(record: CollisionRecord, part: SimpleCollisionShape | null): number {
  return part?.y1 ?? record.max[1];
}

/** Highest standable top under (x, z) among the candidates, or -Infinity. */
export function structureTopAt(
  candidates: readonly CollisionRecord[], count: number, x: number, z: number, bellyY: number,
): number {
  let best = -Infinity;
  const ceiling = bellyY + SUPPORT_STEP_UP_M;
  for (let i = 0; i < count; i++) {
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

export function createStructureSupportField(
  terrain: SupportHeightField,
  source: SupportObstacleSource,
): StructureSupportField {
  const candidates: CollisionRecord[] = [];
  let count = 0;
  let belly = -Infinity;
  const terrainAt = terrain.getHeightAt.bind(terrain);
  const terrainFast = terrain.getHeightAtFast ? terrain.getHeightAtFast.bind(terrain) : terrainAt;
  const sample = (base: (x: number, z: number) => number) => (x: number, z: number): number => {
    const ground = base(x, z);
    if (count === 0) return ground;
    const top = structureTopAt(candidates, count, x, z, belly);
    return top > ground ? top : ground;
  };
  const getHeightAt = sample(terrainAt);
  const getHeightAtFast = sample(terrainFast);
  return {
    getHeightAt,
    getHeightAtFast,
    getGroundType: (x, z) => terrain.getGroundType(x, z),
    beginHull(x, z, bellyY) {
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
    },
    get candidateCount() { return count; },
  };
}
