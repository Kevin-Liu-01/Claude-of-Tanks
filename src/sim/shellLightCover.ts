/**
 * shellLightCover.ts — a round breaks the light cover it flies through (destruction stream, 2026-10-12; the owner: "make
 * sure all props below a certain size are destructible whether from ramming or shooting"; MASTER item 17: "any round that
 * hits a car breaks it").
 *
 * The world's raycast meets the shell records (`colliders`): buildings, walls, rocks, trucks, sandbags, trees. The small
 * props a hull crushes — fences, crates, carts, benches, troughs, tents, stalls, stooks and stacks, the parked cars — are
 * movement records only, so a round flew straight through them and left them standing (an HE burst felled them only
 * within its contact reach). This sweeps a round's flight against those records: every crushable record a round passes
 * through (`shellPassesThroughCollisionRecord`: not the dense cover — masonry, adobe, sandbags, stones — which stops it)
 * that its segment crosses before what stops it is broken by it, nearest first, and the round flies on, as a felled tree
 * or a shot truck already does. Shared by the solo step and the network authority, so both break the same props in the
 * same order (the destroyed list and its events stay one law). Node-runnable, allocation-free per call.
 */
import { rayCollisionRecord, shellPassesThroughCollisionRecord, type CollisionRecord } from '../world/collision.ts';

export type LightCoverQuery = (minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]) => CollisionRecord[];

/** Records a round's segment may break in one fixed step (a volley through a fence line stays bounded). */
export const LIGHT_COVER_PER_SEGMENT = 8;

const _normal = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; } };
const _hits: Array<{ record: CollisionRecord | null; dist: number }> = Array.from({ length: LIGHT_COVER_PER_SEGMENT }, () => ({ record: null, dist: 0 }));

/**
 * The light cover a round's segment from `origin` along the unit `dir` crosses within `maxDistance`, nearest first (ties
 * by the records' order in the query), at most LIGHT_COVER_PER_SEGMENT: calls `visit(record, distance)` for each and
 * returns how many. Records already crushed or dead, structures, trees (they have shell records of their own) and dense
 * cover are skipped. `scratch` is the caller's query array.
 */
export function sweepLightCover(
  query: LightCoverQuery | null | undefined,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  maxDistance: number,
  scratch: CollisionRecord[],
  visit: (record: CollisionRecord, distance: number) => void,
): number {
  if (!query || !(maxDistance > 0)) return 0;
  const ex = origin.x + dir.x * maxDistance, ez = origin.z + dir.z * maxDistance;
  const records = query(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez), scratch);
  let n = 0;
  for (const record of records) {
    if (record.crushed || record.dead || record.structureIdx !== undefined || record.treeIdx != null) continue;
    if (!shellPassesThroughCollisionRecord(record)) continue;
    const dist = rayCollisionRecord(origin, dir, record, maxDistance, _normal);
    if (!(dist >= 0) || dist > maxDistance) continue;
    // insertion by distance into the bounded list (the farthest falls off the end)
    let at = n;
    while (at > 0 && _hits[at - 1]!.dist > dist) at--;
    if (at >= LIGHT_COVER_PER_SEGMENT) continue;
    const last = Math.min(n, LIGHT_COVER_PER_SEGMENT - 1);
    for (let k = last; k > at; k--) { _hits[k]!.record = _hits[k - 1]!.record; _hits[k]!.dist = _hits[k - 1]!.dist; }
    _hits[at]!.record = record; _hits[at]!.dist = dist;
    if (n < LIGHT_COVER_PER_SEGMENT) n++;
  }
  for (let k = 0; k < n; k++) {
    const hit = _hits[k]!;
    const record = hit.record!;
    hit.record = null;
    // one prop group can hold several records: the first one met breaks it (its siblings go with it)
    if (record.crushed) continue;
    visit(record, hit.dist);
  }
  scratch.length = 0;
  return n;
}
