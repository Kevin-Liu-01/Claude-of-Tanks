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
const ENCODING = 'primitive-kind-dict-v3';
const MAX_PRIMITIVES = 131_072;
const MAX_KINDS = 1024;
type CollisionManifestEncoding = typeof LEGACY_ENCODING | typeof KIND_ENCODING | typeof ENCODING;
type Shape = NonNullable<PackedCollisionRecord['s']>;
type CompactSimple = readonly [string, ...number[]];
type EncodedSimple = PackedSimpleShape | CompactSimple | number;
type EncodedShape = EncodedSimple | readonly ['m', ...EncodedSimple[]];
type EncodedRecord = Omit<PackedCollisionRecord, 's' | 'k' | 'b'> & {
  s?: EncodedShape;
  k?: PackedCollisionRecord['k'] | number;
  b?: PackedCollisionRecord['b'];
  B?: readonly number[];
};

interface EncodedManifest {
  encoding: CollisionManifestEncoding;
  shapes: PackedSimpleShape[];
  kinds?: string[];
  obstacles: EncodedRecord[];
  colliders: EncodedRecord[];
  concealers?: CollisionManifest['concealers'];
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
  if (encoding !== LEGACY_ENCODING && encoding !== KIND_ENCODING && encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
  const compact = encoding === ENCODING;
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
        // (the compact bounds take the key's place in the record, so the record's key order is v2's)
        const ordered: EncodedRecord = {};
        for (const key of Object.keys(result) as (keyof EncodedRecord)[]) {
          if (key === 'b') ordered.B = bounds as number[];
          else (ordered as Record<string, RuntimeValue>)[key] = result[key] as RuntimeValue;
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
    concealers: manifest.concealers,
    ...(manifest.craters ? { craters: manifest.craters } : {}),
  };
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
): PackedCollisionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('collision records are invalid');
  return Array.from(value, (record) => {
    if (!isRecord(record)) throw new TypeError('collision record is invalid');
    // One record copy resolves both fields; dictionaries are not retained by the
    // manifest, and kinds are immutable strings shared by all decoded records.
    let resolved: Record<string, RuntimeValue> = { ...record };
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
  if (value.encoding !== LEGACY_ENCODING && value.encoding !== KIND_ENCODING && value.encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
  const compact = value.encoding === ENCODING;
  const shapes = dictionary(value.shapes, compact);
  const kinds = value.encoding !== LEGACY_ENCODING ? kindDictionary(value.kinds) : undefined;
  // Metadata and each inline primitive are validated during this one pass;
  // dictionary primitives were validated once above, before any ref resolves.
  return {
    obstacles: resolveRecords(value.obstacles, shapes, kinds, compact),
    colliders: resolveRecords(value.colliders, shapes, kinds, compact), concealers: readCollisionConcealers(value.concealers),
    ...(value.craters !== undefined ? { craters: readCollisionCraters(value.craters) } : {}),
  };
}
