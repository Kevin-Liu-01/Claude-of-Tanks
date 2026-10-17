// src/world/maps/coalStockpile.ts — the rail yards' and the coal stages' stockpiles (props census #3, lane B 2026-10-14;
// extracted from mapKits.ts as they were, then rebuilt here): the faceted heap, its clear-site law, its convex record
// and its crushable pile.
import type { CollisionRecord } from '../collision.ts';
// (the looks lane's r2 sub-stream, 2026-10-16) the heap, its record and its pile live in coalBays.ts
export { makeCoalStockpile, registerCoalStockpile } from './coalBays.ts';

/** The ground a heap reads (mapKits.ts DressingHeightField's members it uses). */
export interface CoalGround {
  getHeightAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
}

export function coalSiteIsClear(
  field: CoalGround, x: number, z: number, radius: number,
  obstacles: readonly CollisionRecord[],
): boolean {
  let low = Infinity, high = -Infinity;
  for (let iz = -2; iz <= 2; iz++) for (let ix = -2; ix <= 2; ix++) {
    const px = x + ix * radius / 2, pz = z + iz * radius / 2;
    if (field._roadDist(px, pz) < 7 || field.getWaterMaskAt?.(px, pz) > 0.01) return false;
    const y = field.getHeightAt(px, pz);
    if (!Number.isFinite(y)) return false;
    low = Math.min(low, y); high = Math.max(high, y);
  }
  if (high - low > 0.4) return false;
  return !obstacles.some(record => record.min[0] < x + radius + 0.5
    && record.max[0] > x - radius - 0.5 && record.min[2] < z + radius + 0.5
    && record.max[2] > z - radius - 0.5);
}
