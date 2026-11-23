/**
 * One packer for the world's collision records, on every driver (276, sim-world-packed; Main's ruling (B), 2026-11-22).
 * The dedicated server and every Node replay collide on the shards (server/world-collision-manifests): the page's records
 * packed here, to 1/10000 m, then unpacked. A solo battle collided on the page's own records at full precision, so a
 * five-minute Verdant battle verified in Node on the shard drifted at step 1200, and held to its last step on the
 * full-precision world. Now the page rounds its own records the same way, in place, right after building them
 * (quantizeWorldCollision): its geometry is what the shard decodes to, while every reference, index and runtime flag
 * the page keeps on a record stays where it was. No shard is fetched and nothing is added to the page's download.
 */
import { convexOutlineInPlace } from './collision.ts';
import type { CollisionRecord } from './collision.ts';
import type { PackedCollisionRecord, PackedSimpleShape } from './headlessCollisionWorld.ts';

/** What the packer reads of a record (a built record, or one a receipt writes). */
interface PackableShape {
  kind: string; cx?: number; cz?: number; hw?: number; hl?: number; yaw?: number; r?: number;
  y0?: number; y1?: number; points?: ArrayLike<number>; tp?: ArrayLike<number>; parts?: PackableShape[];
}
interface PackableRecord {
  min: ArrayLike<number>; max: ArrayLike<number>; shape2?: PackableShape | null; crushable?: boolean;
  crushMin?: number | null; crushKeep?: number | null; kind?: string | null; treeIdx?: number | null; propIdx?: number | null;
  structureIdx?: number | null; structureRole?: string | null;
}

/**
 * Pack one collision record the way the server reads it. Self-contained on purpose: the capture page evaluates this
 * exact function's source (tools/capture-world-collision-manifests.mjs collisionCaptureScript), so the browser capture,
 * the Node build and the page's own rounding share one packer. It imports and closes over nothing.
 */
export function packCollisionRecord(record: PackableRecord): PackedCollisionRecord {
  const n = (value: number): number => Math.round(value * 10000) / 10000;
  const out: Record<string, unknown> = { b: [
    n(record.min[0]), n(record.min[1]), n(record.min[2]),
    n(record.max[0]), n(record.max[1]), n(record.max[2]),
  ] };
  const shape = record.shape2;
  // per-part vertical extents (2026-09-19) ride as trailing numbers; a ranged polygon is tagged 'w'
  // a part whose extent is the record's own range packs without it, so plain wall bands still dedupe in the
  // primitive dictionary; only roof strips, porches and other parts with their own heights carry numbers
  const packExtent = (value: PackableShape): number[] => (value.y0 !== undefined && value.y1 !== undefined
    && (Math.abs(value.y0 - record.min[1]) > 0.001 || Math.abs(value.y1 - record.max[1]) > 0.001)
    ? [n(value.y0), n(value.y1)] : []);
  // (physics, 2026-10-16; convexOutlines on the 226 base: 136 parts on 12 maps — Verdant's and Steppe's hay cocks, the
  // yards' cable drums, Saltwind's dry-stone modules, structure bands) the 0.1 mm rounding can bring a corner within
  // a millimetre of its chord, and the decoder's reading (world/collision.ts convexOutlineInPlace, setConvexShape)
  // drops it: the shard publishes the corners the decoder keeps. The same law, here in full: the capture page
  // evaluates this function's source (collisionCaptureScript) and it imports nothing.
  const outline = (values: ArrayLike<number>): number[] => {
    const out = Array.from(values, n), CORNER = 1e-3;
    let m = out.length >> 1;
    if (m < 3) return out;
    let area2 = 0;
    for (let i = 0; i < m; i++) { const j = i + 1 < m ? i + 1 : 0; area2 += out[2 * i]! * out[2 * j + 1]! - out[2 * j]! * out[2 * i + 1]!; }
    if (!(Math.abs(area2) > 1e-9)) return out;
    const winding = area2 < 0 ? -1 : 1, count = m;
    m = 0;
    for (let i = 0; i < count; i++) {
      const x = out[2 * i]!, z = out[2 * i + 1]!;
      if (m && out[2 * (m - 1)] === x && out[2 * (m - 1) + 1] === z) continue;
      out[2 * m] = x; out[2 * m + 1] = z; m++;
    }
    while (m > 1 && out[0] === out[2 * (m - 1)] && out[1] === out[2 * (m - 1) + 1]) m--;
    for (let dropped = true; dropped && m > 3;) {
      dropped = false;
      for (let i = 0; i < m && m > 3; i++) {
        const a = i > 0 ? i - 1 : m - 1, b = i + 1 < m ? i + 1 : 0;
        const turn = (out[2 * i]! - out[2 * a]!) * (out[2 * b + 1]! - out[2 * i + 1]!) - (out[2 * i + 1]! - out[2 * a + 1]!) * (out[2 * b]! - out[2 * i]!);
        // the chord's length as sqrt of the sum of squares (correctly rounded on every engine; Math.hypot is not one
        // function, src/sim/detMath.ts): no record on any of the 33 maps packs differently for it (276)
        const cx = out[2 * b]! - out[2 * a]!, cz = out[2 * b + 1]! - out[2 * a + 1]!;
        if (turn * winding > CORNER * Math.sqrt(cx * cx + cz * cz)) continue;
        for (let k = i; k < m - 1; k++) { out[2 * k] = out[2 * k + 2]!; out[2 * k + 1] = out[2 * k + 3]!; }
        m--; i--; dropped = true;
      }
    }
    out.length = 2 * m;
    return out;
  };
  // a convex part with a drawn top (physics stream, 2026-10-13: world/collision.ts collisionPartTopAt) is tagged 'p': its
  // extent, the planes' origin, their count, each plane's three numbers, then its corners
  const packShape = (value: PackableShape): unknown[] => value.kind === 'convex' && value.tp
    ? ['p', n(value.y0 ?? record.min[1]), n(value.y1 ?? record.max[1]), n(value.tp[0]!), n(value.tp[1]!), (value.tp.length - 2) / 3,
      ...Array.from(value.tp).slice(2).map(n), ...outline(value.points!)]
    : value.kind === 'obb'
    ? ['o', n(value.cx!), n(value.cz!), n(value.hw!), n(value.hl!), n(value.yaw!), ...packExtent(value)]
    : value.kind === 'circle'
      ? ['c', n(value.cx!), n(value.cz!), n(value.r!), ...packExtent(value)]
      : packExtent(value).length
        ? ['w', ...packExtent(value), ...outline(value.points!)]
        : ['v', ...outline(value.points!)];
  if (shape?.kind === 'compound') out.s = ['m', ...shape.parts!.map(packShape)];
  else if (shape) out.s = packShape(shape);
  if (record.crushable) out.q = 1;
  // Tree contact policy is a shared runtime invariant; avoid repeating
  // its two constant values thousands of times in the server manifest.
  if (record.treeIdx == null && record.crushMin != null) out.m = n(record.crushMin);
  if (record.treeIdx == null && record.crushKeep != null) out.e = n(record.crushKeep);
  if (record.kind != null) out.k = record.kind;
  if (record.treeIdx != null) out.t = record.treeIdx;
  if (record.propIdx != null) out.p = record.propIdx;
  // destruction (docs/DESTRUCTION.md §3.1): the structure group and, for a set piece, its role (1 setpiece, 2 fixed)
  if (record.structureIdx != null) out.g = record.structureIdx;
  if (record.structureRole === 'setpiece') out.gr = 1;
  else if (record.structureRole === 'fixed') out.gr = 2;
  return out as unknown as PackedCollisionRecord;
}

/** One shard record as the server inflates it: its geometry, crush law, kind and indices (no runtime state). */
export function unpackCollisionRecord(packed: PackedCollisionRecord): CollisionRecord {
  const bounds = packed.b;
  const record: CollisionRecord = {
    min: [bounds[0], bounds[1], bounds[2]],
    max: [bounds[3], bounds[4], bounds[5]],
  };
  const shape = packed.s;
  const unpackSimpleShape = (value: PackedSimpleShape) => {
    if (value[0] === 'o') return {
      kind: 'obb' as const, cx: value[1], cz: value[2], hw: value[3], hl: value[4], yaw: value[5],
      ...(value.length >= 8 ? { y0: value[6] as number, y1: value[7] as number } : {}),
    };
    if (value[0] === 'c') return {
      kind: 'circle' as const, cx: value[1], cz: value[2], r: value[3],
      ...(value.length >= 6 ? { y0: value[4] as number, y1: value[5] as number } : {}),
    };
    if (value[0] === 'p') {
      const k = value[5] as number;
      const tp = [value[3] as number, value[4] as number, ...(value.slice(6, 6 + 3 * k) as number[])];
      const points = convexOutlineInPlace(value.slice(6 + 3 * k) as number[]);
      let px = 0, pz = 0;
      for (let index = 0; index < points.length; index += 2) { px += points[index]; pz += points[index + 1]; }
      const pn = Math.max(1, points.length / 2);
      return { kind: 'convex' as const, cx: px / pn, cz: pz / pn, points, y0: value[1] as number, y1: value[2] as number, tp };
    }
    const ranged = value[0] === 'w';
    const extent = ranged ? { y0: value[1] as number, y1: value[2] as number } : {};
    // (the hitbox lane, 2026-10-08) a part's quantised corners convex in fact, as every builder's are (collision.ts)
    const points = convexOutlineInPlace(value.slice(ranged ? 3 : 1) as number[]);
    let cx = 0;
    let cz = 0;
    for (let index = 0; index < points.length; index += 2) {
      cx += points[index];
      cz += points[index + 1];
    }
    const count = Math.max(1, points.length / 2);
    return { kind: 'convex' as const, cx: cx / count, cz: cz / count, points, ...extent };
  };
  if (shape?.[0] === 'm') {
    const parts = shape.slice(1).map((part) => unpackSimpleShape(part as PackedSimpleShape));
    record.shape2 = {
      kind: 'compound',
      cx: (bounds[0] + bounds[3]) * 0.5,
      cz: (bounds[2] + bounds[5]) * 0.5,
      parts,
    };
  } else if (shape) {
    record.shape2 = unpackSimpleShape(shape);
  }
  if (packed.q) record.crushable = true;
  if (packed.m != null) record.crushMin = packed.m;
  if (packed.e != null) record.crushKeep = packed.e;
  if (packed.k != null) record.kind = packed.k;
  if (record.kind === 'tree') {
    record.crushMin = 0;
    record.crushKeep = 1;
  }
  if (packed.t != null) record.treeIdx = packed.t;
  if (packed.p != null) record.propIdx = packed.p;
  if (packed.g != null) record.structureIdx = packed.g;
  if (packed.gr === 1) record.structureRole = 'setpiece';
  else if (packed.gr === 2) record.structureRole = 'fixed';
  return record;
}

/** A concealment disc's numbers as the shard packs them (x, z, radius, add). */
interface ConcealerNumbers { x: number; z: number; r: number; add: number }

/**
 * The page's world collision rounded as the shards are, in place: each record's bounds, shape and crush law become what
 * unpackCollisionRecord gives for its packed form (the same objects, so every grid, index, mesh link and runtime flag
 * built on them holds), and each concealer's numbers the packed ones. A record listed twice (a tree is an obstacle and
 * a collider) is rounded once. Run once, right after the records are built and before anything reads them.
 */
export function quantizeWorldCollision(obstacles: readonly CollisionRecord[], colliders: readonly CollisionRecord[],
  concealers: readonly ConcealerNumbers[] = []): void {
  const n = (value: number): number => Math.round(value * 10000) / 10000;
  const seen = new Set<CollisionRecord>();
  for (const record of [...obstacles, ...colliders]) {
    if (seen.has(record)) continue;
    seen.add(record);
    const shard = unpackCollisionRecord(packCollisionRecord(record as PackableRecord));
    record.min = shard.min;
    record.max = shard.max;
    if (shard.shape2) record.shape2 = shard.shape2;
    else delete record.shape2;
    if (shard.crushMin != null) record.crushMin = shard.crushMin;
    if (shard.crushKeep != null) record.crushKeep = shard.crushKeep;
  }
  for (const disc of concealers) { disc.x = n(disc.x); disc.z = n(disc.z); disc.r = n(disc.r); disc.add = n(disc.add); }
}
