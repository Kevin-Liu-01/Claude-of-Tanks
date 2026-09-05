import type { RuntimeValue } from '../src/runtimeTypes.ts';
import type {
  CollisionManifest, PackedCollisionRecord, PackedSimpleShape,
} from '../src/world/headlessCollisionWorld.ts';
import {
  isPackedCollisionMetadata, isSimpleShape, readCollisionConcealers, readCollisionManifest,
} from './collisionManifestFormat.ts';

const ENCODING = 'primitive-dict-v1';
const MAX_PRIMITIVES = 131_072;
type Shape = NonNullable<PackedCollisionRecord['s']>;
type EncodedSimple = PackedSimpleShape | number;
type EncodedShape = EncodedSimple | readonly ['m', ...EncodedSimple[]];
type EncodedRecord = Omit<PackedCollisionRecord, 's'> & { s?: EncodedShape };

interface EncodedManifest {
  encoding: typeof ENCODING;
  shapes: PackedSimpleShape[];
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
export function encodeCollisionManifest(manifest: CollisionManifest): EncodedManifest {
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
  const record = (value: PackedCollisionRecord): EncodedRecord => value.s
    ? { ...value, s: encode(value.s) } : value;
  if (shapes.length > MAX_PRIMITIVES) throw new TypeError('collision primitive dictionary is too large');
  return {
    encoding: ENCODING, shapes,
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

function resolveRecords(value: RuntimeValue, shapes: readonly PackedSimpleShape[]): PackedCollisionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('collision records are invalid');
  return Array.from(value, (record) => {
    if (!isPackedCollisionMetadata(record)) {
      throw new TypeError('collision record is invalid');
    }
    return record.s === undefined ? record as PackedCollisionRecord
      : { ...record, s: resolveShape(record.s, shapes) };
  });
}

/** Decode once at the I/O boundary; the match API and collision hot paths stay unchanged. */
export function decodeCollisionManifest(value: RuntimeValue): CollisionManifest {
  if (!isRecord(value)) {
    throw new TypeError('collision manifest is invalid');
  }
  if (value.encoding === undefined && value.shapes === undefined) return readCollisionManifest(value);
  if (value.encoding !== ENCODING) throw new TypeError('collision manifest encoding is invalid');
  const shapes = dictionary(value.shapes);
  // Metadata and each inline primitive are validated during this one pass;
  // dictionary primitives were validated once above, before any ref resolves.
  return {
    obstacles: resolveRecords(value.obstacles, shapes),
    colliders: resolveRecords(value.colliders, shapes), concealers: readCollisionConcealers(value.concealers),
  };
}
