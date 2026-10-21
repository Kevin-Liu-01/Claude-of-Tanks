import type { RuntimeValue } from '../src/runtimeTypes.ts';
import type {
  CollisionManifest, PackedCollisionRecord, PackedSimpleShape,
} from '../src/world/headlessCollisionWorld.ts';
import {
  COLLISION_COMPOUND_MAX_PARTS, isPackedCollisionMetadata, isSimpleShape, readCollisionConcealers, readCollisionCraters, readCollisionManifest,
} from './collisionManifestFormat.ts';

const LEGACY_ENCODING = 'primitive-dict-v1';
const KIND_ENCODING = 'primitive-kind-dict-v2';
/**
 * (physics stream, 2026-10-14: the shards' storage budget) v2 with every primitive's numbers and every record's bounds
 * as integers of 1/10000 m, a primitive's corners each the step from the one before: exact, since every packed number has
 * at most four decimals (the integer over 10000 is the double the decimal parses to), and any primitive or bounds that
 * would not decode bit for bit stays as v2 wrote it. Compact primitives carry their kind in capitals ('V', 'W', 'P',
 * 'C', 'O'), compact bounds the key 'B'.
 */
const COMPACT_ENCODING = 'primitive-kind-dict-v3';
/**
 * (the perf lane, 2026-10-16: the shards' storage budget, integ/226 at 73.5 MB over the 68.7 MB budget) v3, plus two
 * exact steps:
 * - a record's bounds as 'D': the steps, in the same integers of 1/10000 m, from its shape's own reference box (the
 *   parts' corners, circle extents, box centres and vertical extents: boundsReference) — a few digits where v3 wrote
 *   seven a number; a record whose shape or bounds are not all exact integers keeps 'B' (or v2's 'b');
 * - a concealer standing on a tree's circle centre (its x and z exactly a tree record's: the forest's) as
 *   [the tree's index, radius, add] in place of [x, z, radius, add].
 * Decoding gives every record, key order, number (Object.is) and concealer back as v3 had them.
 */
const REFERENCED_ENCODING = 'primitive-kind-dict-v4';
/**
 * (the maps lane, 2026-10-20: the shards' storage budget, integ/229 at 69.0 MB over the 68.66 MB budget) v4, plus five
 * exact steps:
 * - the primitive dictionary in order of use, the most used first (the shortest references);
 * - a record as an array: the index of its key order in the 'keys' table, then its values in that order (the bounds' key
 *   names their encoding: 'D' v4's steps, 'B' v3's integers, 'b' as packed), so no record spells its keys;
 * - steps 'D' that are all zero as 0;
 * - an inline compact part's position (a 'V' or 'W' part's first corner, a 'P' part's planes' origin and first corner, a
 *   'C' or 'O' part's centre) as the step from the position before it in the same list, and its vertical extent (y0, y1)
 *   as the step from the extent before it, then the span y1 - y0: a building's walls share their footing and stand a few
 *   metres apart, so seven-digit coordinates become two- or three-digit steps;
 * - a collider that is an obstacle's record exactly (every key, number and part) as that obstacle's index.
 * Decoding gives every record, key order, number (Object.is) and concealer back as v4 had them. A dictionary primitive is
 * written as v4 writes it (it stands for itself, not in a chain), and so is any part v4 leaves inexact.
 */
const ENCODING = 'primitive-kind-dict-v5';
const MAX_PRIMITIVES = 131_072;
const MAX_KINDS = 1024;
const MAX_KEY_ORDERS = 4096;
type CollisionManifestEncoding = typeof LEGACY_ENCODING | typeof KIND_ENCODING | typeof COMPACT_ENCODING
  | typeof REFERENCED_ENCODING | typeof ENCODING;
type Shape = NonNullable<PackedCollisionRecord['s']>;
type CompactSimple = readonly [string, ...number[]];
type EncodedSimple = PackedSimpleShape | CompactSimple | number;
type EncodedShape = EncodedSimple | readonly ['m', ...EncodedSimple[]];
type EncodedRecord = Omit<PackedCollisionRecord, 's' | 'k' | 'b'> & {
  s?: EncodedShape;
  k?: PackedCollisionRecord['k'] | number;
  b?: PackedCollisionRecord['b'];
  B?: readonly number[];
  D?: readonly number[];
};
type Concealer = NonNullable<CollisionManifest['concealers']>[number];
type EncodedConcealer = Concealer | readonly [number, number, number];
/** v5: [key order, ...values]; a collider may instead be an obstacle's index. */
type PositionalRecord = readonly [number, ...RuntimeValue[]];

interface EncodedManifest {
  encoding: CollisionManifestEncoding;
  shapes: PackedSimpleShape[];
  kinds?: string[];
  keys?: string[][];
  obstacles: EncodedRecord[] | PositionalRecord[];
  colliders: EncodedRecord[] | (PositionalRecord | number)[];
  concealers?: CollisionManifest['concealers'] | EncodedConcealer[];
  craters?: CollisionManifest['craters'];
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SCALE = 10_000;
const COMPACT_KIND: Readonly<Record<string, string>> = { v: 'V', w: 'W', p: 'P', c: 'C', o: 'O' };
const PACKED_KIND: Readonly<Record<string, string>> = { V: 'v', W: 'w', P: 'p', C: 'c', O: 'o' };

/** The integer of 1/10000 m that decodes to `value` bit for bit, or null (never -0). */
function scaled(value: number): number | null {
  const n = Math.round(value * SCALE) + 0;
  return Number.isSafeInteger(n) && n / SCALE === value ? n : null;
}

/** Where a primitive's corner pairs start among its numbers (c and o have none). */
function cornersFrom(kind: string, numbers: readonly RuntimeValue[]): number {
  if (kind === 'v') return 0;
  if (kind === 'w') return 2;
  if (kind === 'p') return 5 + 3 * (numbers[4] as number);
  return numbers.length;
}

/** v3: a primitive's numbers as integers, its corners as steps (the plane count of a 'p' as it is); as v2 if inexact. */
function compactSimple(shape: PackedSimpleShape): PackedSimpleShape | CompactSimple {
  const tag = COMPACT_KIND[shape[0]];
  if (!tag) return shape;
  const numbers = shape.slice(1) as number[];
  const from = cornersFrom(shape[0], numbers);
  const out: [string, ...number[]] = [tag];
  let x = 0, z = 0;
  for (let i = 0; i < numbers.length; i++) {
    if (shape[0] === 'p' && i === 4) { out.push(numbers[4]); continue; }
    const n = scaled(numbers[i]);
    if (n === null) return shape;
    if (i < from) out.push(n);
    else if ((i - from) % 2 === 0) { out.push(n - x); x = n; } else { out.push(n - z); z = n; }
  }
  return out;
}

/** A compact primitive back in packed numbers; with `box`, its v4 reference box in integers ([x0, z0, x1, z1, y0, y1],
 *  y NaN when it has none: partBoxInto's reading, from the integers themselves). */
function expandSimple(value: readonly RuntimeValue[], box?: Float64Array): RuntimeValue {
  const kind = PACKED_KIND[value[0] as string];
  const count = value.length - 1;
  for (let i = 1; i <= count; i++) {
    if (!Number.isSafeInteger(value[i])) throw new TypeError('collision primitive shape is invalid');
  }
  const from = kind === 'v' ? 0 : kind === 'w' ? 2 : kind === 'p' ? 5 + 3 * (value[5] as number) : count;
  const out: (string | number)[] = [kind];
  let x = 0, z = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < count; i++) {
    const n = value[i + 1] as number;
    if (kind === 'p' && i === 4) out.push(n);
    else if (i < from) out.push(n / SCALE);
    else if ((i - from) % 2 === 0) {
      x += n; out.push(x / SCALE);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
    } else {
      z += n; out.push(z / SCALE);
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  if (box) {
    box[4] = NaN; box[5] = NaN;
    if (kind === 'c' || kind === 'o') {
      const cx = value[1] as number, cz = value[2] as number, reach = kind === 'c' ? value[3] as number : 0;
      box[0] = cx - reach; box[2] = cx + reach; box[1] = cz - reach; box[3] = cz + reach;
      const extent = kind === 'c' ? 3 : 5;
      if (count === extent + 2) { box[4] = value[extent + 1] as number; box[5] = value[extent + 2] as number; }
    } else {
      if (kind === 'w' || kind === 'p') { box[4] = value[1] as number; box[5] = value[2] as number; }
      box[0] = x0; box[1] = z0; box[2] = x1; box[3] = z1;
    }
  }
  return out;
}

function isCompactSimple(value: RuntimeValue): value is readonly RuntimeValue[] {
  return Array.isArray(value) && typeof value[0] === 'string' && Object.hasOwn(PACKED_KIND, value[0]);
}

/** v5: the running position and footing of a list's inline compact parts (both start at 0 for each list). */
interface Anchor { x: number; z: number; y: number }

/** v5: where a compact part's position pairs (in chain order) and its vertical pair sit among its entries (the tag at 0;
 *  y -1 when it has none), or null when the part is too short to hold them. */
function anchorSlots(part: readonly RuntimeValue[]): { at: readonly number[]; y: number } | null {
  const tag = part[0], n = part.length;
  if (tag === 'V') return n >= 3 ? { at: [1], y: -1 } : null;
  if (tag === 'W') return n >= 5 ? { at: [3], y: 1 } : null;
  if (tag === 'C') return n === 4 || n === 6 ? { at: [1], y: n === 6 ? 4 : -1 } : null;
  if (tag === 'O') return n === 6 || n === 8 ? { at: [1], y: n === 8 ? 6 : -1 } : null;
  if (tag === 'P') {
    const k = part[5];
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 1 || k > 64 || 7 + 3 * k >= n) return null;
    return { at: [3, 6 + 3 * k], y: 1 };
  }
  return null;
}

/** v5 encode: a v4 compact part with its position pairs as steps along the list's chain and its vertical pair as the
 *  step from the footing before it and its span. */
function anchoredCompact(part: CompactSimple, anchor: Anchor): CompactSimple {
  const slots = anchorSlots(part)!;
  const out = part.slice() as [string, ...number[]];
  for (const i of slots.at) {
    const x = part[i] as number, z = part[i + 1] as number;
    out[i] = x - anchor.x; out[i + 1] = z - anchor.z;
    anchor.x = x; anchor.z = z;
  }
  if (slots.y > 0) {
    const y0 = part[slots.y] as number, y1 = part[slots.y + 1] as number;
    out[slots.y] = y0 - anchor.y; out[slots.y + 1] = y1 - y0;
    anchor.y = y0;
  }
  return out;
}

/** v5 decode: anchoredCompact undone (the v4 compact part back), the chain moved on. */
function unanchoredCompact(part: readonly RuntimeValue[], anchor: Anchor): readonly RuntimeValue[] {
  const slots = anchorSlots(part);
  if (!slots) throw new TypeError('collision primitive shape is invalid');
  const out = part.slice();
  for (const i of slots.at) {
    const dx = part[i], dz = part[i + 1];
    if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dz)) throw new TypeError('collision primitive shape is invalid');
    anchor.x += dx as number; anchor.z += dz as number;
    out[i] = anchor.x; out[i + 1] = anchor.z;
  }
  if (slots.y > 0) {
    const dy = part[slots.y], span = part[slots.y + 1];
    if (!Number.isSafeInteger(dy) || !Number.isSafeInteger(span)) throw new TypeError('collision primitive shape is invalid');
    anchor.y += dy as number;
    out[slots.y] = anchor.y; out[slots.y + 1] = anchor.y + (span as number);
  }
  return out;
}

/**
 * v4: a record's reference box in integers of 1/10000 m, [minX, minY, minZ, maxX, maxY, maxZ], from its packed shape
 * alone: the corners of 'v', 'w' and 'p' parts, a circle's centre +- radius, a box's centre, the vertical extents of
 * 'w' and 'p' parts and of circles and boxes that carry one (0 where no part has one). Null when a number is not an exact
 * integer of 1/10000 m. Encoder and decoder compute it from the same packed numbers, so the steps 'D' are exact.
 */
function boundsReference(shape: Shape): number[] | null {
  const parts = (shape[0] === 'm' ? shape.slice(1) : [shape]) as PackedSimpleShape[];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  // (only the numbers the box reads: a box's yaw or a 'p' part's planes may have any decimals)
  const at = (part: PackedSimpleShape, i: number): number | null => scaled(part[i + 1] as number);
  for (const part of parts) {
    const kind = part[0], count = part.length - 1;
    const y = (i: number): boolean => {
      const lo = at(part, i), hi = at(part, i + 1);
      if (lo === null || hi === null) return false;
      y0 = Math.min(y0, lo); y1 = Math.max(y1, hi);
      return true;
    };
    if (kind === 'c' || kind === 'o') {
      const cx = at(part, 0), cz = at(part, 1), reach = kind === 'c' ? at(part, 2) : 0;
      if (cx === null || cz === null || reach === null) return null;
      x0 = Math.min(x0, cx - reach); x1 = Math.max(x1, cx + reach);
      z0 = Math.min(z0, cz - reach); z1 = Math.max(z1, cz + reach);
      const extent = kind === 'c' ? 3 : 5;
      if (count === extent + 2 && !y(extent)) return null;
      continue;
    }
    if ((kind === 'w' || kind === 'p') && !y(0)) return null;
    const from = kind === 'v' ? 0 : kind === 'w' ? 2 : kind === 'p' ? 5 + 3 * (part[5] as number) : count;
    for (let i = from; i + 1 < count; i += 2) {
      const x = at(part, i), z = at(part, i + 1);
      if (x === null || z === null) return null;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  if (!Number.isFinite(x0) || !Number.isFinite(z0)) return null;
  if (!Number.isFinite(y0)) { y0 = 0; y1 = 0; }
  return [x0, y0, z0, x1, y1, z1];
}

/** v4: the forest's circle centres by tree index (a tree record: kind 'tree', an index 't', one circle part); an index
 *  two records share is left out. Built alike from the records the encoder writes and the decoder reads back. */
function treeCentres(records: readonly PackedCollisionRecord[][]): Map<number, readonly [number, number]> {
  const centres = new Map<number, readonly [number, number]>();
  const shared = new Set<number>();
  for (const list of records) {
    for (const record of list) {
      const t = (record as { t?: RuntimeValue }).t, shape = record.s;
      if (record.k !== 'tree' || typeof t !== 'number' || !Number.isSafeInteger(t) || !shape || shape[0] !== 'c') continue;
      if (centres.has(t)) shared.add(t);
      centres.set(t, [shape[1] as number, shape[2] as number]);
    }
  }
  for (const t of shared) centres.delete(t);
  return centres;
}

function eachPrimitive(manifest: CollisionManifest, visit: (shape: PackedSimpleShape) => void) {
  for (const records of [manifest.obstacles, manifest.colliders]) {
    for (const { s } of records) {
      if (s?.[0] === 'm') s.slice(1).forEach((shape) => visit(shape as PackedSimpleShape));
      else if (s) visit(s);
    }
  }
}

/** Exact numeric tuples only: never quantize, simplify, or transform geometry. */
export function encodeCollisionManifest(
  manifest: CollisionManifest, encoding: CollisionManifestEncoding = ENCODING,
): EncodedManifest {
  if (encoding !== LEGACY_ENCODING && encoding !== KIND_ENCODING && encoding !== COMPACT_ENCODING
      && encoding !== REFERENCED_ENCODING && encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
  const positional = encoding === ENCODING;
  const referenced = encoding === REFERENCED_ENCODING || positional;
  const compact = encoding === COMPACT_ENCODING || referenced;
  // (v5: a collider that is an obstacle exactly is that obstacle's index; its parts are written once, with the obstacle)
  const colliderRefs: (number | null)[] = [];
  if (positional) {
    const firstObstacle = new Map<string, number>();
    manifest.obstacles.forEach((value, i) => {
      const key = JSON.stringify(value);
      if (!firstObstacle.has(key)) firstObstacle.set(key, i);
    });
    for (const value of manifest.colliders) {
      const i = firstObstacle.get(JSON.stringify(value));
      colliderRefs.push(i !== undefined && sameRecord(manifest.obstacles[i], value) ? i : null);
    }
  }
  const counts = new Map<string, number>();
  const counted = positional
    ? { ...manifest, colliders: manifest.colliders.filter((_, i) => colliderRefs[i] === null) } : manifest;
  eachPrimitive(counted, (shape) => {
    const key = JSON.stringify(shape);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const shapes: PackedSimpleShape[] = [];
  const ids = new Map<string, number>();
  // (v5: the most used first; the stable sort keeps first-seen ties. Before v5, in first-seen order)
  const repeated = Array.from(counts).filter(([, count]) => count >= 2);
  if (positional) repeated.sort((a, b) => b[1] - a[1]);
  for (const [key] of repeated) {
    ids.set(key, shapes.length);
    shapes.push(JSON.parse(key) as PackedSimpleShape);
  }
  // (v5: a list's inline compact parts chained from one position and footing to the next; null before v5)
  let anchor: Anchor | null = null;
  const simple = (shape: PackedSimpleShape): EncodedSimple => {
    const id = ids.get(JSON.stringify(shape));
    if (id !== undefined) return id;
    if (!compact) return shape;
    const part = compactSimple(shape);
    return anchor && isCompactSimple(part as RuntimeValue) ? anchoredCompact(part as CompactSimple, anchor) : part;
  };
  const encode = (shape: Shape): EncodedShape => shape[0] === 'm'
    ? ['m', ...shape.slice(1).map((part) => simple(part as PackedSimpleShape))]
    : simple(shape);
  const kindCounts = new Map<string, number>();
  if (encoding !== LEGACY_ENCODING) {
    for (const records of [manifest.obstacles, manifest.colliders]) {
      for (const { k } of records) {
        if (typeof k === 'string') kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
      }
    }
  }
  // Stable sort keeps first-seen ties; frequent kinds receive shorter JSON IDs.
  const kinds = Array.from(kindCounts).sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
  if (kinds.length > MAX_KINDS) throw new TypeError('collision kind dictionary is too large');
  const kindIds = new Map(kinds.map((kind, id) => [kind, id]));
  const record = (value: PackedCollisionRecord): EncodedRecord => {
    const result: EncodedRecord = { ...value };
    if (value.s) result.s = encode(value.s);
    if (encoding !== LEGACY_ENCODING && typeof value.k === 'string') result.k = kindIds.get(value.k)!;
    if (compact) {
      const bounds = value.b.map(scaled);
      if (bounds.every((n) => n !== null)) {
        // (v4: the steps from the shape's reference box, when it has one)
        const reference = referenced && value.s ? boundsReference(value.s) : null;
        const steps = reference ? (bounds as number[]).map((n, i) => n - reference[i]) : null;
        // (the compact bounds take the key's place in the record, so the record's key order is v2's)
        const ordered: EncodedRecord = {};
        for (const key of Object.keys(result) as (keyof EncodedRecord)[]) {
          if (key === 'b') {
            if (steps) ordered.D = steps; else ordered.B = bounds as number[];
          } else (ordered as Record<string, RuntimeValue>)[key] = result[key] as RuntimeValue;
        }
        return ordered;
      }
    }
    return result;
  };
  if (shapes.length > MAX_PRIMITIVES) throw new TypeError('collision primitive dictionary is too large');
  const dictionary = compact ? shapes.map(compactSimple) as PackedSimpleShape[] : shapes;
  const concealers = referenced ? encodeConcealers(manifest) : manifest.concealers;
  if (!positional) {
    return {
      encoding, shapes: dictionary,
      ...(encoding !== LEGACY_ENCODING ? { kinds } : {}),
      obstacles: manifest.obstacles.map(record), colliders: manifest.colliders.map(record),
      concealers,
      ...(manifest.craters ? { craters: manifest.craters } : {}),
    };
  }
  // v5: each list's records as v4 writes them, its inline parts chained; a collider that is an obstacle exactly is the
  // obstacle's index (and moves no chain)
  anchor = { x: 0, z: 0, y: 0 };
  const obstacles = manifest.obstacles.map(record);
  anchor = { x: 0, z: 0, y: 0 };
  const colliders = manifest.colliders.map((value, i): EncodedRecord | number => colliderRefs[i] ?? record(value));
  // the key orders, the most used first; the steps all zero as 0
  const orderCounts = new Map<string, number>();
  for (const list of [obstacles, colliders]) {
    for (const value of list) {
      if (typeof value === 'number') continue;
      const order = Object.keys(value).join(',');
      orderCounts.set(order, (orderCounts.get(order) ?? 0) + 1);
    }
  }
  const orders = Array.from(orderCounts).sort((a, b) => b[1] - a[1]).map(([order]) => order);
  if (orders.length > MAX_KEY_ORDERS) throw new TypeError('collision key-order table is too large');
  const orderIds = new Map(orders.map((order, id) => [order, id]));
  const positionalRecord = (value: EncodedRecord): PositionalRecord => {
    const keys = Object.keys(value) as (keyof EncodedRecord)[];
    const out: [number, ...RuntimeValue[]] = [orderIds.get(keys.join(','))!];
    for (const key of keys) {
      const entry = value[key] as RuntimeValue;
      out.push(key === 'D' && (entry as number[]).every((n) => n === 0) ? 0 : entry);
    }
    return out;
  };
  return {
    encoding, shapes: dictionary, kinds, keys: orders.map((order) => order.split(',')),
    obstacles: obstacles.map(positionalRecord),
    colliders: colliders.map((value) => (typeof value === 'number' ? value : positionalRecord(value))),
    concealers,
    ...(manifest.craters ? { craters: manifest.craters } : {}),
  };
}

/** v5: two packed records alike in every key (in order), number (Object.is), string and part. */
function sameRecord(a: RuntimeValue, b: RuntimeValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameRecord(a[i], b[i])) return false;
    return true;
  }
  if (a !== null && typeof a === 'object') {
    if (b === null || typeof b !== 'object') return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i] || !sameRecord((a as Record<string, RuntimeValue>)[ka[i]], (b as Record<string, RuntimeValue>)[kb[i]])) return false;
    }
    return true;
  }
  return a === b;
}

/** v4: each concealer on a tree's exact circle centre as [tree index, radius, add]; any other as it is. */
function encodeConcealers(manifest: CollisionManifest): EncodedConcealer[] | undefined {
  if (!manifest.concealers) return manifest.concealers;
  const centres = treeCentres([manifest.obstacles, manifest.colliders]);
  const byCentre = new Map<string, number | null>();
  for (const [t, [x, z]] of centres) {
    const key = `${x},${z}`;
    byCentre.set(key, byCentre.has(key) ? null : t);
  }
  return manifest.concealers.map((entry) => {
    const t = byCentre.get(`${entry[0]},${entry[1]}`);
    if (t == null) return entry;
    const centre = centres.get(t)!;
    return Object.is(centre[0], entry[0]) && Object.is(centre[1], entry[1]) ? [t, entry[2], entry[3]] as const : entry;
  });
}

/** v4: the concealers back, a tree reference on its tree's centre. */
function decodeConcealers(value: RuntimeValue, records: readonly PackedCollisionRecord[][]): RuntimeValue {
  if (!Array.isArray(value)) return value;
  let centres: Map<number, readonly [number, number]> | null = null;
  return value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 3) return entry;
    centres ??= treeCentres(records);
    const centre = typeof entry[0] === 'number' ? centres.get(entry[0]) : undefined;
    if (!centre) throw new TypeError('world collision concealment is invalid');
    return [centre[0], centre[1], entry[1], entry[2]];
  });
}

function dictionary(value: RuntimeValue, compact: boolean): readonly PackedSimpleShape[] {
  if (!Array.isArray(value) || value.length > MAX_PRIMITIVES) {
    throw new TypeError('collision primitive dictionary is invalid');
  }
  const shapes = Array.from(value, (shape) => (compact && isCompactSimple(shape) ? expandSimple(shape) : shape));
  if (!shapes.every(isSimpleShape)) throw new TypeError('collision primitive dictionary is invalid');
  // Shared packed tuples are immutable. Match inflation copies their mutable
  // point arrays, so neither another match nor the loader cache can be changed.
  return shapes.map((shape) => Object.freeze(shape));
}

function resolveSimple(value: RuntimeValue, shapes: readonly PackedSimpleShape[], compact: boolean,
  anchor: Anchor | null = null): PackedSimpleShape {
  if (compact && isCompactSimple(value)) value = expandSimple(anchor ? unanchoredCompact(value, anchor) : value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value >= shapes.length) {
      throw new TypeError('collision primitive reference is invalid');
    }
    return shapes[value];
  }
  if (!isSimpleShape(value)) throw new TypeError('collision primitive shape is invalid');
  return value;
}

function resolveShape(value: RuntimeValue, shapes: readonly PackedSimpleShape[], compact: boolean,
  anchor: Anchor | null = null): Shape {
  if (!Array.isArray(value) || value[0] !== 'm') return resolveSimple(value, shapes, compact, anchor);
  if (value.length < 2 || value.length > COLLISION_COMPOUND_MAX_PARTS + 1) throw new TypeError('collision compound shape is invalid');
  const out: unknown[] = ['m'];
  for (let i = 1; i < value.length; i++) out.push(resolveSimple(value[i], shapes, compact, anchor));
  return out as unknown as Shape;
}

/** v4 decode: the shape resolved as resolveShape does, its reference box into `box` in the same pass (an inline compact
 *  part's from its integers, a dictionary part's read once a shard, any other's by partBoxInto); false when it has none. */
function resolveShapeBoxed(value: RuntimeValue, shapes: readonly PackedSimpleShape[], box: Float64Array, part: Float64Array,
  cache: Map<object, Float64Array | null>, into: { shape: Shape | undefined }, anchor: Anchor | null = null): boolean {
  const compound = Array.isArray(value) && value[0] === 'm';
  if (compound && ((value as unknown[]).length < 2 || (value as unknown[]).length > COLLISION_COMPOUND_MAX_PARTS + 1)) {
    throw new TypeError('collision compound shape is invalid');
  }
  const raw = compound ? value as readonly RuntimeValue[] : null;
  const parts = raw ? raw.length - 1 : 1;
  const out: unknown[] | null = raw ? ['m'] : null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity, exact = true;
  for (let k = 0; k < parts; k++) {
    const encoded = raw ? raw[k + 1] : value;
    let simple: PackedSimpleShape;
    let read: Float64Array | null;
    if (isCompactSimple(encoded)) {
      simple = expandSimple(anchor ? unanchoredCompact(encoded, anchor) : encoded, part) as PackedSimpleShape;
      if (!isSimpleShape(simple)) throw new TypeError('collision primitive shape is invalid');
      read = part;
    } else {
      simple = resolveSimple(encoded, shapes, true);
      const cached = cache.get(simple);
      if (cached !== undefined) read = cached;
      else {
        read = partBoxInto(simple, part) ? part : null;
        if (typeof encoded === 'number') cache.set(simple, read && Float64Array.from(read));
      }
    }
    if (out) out.push(simple); else into.shape = simple;
    if (!read) { exact = false; continue; }
    if (read[0] < x0) x0 = read[0]; if (read[2] > x1) x1 = read[2];
    if (read[1] < z0) z0 = read[1]; if (read[3] > z1) z1 = read[3];
    if (read[4] === read[4]) { if (read[4] < y0) y0 = read[4]; if (read[5] > y1) y1 = read[5]; }
  }
  if (out) into.shape = out as unknown as Shape;
  if (!exact || !Number.isFinite(x0) || !Number.isFinite(z0)) return false;
  if (!Number.isFinite(y0)) { y0 = 0; y1 = 0; }
  box[0] = x0; box[1] = y0; box[2] = z0; box[3] = x1; box[4] = y1; box[5] = z1;
  return true;
}

function kindDictionary(value: RuntimeValue): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_KINDS) {
    throw new TypeError('collision kind dictionary is invalid');
  }
  const kinds = Array.from(value);
  if (!kinds.every((kind) => typeof kind === 'string')) {
    throw new TypeError('collision kind dictionary is invalid');
  }
  return kinds;
}

function resolveKind(value: number, kinds: readonly string[] | undefined): string {
  if (!kinds || !Number.isSafeInteger(value) || value < 0 || value >= kinds.length) {
    throw new TypeError('collision kind reference is invalid');
  }
  return kinds[value];
}

/** v4 decode: one part's reference box in integers of 1/10000 m into `out` ([x0, z0, x1, z1, y0, y1], y NaN when the
 *  part has none), exactly as boundsReference reads it; false when a number it reads is not exact. */
function partBoxInto(part: PackedSimpleShape, out: Float64Array): boolean {
  const kind = part[0], count = part.length - 1;
  out[4] = NaN; out[5] = NaN;
  if (kind === 'c' || kind === 'o') {
    const cx = scaled(part[1] as number), cz = scaled(part[2] as number), reach = kind === 'c' ? scaled(part[3] as number) : 0;
    if (cx === null || cz === null || reach === null) return false;
    out[0] = cx - reach; out[2] = cx + reach; out[1] = cz - reach; out[3] = cz + reach;
    const extent = kind === 'c' ? 3 : 5;
    if (count === extent + 2) {
      const lo = scaled(part[extent + 1] as number), hi = scaled(part[extent + 2] as number);
      if (lo === null || hi === null) return false;
      out[4] = lo; out[5] = hi;
    }
    return true;
  }
  if (kind === 'w' || kind === 'p') {
    const lo = scaled(part[1] as number), hi = scaled(part[2] as number);
    if (lo === null || hi === null) return false;
    out[4] = lo; out[5] = hi;
  }
  const from = kind === 'v' ? 0 : kind === 'w' ? 2 : kind === 'p' ? 5 + 3 * (part[5] as number) : count;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = from; i + 1 < count; i += 2) {
    const x = scaled(part[i + 1] as number), z = scaled(part[i + 2] as number);
    if (x === null || z === null) return false;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  out[0] = x0; out[1] = z0; out[2] = x1; out[3] = z1;
  return true;
}

function integerSix(value: RuntimeValue): value is number[] {
  if (!Array.isArray(value) || value.length !== 6) return false;
  for (let i = 0; i < 6; i++) if (!Number.isSafeInteger(value[i])) return false;
  return true;
}

function resolveRecords(
  value: RuntimeValue, shapes: readonly PackedSimpleShape[], kinds: readonly string[] | undefined, compact = false,
  referenced = false,
): PackedCollisionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('collision records are invalid');
  // (2026-10-16, the perf lane: v4 decode within reach of v3's) one pass a record, one output object, the shape resolved
  // once, the dictionary parts' reference boxes read once a shard, scratch boxes reused
  const box = new Float64Array(6), part = new Float64Array(6);
  const cache = new Map<object, Float64Array | null>();
  const slot: { shape: Shape | undefined } = { shape: undefined };
  const out: PackedCollisionRecord[] = new Array(value.length);
  for (let r = 0; r < value.length; r++) {
    const record = value[r];
    if (!isRecord(record)) throw new TypeError('collision record is invalid');
    // dictionaries are not retained by the manifest, and kinds are immutable strings shared by all decoded records
    const steps = referenced ? record.D : undefined, bounds = compact ? record.B : undefined;
    let shape: Shape | undefined, boxed = false;
    if (record.s !== undefined) {
      if (steps !== undefined) { boxed = resolveShapeBoxed(record.s, shapes, box, part, cache, slot); shape = slot.shape; }
      else shape = resolveShape(record.s, shapes, compact);
    }
    if ((steps !== undefined || bounds !== undefined) && (record.b !== undefined || (steps !== undefined && bounds !== undefined))) {
      throw new TypeError('collision record is invalid');
    }
    const resolved: Record<string, RuntimeValue> = {};
    for (const key in record) {
      if (key === 'D' && steps !== undefined) {
        // (the bounds in the key's place: the decoded record's keys are in v2's order)
        if (!integerSix(steps) || !shape || !boxed) throw new TypeError('collision record is invalid');
        resolved.b = [(steps[0] + box[0]) / SCALE, (steps[1] + box[1]) / SCALE, (steps[2] + box[2]) / SCALE,
          (steps[3] + box[3]) / SCALE, (steps[4] + box[4]) / SCALE, (steps[5] + box[5]) / SCALE];
      } else if (key === 'B' && bounds !== undefined) {
        if (!integerSix(bounds)) throw new TypeError('collision record is invalid');
        resolved.b = [bounds[0] / SCALE, bounds[1] / SCALE, bounds[2] / SCALE, bounds[3] / SCALE, bounds[4] / SCALE, bounds[5] / SCALE];
      } else if (key === 'k') {
        const kind = record.k;
        resolved.k = typeof kind === 'number' ? resolveKind(kind, kinds) : kind;
      } else if (key === 's') {
        resolved.s = shape;
      } else resolved[key] = record[key];
    }
    if (!isPackedCollisionMetadata(resolved)) throw new TypeError('collision record is invalid');
    out[r] = resolved as PackedCollisionRecord;
  }
  return out;
}

/** v5: a record key order of the 'keys' table, read once a shard: the decoded keys, where the shape and bounds sit. */
interface KeyOrder { keys: readonly string[]; shapeAt: number; bounds: 'D' | 'B' | 'b' | null }

function keyOrders(value: RuntimeValue): KeyOrder[] {
  if (!Array.isArray(value) || value.length > MAX_KEY_ORDERS) throw new TypeError('collision key-order table is invalid');
  return value.map((entry) => {
    if (!Array.isArray(entry) || entry.length < 1 || entry.length > 16) throw new TypeError('collision key-order table is invalid');
    const names = new Set<string>();
    let bounds: KeyOrder['bounds'] = null;
    for (const key of entry) {
      // (the packed records' keys are short lowercase names; 'D' and 'B' name the bounds' encoding)
      if (typeof key !== 'string' || !/^[A-Za-z]{1,8}$/.test(key)) throw new TypeError('collision key-order table is invalid');
      const name = key === 'D' || key === 'B' ? 'b' : key;
      if (names.has(name)) throw new TypeError('collision key-order table is invalid');
      names.add(name);
      if (name === 'b') bounds = key as 'D' | 'B' | 'b';
    }
    return { keys: entry as string[], shapeAt: entry.indexOf('s'), bounds };
  });
}

const ZERO_STEPS: readonly number[] = Object.freeze([0, 0, 0, 0, 0, 0]);

/** v5: an obstacle's record for the collider that names it, alike in every key and number, its own arrays. */
function copiedRecord(record: PackedCollisionRecord): PackedCollisionRecord {
  const copy = { ...record };
  copy.b = record.b.slice() as unknown as PackedCollisionRecord['b'];
  const shape = record.s;
  if (shape) {
    const own = (part: PackedSimpleShape) => (Object.isFrozen(part) ? part : part.slice() as unknown as PackedSimpleShape);
    copy.s = shape[0] === 'm'
      ? ['m', ...shape.slice(1).map((part) => own(part as PackedSimpleShape))] as unknown as Shape
      : own(shape as PackedSimpleShape);
  }
  return copy;
}

/** v5 decode: a list of [key order, ...values] records (a collider may be an obstacle's index), its chain from 0. */
function resolvePositionalRecords(
  value: RuntimeValue, shapes: readonly PackedSimpleShape[], kinds: readonly string[] | undefined,
  orders: readonly KeyOrder[], obstacles: readonly PackedCollisionRecord[] | null,
): PackedCollisionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('collision records are invalid');
  const box = new Float64Array(6), part = new Float64Array(6);
  const cache = new Map<object, Float64Array | null>();
  const slot: { shape: Shape | undefined } = { shape: undefined };
  const anchor: Anchor = { x: 0, z: 0, y: 0 };
  const out: PackedCollisionRecord[] = new Array(value.length);
  for (let r = 0; r < value.length; r++) {
    const entry = value[r];
    if (typeof entry === 'number') {
      if (!obstacles || !Number.isSafeInteger(entry) || entry < 0 || entry >= obstacles.length) {
        throw new TypeError('collision record is invalid');
      }
      out[r] = copiedRecord(obstacles[entry]);
      continue;
    }
    if (!Array.isArray(entry)) throw new TypeError('collision record is invalid');
    const id = entry[0];
    if (!Number.isSafeInteger(id) || (id as number) < 0 || (id as number) >= orders.length) throw new TypeError('collision record is invalid');
    const order = orders[id as number];
    if (entry.length !== order.keys.length + 1) throw new TypeError('collision record is invalid');
    // (the shape first, whatever its place: the list's chain runs record by record, one shape a record)
    let shape: Shape | undefined, boxed = false;
    if (order.shapeAt >= 0) {
      const encoded = entry[order.shapeAt + 1];
      if (order.bounds === 'D') { boxed = resolveShapeBoxed(encoded, shapes, box, part, cache, slot, anchor); shape = slot.shape; }
      else shape = resolveShape(encoded, shapes, true, anchor);
    }
    const resolved: Record<string, RuntimeValue> = {};
    for (let i = 0; i < order.keys.length; i++) {
      const key = order.keys[i], v = entry[i + 1];
      if (key === 'D') {
        const steps = v === 0 ? ZERO_STEPS : v;
        if (!integerSix(steps) || !shape || !boxed) throw new TypeError('collision record is invalid');
        resolved.b = [(steps[0] + box[0]) / SCALE, (steps[1] + box[1]) / SCALE, (steps[2] + box[2]) / SCALE,
          (steps[3] + box[3]) / SCALE, (steps[4] + box[4]) / SCALE, (steps[5] + box[5]) / SCALE];
      } else if (key === 'B') {
        if (!integerSix(v)) throw new TypeError('collision record is invalid');
        resolved.b = [v[0] / SCALE, v[1] / SCALE, v[2] / SCALE, v[3] / SCALE, v[4] / SCALE, v[5] / SCALE];
      } else if (key === 'k') {
        resolved.k = typeof v === 'number' ? resolveKind(v, kinds) : v;
      } else if (key === 's') {
        resolved.s = shape;
      } else resolved[key] = v;
    }
    if (!isPackedCollisionMetadata(resolved)) throw new TypeError('collision record is invalid');
    out[r] = resolved as PackedCollisionRecord;
  }
  return out;
}

/** Decode once at the I/O boundary; the match API and collision hot paths stay unchanged. */
export function decodeCollisionManifest(value: RuntimeValue): CollisionManifest {
  if (!isRecord(value)) {
    throw new TypeError('collision manifest is invalid');
  }
  if (value.encoding === undefined && value.shapes === undefined) return readCollisionManifest(value);
  if (value.encoding !== LEGACY_ENCODING && value.encoding !== KIND_ENCODING && value.encoding !== COMPACT_ENCODING
      && value.encoding !== REFERENCED_ENCODING && value.encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
  const positional = value.encoding === ENCODING;
  const referenced = value.encoding === REFERENCED_ENCODING || positional;
  const compact = value.encoding === COMPACT_ENCODING || referenced;
  const shapes = dictionary(value.shapes, compact);
  const kinds = value.encoding !== LEGACY_ENCODING ? kindDictionary(value.kinds) : undefined;
  // Metadata and each inline primitive are validated during this one pass;
  // dictionary primitives were validated once above, before any ref resolves.
  let obstacles: PackedCollisionRecord[], colliders: PackedCollisionRecord[];
  if (positional) {
    const orders = keyOrders(value.keys);
    obstacles = resolvePositionalRecords(value.obstacles, shapes, kinds, orders, null);
    colliders = resolvePositionalRecords(value.colliders, shapes, kinds, orders, obstacles);
  } else {
    obstacles = resolveRecords(value.obstacles, shapes, kinds, compact, referenced);
    colliders = resolveRecords(value.colliders, shapes, kinds, compact, referenced);
  }
  return {
    obstacles, colliders,
    concealers: readCollisionConcealers(referenced ? decodeConcealers(value.concealers, [obstacles, colliders]) : value.concealers),
    ...(value.craters !== undefined ? { craters: readCollisionCraters(value.craters) } : {}),
  };
}
