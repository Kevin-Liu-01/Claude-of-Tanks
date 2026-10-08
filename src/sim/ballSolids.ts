import { collisionFootprintContainsPoint, shellPassesThroughCollisionRecord, type CollisionRecord } from '../world/collision.ts';

/**
 * Turbo Ball's ball meets the world's solids (modes lane, 2026-10-08): what stops a shell stops the ball — buildings,
 * rock, masonry and sandbag walls, standing and not crushed — while light cover a shell passes (fences, crops, wood
 * piles, trees) lets the ball through as before. Before this the ball flew through houses and came to rest inside
 * them, out of every hull's reach (Turbo Ball on Urban: five touches in ten minutes).
 *
 * Both hosts (the authority on the dedicated collision world, the solo sim on its live world) pass their own obstacle
 * query, so the ball meets the same records the shells do on each.
 */
type BallObstacleQuery = (minX: number, minZ: number, maxX: number, maxZ: number) => readonly CollisionRecord[];

/** True when a ball of `radius` centred at (x, y, z) overlaps a standing solid. */
export function ballSolidAt(query: BallObstacleQuery, x: number, y: number, z: number, radius: number): boolean {
  const near = query(x - radius, z - radius, x + radius, z + radius);
  for (const record of near) {
    const yields: boolean = shellPassesThroughCollisionRecord(record);
    if (record.crushed || record.dead || yields) continue;
    if (record.max[1] < y - radius || record.min[1] > y + radius) continue;
    if (collisionFootprintContainsPoint(record, x, z, radius)) return true;
  }
  return false;
}
