import type { Box3 } from 'three';
import type { GeometryBuckets, StructureDimensions } from './exteriorDetailKit.ts';

/**
 * A local, axis-aligned slice of authored structure geometry. Builders keep
 * their broad placement envelope only for terrain seating; these slices are
 * the substantially tighter gameplay shape used by movement and ray queries.
 */
export interface StructureCollisionFootprint {
  readonly cx: number;
  readonly cz: number;
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface StructureCollisionAudit {
  readonly purpose: StructureCollisionPurpose;
  readonly footprints: readonly StructureCollisionFootprint[];
  readonly broadAreaM2: number;
  readonly footprintAreaM2: number;
  readonly tightness: number;
  readonly sourceParts: number;
}

export type StructureCollisionPurpose = 'movement' | 'ray';

// These authored families contain intentional drive-through space, separated
// buildings, exposed supports or accessible courtyards. Every other catalog
// building is a closed shell and can use one measured exterior OBB without
// changing any reachable gameplay space.
export const structureCollisionOpenIds = Object.freeze(new Set([
  'ruin', 'market', 'marketRow', 'compound', 'compoundSouk', 'caravanserai',
  'containerRow', 'gantry', 'watertower', 'shed', 'boatshed', 'netyard',
  'granary', 'woodshed', 'fishery', 'parkingdeck',
]));

const STRUCTURE_OVERHEAD_IDS = Object.freeze(new Set([
  'market', 'marketRow', 'containerRow', 'gantry', 'watertower', 'shed',
  'boatshed', 'netyard', 'granary', 'woodshed', 'fishery', 'parkingdeck',
]));

const MOVEMENT_BUCKETS = Object.freeze([
  'plaster', 'plaster2', 'plaster3', 'stone', 'wood', 'dark', 'baked',
]);
const RAY_BUCKETS = Object.freeze([
  ...MOVEMENT_BUCKETS,
  'roof', 'glass', 'curtain', 'straw',
  'structureWood', 'structureCanvas', 'structureMetal',
]);
const MIN_STRUCTURAL_HEIGHT = 0.52;
const MIN_FOOTPRINT_EDGE = 0.09;
const CONTAINMENT_EPSILON = 0.055;
const MAX_MOVEMENT_FOOTPRINTS = 16;
const MAX_RAY_FOOTPRINTS = 24;

interface MutableFootprint {
  cx: number;
  cz: number;
  halfWidth: number;
  halfLength: number;
  minY: number;
  maxY: number;
}

function area(footprint: StructureCollisionFootprint): number {
  return footprint.halfWidth * footprint.halfLength * 4;
}

function contains(a: StructureCollisionFootprint, b: StructureCollisionFootprint): boolean {
  return Math.abs(a.cx - b.cx) + b.halfWidth <= a.halfWidth + CONTAINMENT_EPSILON
    && Math.abs(a.cz - b.cz) + b.halfLength <= a.halfLength + CONTAINMENT_EPSILON;
}

function overlapArea(a: StructureCollisionFootprint, b: StructureCollisionFootprint): number {
  const x = Math.max(0,
    Math.min(a.cx + a.halfWidth, b.cx + b.halfWidth)
      - Math.max(a.cx - a.halfWidth, b.cx - b.halfWidth));
  const z = Math.max(0,
    Math.min(a.cz + a.halfLength, b.cz + b.halfLength)
      - Math.max(a.cz - a.halfLength, b.cz - b.halfLength));
  return x * z;
}

function mergeCollinearFootprints(input: readonly MutableFootprint[]): MutableFootprint[] {
  const footprints = input.map((footprint) => ({ ...footprint }));
  // Procedural wall bays deliberately retain a ~13 cm visual mortar seam;
  // this is far below a track shoe and should not multiply collision records.
  const edgeEpsilon = 0.14;
  const heightEpsilon = 0.13;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let aIndex = 0; aIndex < footprints.length; aIndex += 1) {
      const a = footprints[aIndex];
      for (let bIndex = aIndex + 1; bIndex < footprints.length; bIndex += 1) {
        const b = footprints[bIndex];
        if (Math.abs(a.minY - b.minY) > heightEpsilon
          || Math.abs(a.maxY - b.maxY) > heightEpsilon) continue;
        const ax0 = a.cx - a.halfWidth;
        const ax1 = a.cx + a.halfWidth;
        const az0 = a.cz - a.halfLength;
        const az1 = a.cz + a.halfLength;
        const bx0 = b.cx - b.halfWidth;
        const bx1 = b.cx + b.halfWidth;
        const bz0 = b.cz - b.halfLength;
        const bz1 = b.cz + b.halfLength;
        const sameX = Math.abs(ax0 - bx0) <= edgeEpsilon && Math.abs(ax1 - bx1) <= edgeEpsilon;
        const sameZ = Math.abs(az0 - bz0) <= edgeEpsilon && Math.abs(az1 - bz1) <= edgeEpsilon;
        const zGap = Math.max(az0, bz0) - Math.min(az1, bz1);
        const xGap = Math.max(ax0, bx0) - Math.min(ax1, bx1);
        if (!((sameX && zGap <= edgeEpsilon) || (sameZ && xGap <= edgeEpsilon))) continue;
        const minX = Math.min(ax0, bx0);
        const maxX = Math.max(ax1, bx1);
        const minZ = Math.min(az0, bz0);
        const maxZ = Math.max(az1, bz1);
        footprints[aIndex] = {
          cx: (minX + maxX) * 0.5,
          cz: (minZ + maxZ) * 0.5,
          halfWidth: (maxX - minX) * 0.5,
          halfLength: (maxZ - minZ) * 0.5,
          minY: Math.min(a.minY, b.minY),
          maxY: Math.max(a.maxY, b.maxY),
        };
        footprints.splice(bIndex, 1);
        changed = true;
        break outer;
      }
    }
  }
  return footprints;
}

function unionArea(footprints: readonly StructureCollisionFootprint[]): number {
  // Exact sweep of the small axis-aligned local rectangle set. This runs only
  // while a map is constructed and makes the strict receipt independent of
  // overlapping wall/foundation/detail boxes.
  const xs = [...new Set(footprints.flatMap((footprint) => [
    footprint.cx - footprint.halfWidth,
    footprint.cx + footprint.halfWidth,
  ]))].sort((a, b) => a - b);
  let total = 0;
  for (let index = 0; index + 1 < xs.length; index += 1) {
    const x0 = xs[index];
    const x1 = xs[index + 1];
    const xm = (x0 + x1) * 0.5;
    const ranges = footprints
      .filter((footprint) => xm >= footprint.cx - footprint.halfWidth
        && xm <= footprint.cx + footprint.halfWidth)
      .map((footprint) => [
        footprint.cz - footprint.halfLength,
        footprint.cz + footprint.halfLength,
      ] as const)
      .sort((a, b) => a[0] - b[0]);
    if (!ranges.length) continue;
    let z0 = ranges[0][0];
    let z1 = ranges[0][1];
    let zLength = 0;
    for (let rangeIndex = 1; rangeIndex < ranges.length; rangeIndex += 1) {
      const range = ranges[rangeIndex];
      if (range[0] <= z1) z1 = Math.max(z1, range[1]);
      else {
        zLength += z1 - z0;
        z0 = range[0];
        z1 = range[1];
      }
    }
    zLength += z1 - z0;
    total += (x1 - x0) * zLength;
  }
  return total;
}

function finishAudit(
  purpose: StructureCollisionPurpose,
  footprints: readonly MutableFootprint[],
  dimensions: StructureDimensions,
  sourceParts: number,
  maxFootprints: number,
): StructureCollisionAudit {
  const bounded = footprints.slice(0, maxFootprints);
  if (!bounded.length) {
    bounded.push({
      cx: 0,
      cz: 0,
      halfWidth: Math.max(0.1, dimensions.w * 0.5 - 0.12),
      halfLength: Math.max(0.1, dimensions.d * 0.5 - 0.12),
      minY: 0,
      maxY: dimensions.h,
    });
  }
  const broadAreaM2 = Math.max(1e-6, dimensions.w * dimensions.d);
  const footprintAreaM2 = unionArea(bounded);
  return Object.freeze({
    purpose,
    footprints: Object.freeze(bounded.map((footprint) => Object.freeze({ ...footprint }))),
    broadAreaM2,
    footprintAreaM2,
    tightness: Math.min(1, footprintAreaM2 / broadAreaM2),
    sourceParts,
  });
}

function closedStructureEnvelope(
  buckets: GeometryBuckets,
  dimensions: StructureDimensions,
): MutableFootprint | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const bucket of MOVEMENT_BUCKETS) {
    for (const geometry of buckets[bucket] || []) {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) continue;
      minX = Math.min(minX, bounds.min.x);
      maxX = Math.max(maxX, bounds.max.x);
      minZ = Math.min(minZ, bounds.min.z);
      maxZ = Math.max(maxZ, bounds.max.z);
      minY = Math.min(minY, bounds.min.y);
      maxY = Math.max(maxY, bounds.max.y);
    }
  }
  if (!Number.isFinite(minX + maxX + minZ + maxZ + minY + maxY)) return null;
  // Keep exterior fixtures from making a closed building broader than its
  // authored placement envelope. Roof overhangs are represented separately
  // by the ray audit and must not widen tank movement collision.
  minX = Math.max(minX, -dimensions.w * 0.5);
  maxX = Math.min(maxX, dimensions.w * 0.5);
  minZ = Math.max(minZ, -dimensions.d * 0.5);
  maxZ = Math.min(maxZ, dimensions.d * 0.5);
  return {
    cx: (minX + maxX) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    halfWidth: Math.max(MIN_FOOTPRINT_EDGE * 0.5, (maxX - minX) * 0.5),
    halfLength: Math.max(MIN_FOOTPRINT_EDGE * 0.5, (maxZ - minZ) * 0.5),
    minY: Math.max(0, minY),
    maxY,
  };
}

function footprintFromBounds(bounds: Box3, clampToGround = false): MutableFootprint {
  const width = bounds.max.x - bounds.min.x;
  const length = bounds.max.z - bounds.min.z;
  return {
    cx: (bounds.min.x + bounds.max.x) * 0.5,
    cz: (bounds.min.z + bounds.max.z) * 0.5,
    halfWidth: width * 0.5,
    halfLength: length * 0.5,
    minY: clampToGround ? Math.max(0, bounds.min.y) : bounds.min.y,
    maxY: bounds.max.y,
  };
}

function isMovementPart(bounds: Box3): boolean {
  const height = bounds.max.y - bounds.min.y;
  const width = bounds.max.x - bounds.min.x;
  const length = bounds.max.z - bounds.min.z;
  return bounds.min.y <= 0.62
    && bounds.max.y >= 0.56
    && height >= MIN_STRUCTURAL_HEIGHT
    && width >= MIN_FOOTPRINT_EDGE
    && length >= MIN_FOOTPRINT_EDGE;
}

function collectMovementCandidates(
  buckets: GeometryBuckets,
): { candidates: MutableFootprint[]; sourceParts: number } {
  const candidates: MutableFootprint[] = [];
  let sourceParts = 0;
  for (const bucket of MOVEMENT_BUCKETS) {
    for (const geometry of buckets[bucket] || []) {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      // Foundations, dock decks and paving remain traversable contact surfaces
      // for tanks. Near-flat ground slabs are owned by terrain instead.
      if (!bounds || !isMovementPart(bounds)) continue;
      sourceParts += 1;
      candidates.push(footprintFromBounds(bounds, true));
    }
  }
  return { candidates, sourceParts };
}

function mergeDuplicateFootprint(
  footprints: readonly MutableFootprint[],
  candidate: MutableFootprint,
): boolean {
  const duplicate = footprints.find((footprint) => {
    const intersection = overlapArea(footprint, candidate);
    return intersection / Math.max(1e-6, Math.min(area(footprint), area(candidate))) > 0.92;
  });
  if (!duplicate) return false;
  duplicate.minY = Math.min(duplicate.minY, candidate.minY);
  duplicate.maxY = Math.max(duplicate.maxY, candidate.maxY);
  return true;
}

function dedupeMovementCandidates(candidates: MutableFootprint[]): MutableFootprint[] {
  candidates.sort((a, b) => area(b) - area(a));
  const footprints: MutableFootprint[] = [];
  for (const candidate of candidates) {
    if (footprints.some((footprint) => contains(footprint, candidate))) continue;
    // Repeated facade layers can differ by a few centimetres. Keep the larger
    // solid and discard the nearly coincident skin, but never bridge real air.
    if (mergeDuplicateFootprint(footprints, candidate)) continue;
    footprints.push(candidate);
  }
  return mergeCollinearFootprints(footprints);
}

function auditMovementCollision(
  buckets: GeometryBuckets,
  dimensions: StructureDimensions,
  structureId: string,
): StructureCollisionAudit {
  const { candidates, sourceParts } = collectMovementCandidates(buckets);
  const footprints = dedupeMovementCandidates(candidates);
  if (structureId && !structureCollisionOpenIds.has(structureId)) {
    const envelope = closedStructureEnvelope(buckets, dimensions);
    if (envelope) return finishAudit('movement', [envelope], dimensions, sourceParts, 1);
  }
  // Pathological decorative structures are bounded without reverting to one
  // giant box: retain the largest pieces, which are always walls/supports.
  return finishAudit(
    'movement', footprints, dimensions, sourceParts, MAX_MOVEMENT_FOOTPRINTS,
  );
}

function isOverheadPart(bounds: Box3): boolean {
  const height = bounds.max.y - bounds.min.y;
  const width = bounds.max.x - bounds.min.x;
  const length = bounds.max.z - bounds.min.z;
  return bounds.min.y > 0.62
    && bounds.max.y >= 0.12
    && height >= 0.075
    && width >= MIN_FOOTPRINT_EDGE
    && length >= MIN_FOOTPRINT_EDGE;
}

function addOverheadFootprint(
  movement: MutableFootprint[],
  overhead: MutableFootprint[],
  candidate: MutableFootprint,
): void {
  const column = movement.find((footprint) => contains(footprint, candidate));
  if (column) {
    column.maxY = Math.max(column.maxY, candidate.maxY);
    return;
  }
  if (overhead.some((footprint) => contains(footprint, candidate))) return;
  if (mergeDuplicateFootprint(overhead, candidate)) return;
  overhead.push(candidate);
}

function collectOverheadFootprints(
  buckets: GeometryBuckets,
  movement: MutableFootprint[],
): { overhead: MutableFootprint[]; sourceParts: number } {
  const overhead: MutableFootprint[] = [];
  let sourceParts = 0;
  for (const bucket of RAY_BUCKETS) {
    for (const geometry of buckets[bucket] || []) {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds || !isOverheadPart(bounds)) continue;
      sourceParts += 1;
      addOverheadFootprint(movement, overhead, footprintFromBounds(bounds));
    }
  }
  return { overhead: mergeCollinearFootprints(overhead), sourceParts };
}

function auditRayCollision(
  buckets: GeometryBuckets,
  dimensions: StructureDimensions,
  structureId: string,
): StructureCollisionAudit {
  // Start with the exact lateral collision volumes. Closed walls therefore
  // remain solid below their roof instead of being replaced by a broad slab.
  const movement = auditMovementCollision(buckets, dimensions, structureId);
  const footprints = movement.footprints.map((footprint) => ({ ...footprint }));
  if (structureId && !STRUCTURE_OVERHEAD_IDS.has(structureId)) {
    if (!structureCollisionOpenIds.has(structureId)) {
      for (const footprint of footprints) {
        footprint.maxY = Math.max(footprint.maxY, dimensions.h);
      }
    }
    return finishAudit(
      'ray', footprints, dimensions, movement.sourceParts, MAX_RAY_FOOTPRINTS,
    );
  }

  const { overhead, sourceParts } = collectOverheadFootprints(buckets, footprints);
  overhead.sort((a, b) => area(b) - area(a));
  return finishAudit(
    'ray',
    [...footprints, ...overhead],
    dimensions,
    movement.sourceParts + sourceParts,
    MAX_RAY_FOOTPRINTS,
  );
}

/**
 * Derive compound collision from the real authored geometry. Movement audits
 * ignore paving and overhead roofs so tanks retain genuine open passages.
 * Ray audits include roofs, gantry beams, glass and high structural parts so
 * shells and spotting rays still contact the visible object at the right Y.
 */
export function auditStructureCollision(
  buckets: GeometryBuckets,
  dimensions: StructureDimensions,
  purpose: StructureCollisionPurpose = 'movement',
  structureId = '',
): StructureCollisionAudit {
  return purpose === 'ray'
    ? auditRayCollision(buckets, dimensions, structureId)
    : auditMovementCollision(buckets, dimensions, structureId);
}

export const structureCollisionLimits = Object.freeze({
  maxMovementFootprints: MAX_MOVEMENT_FOOTPRINTS,
  maxRayFootprints: MAX_RAY_FOOTPRINTS,
});
