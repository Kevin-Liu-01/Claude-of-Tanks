import type { RuntimeValue } from '../src/runtimeTypes.ts';
import type {
  CollisionManifest, PackedCollisionRecord, PackedSimpleShape,
} from '../src/world/headlessCollisionWorld.ts';
import {
  isPackedCollisionMetadata, isSimpleShape, readCollisionConcealers, readCollisionManifest,
} from './collisionManifestFormat.ts';

const LEGACY_ENCODING = 'primitive-dict-v1';
const ENCODING = 'primitive-kind-dict-v2';
const MAX_PRIMITIVES = 131_072;
const MAX_KINDS = 1024;
export type CollisionManifestEncoding = typeof LEGACY_ENCODING | typeof ENCODING;
type Shape = NonNullable<PackedCollisionRecord['s']>;
type EncodedSimple = PackedSimpleShape | number;
type EncodedShape = EncodedSimple | readonly ['m', ...EncodedSimple[]];
type EncodedRecord = Omit<PackedCollisionRecord, 's' | 'k'> & {
  s?: EncodedShape;
  k?: PackedCollisionRecord['k'] | number;
};

interface EncodedManifest {
  encoding: CollisionManifestEncoding;
  shapes: PackedSimpleShape[];
  kinds?: string[];
  obstacles: EncodedRecord[];
  colliders: EncodedRecord[];
  concealers?: CollisionManifest['concealers'];
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
  if (encoding !== LEGACY_ENCODING && encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
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
  const simple = (shape: PackedSimpleShape): EncodedSimple => ids.get(JSON.stringify(shape)) ?? shape;
  const encode = (shape: Shape): EncodedShape => shape[0] === 'm'
    ? ['m', ...shape.slice(1).map((part) => simple(part as PackedSimpleShape))]
    : simple(shape);
  const kindCounts = new Map<string, number>();
  if (encoding === ENCODING) {
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
    if (encoding === ENCODING && typeof value.k === 'string') result.k = kindIds.get(value.k)!;
    return result;
  };
  if (shapes.length > MAX_PRIMITIVES) throw new TypeError('collision primitive dictionary is too large');
  return {
    encoding, shapes, ...(encoding === ENCODING ? { kinds } : {}),
    obstacles: manifest.obstacles.map(record), colliders: manifest.colliders.map(record),
    concealers: manifest.concealers,
  };
}

function dictionary(value: RuntimeValue): readonly PackedSimpleShape[] {
  if (!Array.isArray(value) || value.length > MAX_PRIMITIVES) {
    throw new TypeError('collision primitive dictionary is invalid');
  }
  const shapes = Array.from(value);
  if (!shapes.every(isSimpleShape)) throw new TypeError('collision primitive dictionary is invalid');
  // Shared packed tuples are immutable. Match inflation copies their mutable
  // point arrays, so neither another match nor the loader cache can be changed.
  return shapes.map((shape) => Object.freeze(shape));
}

function resolveSimple(value: RuntimeValue, shapes: readonly PackedSimpleShape[]): PackedSimpleShape {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value >= shapes.length) {
      throw new TypeError('collision primitive reference is invalid');
    }
    return shapes[value];
  }
  if (!isSimpleShape(value)) throw new TypeError('collision primitive shape is invalid');
  return value;
}

function resolveShape(value: RuntimeValue, shapes: readonly PackedSimpleShape[]): Shape {
  if (!Array.isArray(value) || value[0] !== 'm') return resolveSimple(value, shapes);
  if (value.length < 2 || value.length > 65) throw new TypeError('collision compound shape is invalid');
  return ['m', ...Array.from(value.slice(1), (part) => resolveSimple(part, shapes))];
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
  value: RuntimeValue, shapes: readonly PackedSimpleShape[], kinds: readonly string[] | undefined,
): PackedCollisionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('collision records are invalid');
  return Array.from(value, (record) => {
    if (!isRecord(record)) throw new TypeError('collision record is invalid');
    // One record copy resolves both fields; dictionaries are not retained by the
    // manifest, and kinds are immutable strings shared by all decoded records.
    const resolved = { ...record };
    if (typeof resolved.k === 'number') resolved.k = resolveKind(resolved.k, kinds);
    if (!isPackedCollisionMetadata(resolved)) {
      throw new TypeError('collision record is invalid');
    }
    if (resolved.s !== undefined) resolved.s = resolveShape(resolved.s, shapes);
    return resolved as PackedCollisionRecord;
  });
}

/** Decode once at the I/O boundary; the match API and collision hot paths stay unchanged. */
export function decodeCollisionManifest(value: RuntimeValue): CollisionManifest {
  if (!isRecord(value)) {
    throw new TypeError('collision manifest is invalid');
  }
  if (value.encoding === undefined && value.shapes === undefined) return readCollisionManifest(value);
  if (value.encoding !== LEGACY_ENCODING && value.encoding !== ENCODING) {
    throw new TypeError('collision manifest encoding is invalid');
  }
  const shapes = dictionary(value.shapes);
  const kinds = value.encoding === ENCODING ? kindDictionary(value.kinds) : undefined;
  // Metadata and each inline primitive are validated during this one pass;
  // dictionary primitives were validated once above, before any ref resolves.
  return {
    obstacles: resolveRecords(value.obstacles, shapes, kinds),
    colliders: resolveRecords(value.colliders, shapes, kinds), concealers: readCollisionConcealers(value.concealers),
  };
}
