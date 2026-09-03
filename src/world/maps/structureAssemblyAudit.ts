import * as THREE from 'three';
import type { GeometryBuckets } from './exteriorDetailKit.ts';

export interface StructureAssemblyAudit {
  readonly parts: number;
  readonly groundedParts: number;
  readonly unsupportedParts: number;
  readonly maxConnectionGapM: number;
}

const CONTACT_EPSILON_M = 0.09;
const GROUND_EPSILON_M = 0.14;

function axisGap(a0: number, a1: number, b0: number, b1: number): number {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}

function boundsGap(a: THREE.Box3, b: THREE.Box3): number {
  return Math.hypot(
    axisGap(a.min.x, a.max.x, b.min.x, b.max.x),
    axisGap(a.min.y, a.max.y, b.min.y, b.max.y),
    axisGap(a.min.z, a.max.z, b.min.z, b.max.z),
  );
}

/**
 * Verify that every authored wall, roof and small fixture reaches terrain
 * through a chain of physical contacts. This intentionally runs before bucket
 * merging, while a floating roof panel or disconnected sign is still visible
 * as an individual part.
 */
export function auditStructureAssembly(buckets: GeometryBuckets): StructureAssemblyAudit {
  const bounds: THREE.Box3[] = [];
  for (const value of Object.values(buckets)) {
    if (!Array.isArray(value)) continue;
    for (const geometry of value) {
      geometry.computeBoundingBox();
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) continue;
      bounds.push(geometry.boundingBox.clone());
    }
  }
  const supported = new Uint8Array(bounds.length);
  const queue: number[] = [];
  for (let index = 0; index < bounds.length; index += 1) {
    if (bounds[index].min.y <= GROUND_EPSILON_M) {
      supported[index] = 1;
      queue.push(index);
    }
  }
  let cursor = 0;
  let maxConnectionGapM = 0;
  while (cursor < queue.length) {
    const sourceIndex = queue[cursor++];
    for (let index = 0; index < bounds.length; index += 1) {
      if (supported[index]) continue;
      const gap = boundsGap(bounds[sourceIndex], bounds[index]);
      if (gap > CONTACT_EPSILON_M) continue;
      maxConnectionGapM = Math.max(maxConnectionGapM, gap);
      supported[index] = 1;
      queue.push(index);
    }
  }
  const groundedParts = supported.reduce((sum, item) => sum + item, 0);
  return Object.freeze({
    parts: bounds.length,
    groundedParts,
    unsupportedParts: bounds.length - groundedParts,
    maxConnectionGapM: Number(maxConnectionGapM.toFixed(4)),
  });
}

export const structureAssemblyLimits = Object.freeze({
  contactEpsilonM: CONTACT_EPSILON_M,
  groundEpsilonM: GROUND_EPSILON_M,
});
