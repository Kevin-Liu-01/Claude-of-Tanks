import { collisionFootprintContainsPoint, type CollisionRecord, type ObstacleQuery } from './collision.ts';
import type { TypedArray } from 'three';
import type { StructureSourceSolid } from './structureCollision.ts';

export type GroundCoverBlocked = (
  x: number, y: number, z: number, height: number, radius: number,
) => boolean;

export interface GroundCoverSolidProfile {
  readonly solidCount: number;
  readonly byteLength: number;
}

export const GROUND_COVER_PLACEMENT_BYTES = 6 * Float64Array.BYTES_PER_ELEMENT;

interface GroundCoverPlacement {
  solids: Float64Array;
  /** Initial x/y/z, inverse-scaled yaw cosine/sine, inverse uniform scale. */
  transform: Float64Array;
}

// Cosmetic ownership only: authoritative records/serializers remain unchanged.
// Neither map retains a world, mesh, source geometry, or mutable placement matrix.
const profileData = new WeakMap<GroundCoverSolidProfile, Float64Array>();
const placementData = new WeakMap<CollisionRecord, GroundCoverPlacement>();

/**
 * A footprint's winding from its signed area: 1 counter-clockwise (inside on the left of every edge), -1 clockwise —
 * the law collision.ts reads (convexWinding). The connected-solid extraction hands footprints over in either winding
 * (26,968 clockwise convex parts over the 33 maps' shards, most of them the roof and wall strips of the structures'
 * bands), and this module read every one as counter-clockwise: a clockwise base held no upper solid (so a solid house
 * took a cosmetic profile it does not need) and a clockwise solid's packed planes faced outward (so it cleared no
 * ground cover under itself, and its edges' strips outside it instead).
 */
function polygonWinding(points: readonly number[]): number {
  let area2 = 0;
  for (let index = 0; index < points.length; index += 2) {
    const next = index + 2 < points.length ? index + 2 : 0;
    area2 += points[index] * points[next + 1] - points[next] * points[index + 1];
  }
  return area2 < 0 ? -1 : 1;
}

function polygonContains(outer: readonly number[], inner: readonly number[]): boolean {
  const winding = polygonWinding(outer);
  for (let corner = 0; corner < inner.length; corner += 2) {
    for (let edge = 0; edge < outer.length; edge += 2) {
      const next = (edge + 2) % outer.length;
      const ex = outer[next] - outer[edge], ez = outer[next + 1] - outer[edge + 1];
      if (winding * (ex * (inner[corner + 1] - outer[edge + 1])
        - ez * (inner[corner] - outer[edge])) < -1e-8) return false;
    }
  }
  return true;
}

function needsVerticalDetail(solids: readonly StructureSourceSolid[], contactTop: number): boolean {
  let floor = Infinity;
  for (const solid of solids) floor = Math.min(floor, solid.minY);
  const grounded = solids.filter(solid => solid.minY <= floor + 0.06);
  for (const solid of solids) {
    // a regional kit's weathered roof (maps/regional/weather.ts) is a roof too
    if (solid.bucket === 'roof' || solid.bucket === 'regionalRoof' || solid.minY <= floor + 0.06 || solid.minY > contactTop) continue;
    if (!grounded.some(base => polygonContains(base.points, solid.points))) return true;
  }
  return false;
}

/** Compile connected solids once per affected family; never change collision profiles. */
export function createGroundCoverSolidProfile(
  solids: readonly StructureSourceSolid[], contactTop: number,
): GroundCoverSolidProfile | null {
  if (!needsVerticalDetail(solids, contactTop)) return null;
  let length = 0;
  for (const solid of solids) length += 3 + solid.points.length / 2 * 3;
  const packed = new Float64Array(length);
  let offset = 0;
  for (const solid of solids) {
    packed[offset++] = solid.minY;
    packed[offset++] = solid.maxY;
    packed[offset++] = solid.points.length / 2;
    // every edge's plane faces inward whichever way the footprint winds
    const winding = polygonWinding(solid.points);
    for (let edge = 0; edge < solid.points.length; edge += 2) {
      const next = (edge + 2) % solid.points.length;
      const ex = solid.points[next] - solid.points[edge];
      const ez = solid.points[next + 1] - solid.points[edge + 1];
      const inverseLength = winding / Math.hypot(ex, ez);
      const nx = -ez * inverseLength, nz = ex * inverseLength;
      packed[offset++] = nx;
      packed[offset++] = nz;
      packed[offset++] = nx * solid.points[edge] + nz * solid.points[edge + 1];
    }
  }
  const profile = Object.freeze({ solidCount: solids.length, byteLength: packed.byteLength });
  profileData.set(profile, packed);
  return profile;
}

function isUniformYawMatrix(matrix: readonly number[]): boolean {
  if (matrix.length !== 16 || !matrix.every(Number.isFinite) || matrix[5] <= 0) return false;
  const tolerance = matrix[5] * 1e-10;
  for (const index of [1, 3, 4, 6, 7, 9, 11]) if (Math.abs(matrix[index]) > tolerance) return false;
  return Math.abs(matrix[15] - 1) < 1e-10
    && Math.abs(matrix[0] - matrix[10]) < tolerance
    && Math.abs(matrix[2] + matrix[8]) < tolerance
    && Math.abs(Math.hypot(matrix[0], matrix[2]) - matrix[5]) < tolerance;
}

/** Snapshot the final actual instance transform; unsupported tilts retain the old path. */
export function attachGroundCoverSolidProfile(
  record: CollisionRecord, profile: GroundCoverSolidProfile, matrix: readonly number[],
): boolean {
  if (placementData.has(record)) throw new Error('Ground-cover solid placement is already sealed');
  const solids = profileData.get(profile);
  if (!solids) throw new Error('Unknown ground-cover solid profile');
  if (!isUniformYawMatrix(matrix)) return false;
  const inverseScale = 1 / matrix[5];
  const transform = new Float64Array([
    matrix[12], matrix[13], matrix[14],
    matrix[0] * inverseScale * inverseScale,
    matrix[8] * inverseScale * inverseScale, inverseScale,
  ]);
  placementData.set(record, { solids, transform });
  return true;
}

function intersectsPackedSolid(
  data: Float64Array, start: number, end: number, x: number, z: number, radius: number,
): boolean {
  for (let edge = start; edge < end; edge += 3) {
    if (data[edge] * x + data[edge + 1] * z < data[edge + 2] - radius) return false;
  }
  return true;
}

function detailedSolidIntersects(
  detail: GroundCoverPlacement, x: number, y: number, z: number, height: number, radius: number,
): boolean {
  const t = detail.transform, data = detail.solids;
  const dx = x - t[0], dz = z - t[2];
  const localX = dx * t[3] - dz * t[4], localZ = dx * t[4] + dz * t[3];
  const lowY = (y + 0.06 - t[1]) * t[5], highY = (y + height - t[1]) * t[5];
  const localRadius = radius * t[5];
  for (let offset = 0; offset < data.length;) {
    const next = offset + 3 + data[offset + 2] * 3;
    if (data[offset + 1] >= lowY && data[offset] <= highY
      && intersectsPackedSolid(data, offset + 3, next, localX, localZ, localRadius)) return true;
    offset = next;
  }
  return false;
}

/** Reuse the world's solid-footprint index; never scan the scene or add a grid. */
/**
 * The scenery lane (b14; gauntlet wave 97 on the boulders: "sitting on a clean lawn … no burial, soil lip, or grass and
 * moss creeping up its skirt"): records the ground cover may lap — a boulder's. A tuft is cleared only when its own
 * root lies in the footprint, so the tufts round a stone's foot stand against it and lean on it, where the whole disc
 * test cleared a ring of bare ground a tuft wide round every stone. Cosmetic ownership only: the record is unchanged.
 */
const lappedRecords = new WeakSet<CollisionRecord>();
export function letGroundCoverLap(record: CollisionRecord): void {
  lappedRecords.add(record);
}

export function createGroundCoverClearance(query: ObstacleQuery): GroundCoverBlocked {
  const candidates: CollisionRecord[] = [];
  return (x, y, z, height, radius) => {
    query(x - radius, z - radius, x + radius, z + radius, candidates);
    for (const record of candidates) {
      // Keep natural ground beneath elevated decks. Dead/crushed flags are
      // deliberately ignored: streamed grass must not depend on battle state.
      if (record.max[1] < y + 0.06 || record.min[1] > y + height) continue;
      if (!collisionFootprintContainsPoint(record, x, z, lappedRecords.has(record) ? 0 : radius)) continue;
      const detail = placementData.get(record);
      if (!detail || detailedSolidIntersects(detail, x, y, z, height, radius)) return true;
    }
    return false;
  };
}

/** Construction-only stable compaction. Retained transforms/colors stay exact. */
export function compactGroundCoverInstances(
  matrices: TypedArray, colors: TypedArray | null, count: number,
  height: number, radius: number, blocked: GroundCoverBlocked,
): number {
  let kept = 0;
  for (let index = 0; index < count; index++) {
    const at = index * 16;
    const scale = Math.hypot(matrices[at], matrices[at + 2]);
    if (blocked(matrices[at + 12], matrices[at + 13], matrices[at + 14],
      height * matrices[at + 5], radius * scale)) continue;
    if (kept !== index) {
      matrices.copyWithin(kept * 16, at, at + 16);
      colors?.copyWithin(kept * 3, index * 3, index * 3 + 3);
    }
    kept++;
  }
  return kept;
}
