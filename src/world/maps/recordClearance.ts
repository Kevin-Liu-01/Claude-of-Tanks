// src/world/maps/recordClearance.ts — "does this footprint clear every record placed so far?" for the street kits
// (sarajevoStreets.ts, shanghaiStreets.ts), from a grid of the records instead of a walk over all of them (2026-10-13,
// the perf stream: Ruinspires' cemeteries asked it of every record for every grave, 8.6 million record tests and
// 0.55 s of a Node build). The answer is the walk's: the same test (a live record whose box overlaps the footprint's
// padded box, strictly) over the records filed in every 16 m cell the footprint's box touches. A record overlapping
// the box shares a point with it, and that point's cell is filed under both, so no overlapping record is missed; the
// walk's `some` has no side effects, so the order it meets them in does not matter. A record whose bounds are not
// finite, or span more cells than a battlefield holds, is tested on every query; a footprint of that kind walks them all.
// (the Miljacka valley round, 2026-10-06; landed 2026-10-17) `shapes`: past the boxes' overlap, the footprint's own points
// against each record's shape (sarajevoStreets.ts asks it: on an avenue off the axes a turned box met every row front).
import { collisionFootprintContainsPoint, type CollisionRecord } from '../collision.ts';

const CELL_M = 16;
const MAX_CELLS = 4096;

export interface RecordClearance {
  /** Does a footprint (x, z centre, half extents along / across a heading, plus a pad) clear every record held? */
  clears(cx: number, cz: number, hl: number, hw: number, tx: number, tz: number, pad: number): boolean;
  /** Hold one more record (a piece the kit just placed). */
  add(record: CollisionRecord): void;
}

export interface RecordClearanceOptions {
  /** After the boxes' overlap, the footprint's own points (every metre along and across, the pad grown) against each
   * record's footprint shape: a record whose box meets the footprint's box but whose shape keeps off every point clears.
   * Off by default (the box test alone). */
  shapes?: boolean;
}

export function createRecordClearance(records: readonly CollisionRecord[], opts: RecordClearanceOptions = {}): RecordClearance {
  const cells = new Map<number, CollisionRecord[]>();
  const loose: CollisionRecord[] = [];
  const all: CollisionRecord[] = [];
  const key = (x: number, z: number): number => (x + 32768) * 65536 + (z + 32768);
  const blocks = (r: CollisionRecord, cx: number, cz: number, ex: number, ez: number): boolean =>
    !r.dead && r.max[0] > cx - ex && r.min[0] < cx + ex && r.max[2] > cz - ez && r.min[2] < cz + ez;
  function add(r: CollisionRecord): void {
    all.push(r);
    const x0 = Math.floor(r.min[0] / CELL_M), x1 = Math.floor(r.max[0] / CELL_M);
    const z0 = Math.floor(r.min[2] / CELL_M), z1 = Math.floor(r.max[2] / CELL_M);
    if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(z0) || !Number.isFinite(z1)
      || x1 < x0 || z1 < z0 || (x1 - x0 + 1) * (z1 - z0 + 1) > MAX_CELLS
      || Math.abs(x0) > 32000 || Math.abs(x1) > 32000 || Math.abs(z0) > 32000 || Math.abs(z1) > 32000) {
      loose.push(r);
      return;
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = key(x, z);
      const list = cells.get(k);
      if (list) list.push(r); else cells.set(k, [r]);
    }
  }
  for (const record of records) add(record);
  return {
    add,
    clears(cx, cz, hl, hw, tx, tz, pad) {
      const ex = Math.abs(tx) * hl + Math.abs(tz) * hw + pad, ez = Math.abs(tz) * hl + Math.abs(tx) * hw + pad;
      const x0 = Math.floor((cx - ex) / CELL_M), x1 = Math.floor((cx + ex) / CELL_M);
      const z0 = Math.floor((cz - ez) / CELL_M), z1 = Math.floor((cz + ez) / CELL_M);
      const nx = -tz, nz = tx, na = Math.max(1, Math.ceil(2 * hl)), nb = Math.max(1, Math.ceil(2 * hw));
      const meets = (r: CollisionRecord): boolean => {
        if (!blocks(r, cx, cz, ex, ez)) return false;
        if (!opts.shapes) return true;
        for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
          const a = -hl + (2 * hl * i) / na, b = -hw + (2 * hw * j) / nb;
          if (collisionFootprintContainsPoint(r, cx + tx * a + nx * b, cz + tz * a + nz * b, pad)) return true;
        }
        return false;
      };
      if (!((x1 - x0 + 1) * (z1 - z0 + 1) <= MAX_CELLS)) return !all.some(meets);
      for (const r of loose) if (meets(r)) return false;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const list = cells.get(key(x, z));
        if (!list) continue;
        for (const r of list) if (meets(r)) return false;
      }
      return true;
    },
  };
}
