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
const ENCODING = 'primitive-kind-dict-v4';
const MAX_PRIMITIVES = 131_072;
const MAX_KINDS = 1024;
type CollisionManifestEncoding = typeof LEGACY_ENCODING | typeof KIND_ENCODING | typeof COMPACT_ENCODING | typeof ENCODING;
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

interface EncodedManifest {
  encoding: CollisionManifestEncoding;
  shapes: PackedSimpleShape[];
  kinds?: string[];
  obstacles: EncodedRecord[];
  colliders: EncodedRecord[];
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

function expandSimple(value: readonly RuntimeValue[]): RuntimeValue {
  const kind = PACKED_KIND[value[0] as string];
  const numbers = value.slice(1);
  if (!numbers.every((entry) => Number.isSafeInteger(entry))) throw new TypeError('collision primitive shape is invalid');
  const from = cornersFrom(kind, numbers);
  const out: (string | number)[] = [kind];
  let x = 0, z = 0;
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i] as number;
    if (kind === 'p' && i === 4) { out.push(n); continue; }
    if (i < from) out.push(n / SCALE);
    else if ((i - from) % 2 === 0) { x += n; out.push(x / SCALE); } else { z += n; out.push(z / SCALE); }
  }
  return out;
}

function isCompactSimple(value: RuntimeValue): value is readonly RuntimeValue[] {
  return Array.isArray(value) && typeof value[0] === 'string' && Object.hasOwn(PACKED_KIND, value[0]);
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
  if (encoding !== LEGACY_ENCODING && encoding !== KIND_ENCODING && encoding !== COMPACT_ENCODING && encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
  const compact = encoding === COMPACT_ENCODING || encoding === ENCODING;
  const referenced = encoding === ENCODING;
  const counts = new Map<string, number>();
  eachPrimitive(manifest, (shape) => {
    const key = JSON.stringify(shape);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const shapes: PackedSimpleShape[] = [];
  const ids = new Map<string, number>();
  for (const [key, count] of counts) {
    if (count < 2) continue;
    ids.set(key, shapes.length);
    shapes.push(JSON.parse(key) as PackedSimpleShape);
  }
  const simple = (shape: PackedSimpleShape): EncodedSimple => ids.get(JSON.stringify(shape))
    ?? (compact ? compactSimple(shape) : shape);
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
  return {
    encoding, shapes: compact ? shapes.map(compactSimple) as PackedSimpleShape[] : shapes,
    ...(encoding !== LEGACY_ENCODING ? { kinds } : {}),
    obstacles: manifest.obstacles.map(record), colliders: manifest.colliders.map(record),
    concealers: referenced ? encodeConcealers(manifest) : manifest.concealers,
    ...(manifest.craters ? { craters: manifest.craters } : {}),
  };
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

function resolveSimple(value: RuntimeValue, shapes: readonly PackedSimpleShape[], compact: boolean): PackedSimpleShape {
  if (compact && isCompactSimple(value)) value = expandSimple(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value >= shapes.length) {
      throw new TypeError('collision primitive reference is invalid');
    }
    return shapes[value];
  }
  if (!isSimpleShape(value)) throw new TypeError('collision primitive shape is invalid');
  return value;
}

function resolveShape(value: RuntimeValue, shapes: readonly PackedSimpleShape[], compact: boolean): Shape {
  if (!Array.isArray(value) || value[0] !== 'm') return resolveSimple(value, shapes, compact);
  if (value.length < 2 || value.length > COLLISION_COMPOUND_MAX_PARTS + 1) throw new TypeError('collision compound shape is invalid');
  return ['m', ...Array.from(value.slice(1), (part) => resolveSimple(part, shapes, compact))];
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

function resolveRecords(
  value: RuntimeValue, shapes: readonly PackedSimpleShape[], kinds: readonly string[] | undefined, compact = false,
  referenced = false,
): PackedCollisionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('collision records are invalid');
  return Array.from(value, (record) => {
    if (!isRecord(record)) throw new TypeError('collision record is invalid');
    // One record copy resolves both fields; dictionaries are not retained by the
    // manifest, and kinds are immutable strings shared by all decoded records.
    let resolved: Record<string, RuntimeValue> = { ...record };
    if (referenced && resolved.D !== undefined) {
      const steps = resolved.D;
      if (resolved.b !== undefined || resolved.B !== undefined || !Array.isArray(steps) || steps.length !== 6
          || !steps.every((n) => Number.isSafeInteger(n)) || resolved.s === undefined) {
        throw new TypeError('collision record is invalid');
      }
      const reference = boundsReference(resolveShape(resolved.s, shapes, compact));
      if (!reference) throw new TypeError('collision record is invalid');
      // (the bounds in the key's place: the decoded record's keys are in v2's order)
      const ordered: Record<string, RuntimeValue> = {};
      for (const key of Object.keys(resolved)) {
        if (key === 'D') ordered.b = steps.map((n, i) => ((n as number) + reference[i]) / SCALE);
        else ordered[key] = resolved[key];
      }
      resolved = ordered;
    }
    if (compact && resolved.B !== undefined) {
      const bounds = resolved.B;
      if (resolved.b !== undefined || !Array.isArray(bounds) || bounds.length !== 6 || !bounds.every((n) => Number.isSafeInteger(n))) {
        throw new TypeError('collision record is invalid');
      }
      // (the bounds in the key's place: the decoded record's keys are in v2's order)
      const ordered: Record<string, RuntimeValue> = {};
      for (const key of Object.keys(resolved)) {
        if (key === 'B') ordered.b = bounds.map((n) => (n as number) / SCALE);
        else ordered[key] = resolved[key];
      }
      resolved = ordered;
    }
    if (typeof resolved.k === 'number') resolved.k = resolveKind(resolved.k, kinds);
    if (!isPackedCollisionMetadata(resolved)) {
      throw new TypeError('collision record is invalid');
    }
    if (resolved.s !== undefined) resolved.s = resolveShape(resolved.s, shapes, compact);
    return resolved as PackedCollisionRecord;
  });
}

/** Decode once at the I/O boundary; the match API and collision hot paths stay unchanged. */
export function decodeCollisionManifest(value: RuntimeValue): CollisionManifest {
  if (!isRecord(value)) {
    throw new TypeError('collision manifest is invalid');
  }
  if (value.encoding === undefined && value.shapes === undefined) return readCollisionManifest(value);
  if (value.encoding !== LEGACY_ENCODING && value.encoding !== KIND_ENCODING && value.encoding !== COMPACT_ENCODING
      && value.encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
  const referenced = value.encoding === ENCODING;
  const compact = value.encoding === COMPACT_ENCODING || referenced;
  const shapes = dictionary(value.shapes, compact);
  const kinds = value.encoding !== LEGACY_ENCODING ? kindDictionary(value.kinds) : undefined;
  // Metadata and each inline primitive are validated during this one pass;
  // dictionary primitives were validated once above, before any ref resolves.
  const obstacles = resolveRecords(value.obstacles, shapes, kinds, compact, referenced);
  const colliders = resolveRecords(value.colliders, shapes, kinds, compact, referenced);
  return {
    obstacles, colliders,
    concealers: readCollisionConcealers(referenced ? decodeConcealers(value.concealers, [obstacles, colliders]) : value.concealers),
    ...(value.craters !== undefined ? { craters: readCollisionCraters(value.craters) } : {}),
  };
}
