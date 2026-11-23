/**
 * One collision record format for every driver (migration-parity, 275; the owner's "one core, two drivers",
 * docs/ARCHITECTURE.md §1.6). The authority, its Worker host and Node collide on the map's shard: the rendered world's
 * records packed by `packCollisionRecord` (0.1 mm numbers, a part's extent dropped within 1 mm of its record's range, a
 * corner within 1 mm of its chord dropped) and read back by `unpackCollisionRecord` (convex and compound centres
 * recomputed). Until 275 a local battle (solo, Watch, replays) and the client's prediction collided on the rendered
 * records as built, up to 0.05 mm off in every number, 1 mm in a part's extent and 13 cm in a centre: a hull's contact
 * there was not the authority's. `canonicalizeCollisionRecords` gives the rendered world the shard's geometry in place,
 * once, as it is laid out (world/map.ts), so every driver reads one geometry and the shard is its encoding: packing a
 * canonical record writes the shard's bytes unchanged.
 *
 * DOM-free and Node-runnable. `packCollisionRecord` imports nothing on purpose: the capture page and the structure-pool
 * tool evaluate its source (tools/capture-world-collision-manifests.mjs collisionCaptureScript).
 */
import { convexOutlineInPlace, type CollisionRecord, type CollisionShape, type SimpleCollisionShape } from './collision.ts';

/**
 * 'o' oriented box (cx, cz, hw, hl, yaw), 'c' circle (cx, cz, r), 'v' convex polygon (x, z pairs). Since 2026-09-19 a
 * part may append its own vertical extent: 'o' and 'c' take two more numbers (y0, y1), a convex polygon with an
 * extent is tagged 'w' (y0, y1, then the x, z pairs). Shards captured before that decode unchanged.
 */
export type PackedSimpleShape =
  | readonly ['o', number, number, number, number, number]
  | readonly ['o', number, number, number, number, number, number, number]
  | readonly ['c', number, number, number]
  | readonly ['c', number, number, number, number, number]
  | readonly ['v', ...number[]]
  | readonly ['w', number, number, ...number[]]
  /** 'p' (2026-10-13): a convex part with a drawn top — y0, y1, the planes' origin ox, oz, their count k, k (a, b, c)
   * triples, then its corners (world/collision.ts collisionPartTopAt). */
  | readonly ['p', number, number, number, number, number, ...number[]];

type PackedShape = PackedSimpleShape | readonly ['m', ...PackedSimpleShape[]];

export interface PackedCollisionRecord {
  b: readonly [number, number, number, number, number, number];
  s?: PackedShape;
  q?: boolean | 0 | 1;
  m?: number | null;
  e?: number | null;
  k?: string | null;
  t?: number | null;
  p?: number | null;
  /** The structure group (docs/DESTRUCTION.md §3.1) and its role (1 setpiece, 2 fixed); absent before 2026-10-07. */
  g?: number | null;
  gr?: number | null;
}

/** Pack one collision record the way the server reads it. Self-contained: its source is evaluated on a page. */
export function packCollisionRecord(record: CollisionRecord): PackedCollisionRecord {
  // (+ 0: never -0, which the shard's JSON writes as 0 and a canonical record would keep; atan2 tells them apart)
  const n = (value: number): number => Math.round(value * 10000) / 10000 + 0;
  const out: PackedCollisionRecord = { b: [
    n(record.min[0]), n(record.min[1]), n(record.min[2]),
    n(record.max[0]), n(record.max[1]), n(record.max[2]),
  ] };
  const shape = record.shape2;
  // per-part vertical extents (2026-09-19) ride as trailing numbers; a ranged polygon is tagged 'w'
  // a part whose extent is the record's own range packs without it, so plain wall bands still dedupe in the
  // primitive dictionary; only roof strips, porches and other parts with their own heights carry numbers
  const packExtent = (value: SimpleCollisionShape): number[] => (value.y0 !== undefined && value.y1 !== undefined
    && (Math.abs(value.y0 - record.min[1]) > 0.001 || Math.abs(value.y1 - record.max[1]) > 0.001)
    ? [n(value.y0), n(value.y1)] : []);
  // (physics, 2026-10-16; convexOutlines on the 226 base: 136 parts on 12 maps — Verdant's and Steppe's hay cocks, the
  // yards' cable drums, Saltwind's dry-stone modules, structure bands) the 0.1 mm rounding can bring a corner within
  // a millimetre of its chord, and the decoder's reading (world/collision.ts convexOutlineInPlace, setConvexShape)
  // drops it: the shard publishes the corners the decoder keeps. The same law, here in full, since this function
  // imports nothing.
  const outline = (values: readonly number[]): number[] => {
    const out = Array.from(values, n), CORNER = 1e-3;
    let m = out.length >> 1;
    if (m < 3) return out;
    let area2 = 0;
    for (let i = 0; i < m; i++) { const j = i + 1 < m ? i + 1 : 0; area2 += out[2 * i] * out[2 * j + 1] - out[2 * j] * out[2 * i + 1]; }
    if (!(Math.abs(area2) > 1e-9)) return out;
    const winding = area2 < 0 ? -1 : 1, count = m;
    m = 0;
    for (let i = 0; i < count; i++) {
      const x = out[2 * i], z = out[2 * i + 1];
      if (m && out[2 * (m - 1)] === x && out[2 * (m - 1) + 1] === z) continue;
      out[2 * m] = x; out[2 * m + 1] = z; m++;
    }
    while (m > 1 && out[0] === out[2 * (m - 1)] && out[1] === out[2 * (m - 1) + 1]) m--;
    for (let dropped = true; dropped && m > 3;) {
      dropped = false;
      for (let i = 0; i < m && m > 3; i++) {
        const a = i > 0 ? i - 1 : m - 1, b = i + 1 < m ? i + 1 : 0;
        const turn = (out[2 * i] - out[2 * a]) * (out[2 * b + 1] - out[2 * i + 1]) - (out[2 * i + 1] - out[2 * a + 1]) * (out[2 * b] - out[2 * i]);
        if (turn * winding > CORNER * Math.hypot(out[2 * b] - out[2 * a], out[2 * b + 1] - out[2 * a + 1])) continue;
        for (let k = i; k < m - 1; k++) { out[2 * k] = out[2 * k + 2]; out[2 * k + 1] = out[2 * k + 3]; }
        m--; i--; dropped = true;
      }
    }
    out.length = 2 * m;
    return out;
  };
  // a convex part with a drawn top (physics stream, 2026-10-13: world/collision.ts collisionPartTopAt) is tagged 'p': its
  // extent, the planes' origin, their count, each plane's three numbers, then its corners
  const packShape = (value: SimpleCollisionShape): PackedSimpleShape => (value.kind === 'convex' && value.tp
    ? ['p', n(value.y0 ?? record.min[1]), n(value.y1 ?? record.max[1]), n(value.tp[0]), n(value.tp[1]), (value.tp.length - 2) / 3,
      ...value.tp.slice(2).map(n), ...outline(value.points)]
    : value.kind === 'obb'
    ? ['o', n(value.cx), n(value.cz), n(value.hw), n(value.hl), n(value.yaw), ...packExtent(value)]
    : value.kind === 'circle'
      ? ['c', n(value.cx), n(value.cz), n(value.r), ...packExtent(value)]
      : packExtent(value).length
        ? ['w', ...packExtent(value), ...outline(value.points)]
        : ['v', ...outline(value.points)]) as PackedSimpleShape;
  if (shape?.kind === 'compound') out.s = ['m', ...shape.parts.map(packShape)];
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
  return out;
}

/** Read one packed record back into a collision record, as every shard world does. */
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

type ShapeFields = Record<string, unknown>;

/** `target` takes `source`'s fields in place: keys `source` lacks deleted, number lists rewritten in their own arrays. */
function adoptShape(target: CollisionShape, source: CollisionShape): void {
  const into = target as unknown as ShapeFields;
  const from = source as unknown as ShapeFields;
  for (const key of Object.keys(into)) if (key !== 'parts' && !(key in from)) delete into[key];
  for (const key of Object.keys(from)) {
    if (key === 'parts') continue;
    const value = from[key];
    if (Array.isArray(value)) {
      const list = Array.isArray(into[key]) ? into[key] as number[] : (into[key] = []) as number[];
      list.length = value.length;
      for (let i = 0; i < value.length; i++) list[i] = value[i] as number;
    } else into[key] = value;
  }
  if (target.kind === 'compound' && source.kind === 'compound') {
    for (let i = 0; i < source.parts.length; i++) adoptShape(target.parts[i]!, source.parts[i]!);
  }
}

/**
 * Every record in `lists` takes the geometry its shard holds, in place (the record, its shape and its parts stay the
 * objects the world's meshes, crush links and structures hold; flags and links are kept): bounds, shape and crush
 * policy become `unpackCollisionRecord(packCollisionRecord(record))`'s. A record listed twice (a tree trunk is an
 * obstacle and a collider) is read once. Idempotent.
 */
export function canonicalizeCollisionRecords(...lists: readonly (readonly CollisionRecord[])[]): void {
  const done = new Set<CollisionRecord>();
  for (const list of lists) {
    for (const record of list) {
      if (done.has(record)) continue;
      done.add(record);
      const canonical = unpackCollisionRecord(packCollisionRecord(record));
      for (let i = 0; i < 3; i++) { record.min[i] = canonical.min[i]!; record.max[i] = canonical.max[i]!; }
      const shape = record.shape2, next = canonical.shape2;
      if (shape && next && shape.kind === next.kind
        && (shape.kind !== 'compound' || (next.kind === 'compound' && shape.parts.length === next.parts.length))) {
        adoptShape(shape, next);
      } else if (next) record.shape2 = next;
      else delete record.shape2;
      if (canonical.crushMin !== undefined) record.crushMin = canonical.crushMin;
      if (canonical.crushKeep !== undefined) record.crushKeep = canonical.crushKeep;
    }
  }
}
