/**
 * The local Worker driver's state mirror (docs/ARCHITECTURE.md "One core, two drivers"): what a hull's simulation holds,
 * carried from the Worker's battle to the page's battle every tick as numbers. No DOM; the Worker and the page run it.
 *
 * The Worker walks each hull's simulated objects (its state, combat, consumables, drone and special action, and the hull's
 * own scalar fields) in property order, writing every leaf into a Float64Array: a number as itself, a boolean as 0 or 1, a
 * string as its index in an interned table, a null or an absent value as 0 with its kind in the schema. The same walk
 * hashes the shape it saw (every key, every leaf's kind, every array's length); while the hash holds, the schema the
 * page compiled stands and only the values travel. A changed shape (a magazine fitted, a drone launched) sends the new
 * schema with that tick. A Set travels whole when its size or contents change. Aliased objects (a reload channel that is
 * also the hull's reload) are walked once, by their first path. Nothing is allocated while the shape holds.
 */
import { Vector3 } from 'three';

/** A leaf's kind on the wire. */
export const LEAF = Object.freeze({ number: 0, boolean: 1, string: 2, null: 3, undefined: 4, set: 5 });
type LeafKind = (typeof LEAF)[keyof typeof LEAF];

/** A container's class, so the page builds a missing one as the Worker's was built. */
export const CONTAINER = Object.freeze({ object: 0, array: 1, vector3: 2 });
type ContainerKind = (typeof CONTAINER)[keyof typeof CONTAINER];

/** One hull's schema: each leaf's path (its parent's path, then its key) and kind, in walk order. */
export interface MirrorSchema {
  readonly hash: number;
  /** Per leaf: the index of its parent in `parents` and its key. */
  readonly leafParent: readonly number[];
  readonly leafKey: readonly (string | number)[];
  readonly leafKind: readonly LeafKind[];
  /** Per parent: its own parent (-1 for the hull) and its key there, and its container class. */
  readonly parentOf: readonly number[];
  readonly parentKey: readonly (string | number)[];
  readonly parentKind: readonly ContainerKind[];
}

/** The hull's objects the mirror walks (each a root under the hull), besides the hull's own scalar fields. */
export const MIRROR_ROOTS = Object.freeze(['state', 'combat', 'consumables', 'aerial', 'specialAction', 'equip',
  'consumableItems', 'consumableReadyAt', 'modePhysics'] as const);
const ROOT_SET: ReadonlySet<string> = new Set(MIRROR_ROOTS);
const MAX_DEPTH = 6;

type Bag = Record<string | number, unknown>;

/** The interned strings: the Worker's table grows; new entries travel with the tick that first wrote them. */
export interface StringTable {
  id(value: string): number;
  /** Strings added since the last drain (the tick's message carries them). */
  drainAdded(): string[] | null;
}

export function createStringTable(): StringTable {
  const ids = new Map<string, number>();
  let added: string[] | null = null;
  return {
    id(value) {
      let id = ids.get(value);
      if (id === undefined) {
        id = ids.size;
        ids.set(value, id);
        (added ??= []).push(value);
      }
      return id;
    },
    drainAdded() { const out = added; added = null; return out; },
  };
}

const isVector3 = (value: object): boolean => (value as { isVector3?: boolean }).isVector3 === true;
const containerKindOf = (value: object): ContainerKind => (Array.isArray(value) || ArrayBuffer.isView(value)
  ? CONTAINER.array : isVector3(value) ? CONTAINER.vector3 : CONTAINER.object);

const hashString = (hash: number, text: string): number => {
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash;
};

/**
 * The Worker's side for one hull: each tick `write` walks it into `out` from `offset` (values only) and returns the leaf
 * count; `schemaChanged` says the shape moved since the last schema, which `schema()` then rebuilds (the tick carries it).
 */
export interface MirrorWriter {
  write(entity: object, out: Float64Array, offset: number, strings: StringTable): number;
  readonly schemaChanged: boolean;
  /** The schema of the shape the last `write` walked (call it straight after that write, on the same hull). */
  schema(entity: object): MirrorSchema;
  /** The Sets whose contents moved this tick: [leaf index, values] pairs, or null. */
  drainSets(): (number | unknown[])[] | null;
  /** The leaf count of the current schema. */
  readonly leaves: number;
}

const _seen = new Set<object>();

export function createMirrorWriter(): MirrorWriter {
  let schemaHash = 0;
  let leafCount = 0;
  let changed = true;
  let hash = 0;
  let cursor = 0;
  let target: Float64Array | null = null;
  let base = 0;
  let table: StringTable | null = null;
  const setSignatures: number[] = [];
  let setsMoved: (number | unknown[])[] | null = null;

  // hot-path: every Worker tick, every hull (no allocation while the shape holds)
  function leaf(value: unknown, key: string | number): void {
    if (typeof key === 'string') hash = hashString(hash, key); else hash = Math.imul(hash ^ (key + 7), 0x01000193);
    let kind: LeafKind;
    let number = 0;
    if (typeof value === 'number') { kind = LEAF.number; number = value; }
    else if (typeof value === 'boolean') { kind = LEAF.boolean; number = value ? 1 : 0; }
    else if (typeof value === 'string') { kind = LEAF.string; number = table!.id(value); }
    else if (value === null) kind = LEAF.null;
    else if (value === undefined) kind = LEAF.undefined;
    else {
      // a Set: its signature (size and members) on the wire; its members when it moved
      kind = LEAF.set;
      const set = value as Set<unknown>;
      let signature = set.size * 0x9e3779b1;
      for (const member of set) signature = typeof member === 'number' ? Math.imul(signature ^ (member * 31 + 1), 0x01000193)
        : typeof member === 'string' ? hashString(signature, member) : signature;
      number = signature;
      const index = cursor;
      if (setSignatures[index] !== signature) {
        setSignatures[index] = signature;
        (setsMoved ??= []).push(index, [...set]);
      }
    }
    hash = Math.imul(hash ^ (kind + 101), 0x01000193);
    if (target) target[base + cursor] = number;
    cursor++;
  }

  function walk(value: Bag, depth: number): void {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      const list = value as unknown as ArrayLike<unknown>;
      hash = Math.imul(hash ^ (list.length + 0x51), 0x01000193);
      for (let index = 0; index < list.length; index++) visit(list[index], index, depth);
      return;
    }
    for (const key in value) visit(value[key], key, depth);
  }

  function visit(value: unknown, key: string | number, depth: number): void {
    if (typeof value === 'function') return;
    if (value !== null && typeof value === 'object' && !(value instanceof Set)) {
      if (value instanceof Map || _seen.has(value) || depth >= MAX_DEPTH) return;
      _seen.add(value);
      if (typeof key === 'string') hash = hashString(hash, key); else hash = Math.imul(hash ^ (key + 7), 0x01000193);
      hash = Math.imul(hash ^ (containerKindOf(value) + 211), 0x01000193);
      walk(value as Bag, depth + 1);
      hash = Math.imul(hash ^ 0x7f, 0x01000193);
      return;
    }
    leaf(value, key);
  }

  function walkEntity(entity: Bag): void {
    _seen.clear();
    hash = 0x811c9dc5;
    cursor = 0;
    for (const key in entity) {
      const value = entity[key];
      if (ROOT_SET.has(key)) { visit(value, key, 0); continue; }
      if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') leaf(value, key);
    }
    _seen.clear();
  }

  return {
    write(entity, out, offset, strings) {
      table = strings;
      target = out;
      base = offset;
      walkEntity(entity as Bag);
      target = null;
      changed = hash !== schemaHash || cursor !== leafCount;
      return cursor;
    },
    get schemaChanged() { return changed; },
    get leaves() { return leafCount; },
    schema(entity) {
      // the same walk, recording each leaf's path (rare: a shape change)
      const leafParent: number[] = [], leafKey: (string | number)[] = [], leafKind: LeafKind[] = [];
      const parentOf: number[] = [], parentKey: (string | number)[] = [], parentKind: ContainerKind[] = [];
      const seen = new Set<object>();
      const record = (value: unknown, key: string | number, parent: number, depth: number): void => {
        if (typeof value === 'function') return;
        if (value !== null && typeof value === 'object' && !(value instanceof Set)) {
          if (value instanceof Map || seen.has(value) || depth >= MAX_DEPTH) return;
          seen.add(value);
          const index = parentOf.length;
          parentOf.push(parent); parentKey.push(key); parentKind.push(containerKindOf(value));
          if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            const list = value as unknown as ArrayLike<unknown>;
            for (let at = 0; at < list.length; at++) record(list[at], at, index, depth + 1);
          } else {
            for (const child in value as Bag) record((value as Bag)[child], child, index, depth + 1);
          }
          return;
        }
        leafParent.push(parent); leafKey.push(key);
        leafKind.push(typeof value === 'number' ? LEAF.number : typeof value === 'boolean' ? LEAF.boolean
          : typeof value === 'string' ? LEAF.string : value === null ? LEAF.null : value === undefined ? LEAF.undefined : LEAF.set);
      };
      const bag = entity as Bag;
      for (const key in bag) {
        const value = bag[key];
        if (ROOT_SET.has(key)) { record(value, key, -1, 0); continue; }
        if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') record(value, key, -1, 0);
      }
      schemaHash = hash;
      leafCount = leafKind.length;
      changed = false;
      setSignatures.length = 0;
      return { hash: schemaHash, leafParent, leafKey, leafKind, parentOf, parentKey, parentKind };
    },
    drainSets() { const out = setsMoved; setsMoved = null; return out; },
  };
}

/** The page's side for one hull: a schema compiled against the page's own objects, then each tick's values applied. */
export interface MirrorReader {
  readonly leaves: number;
  apply(entity: object, values: Float64Array, offset: number, strings: readonly string[]): void;
  applySets(entity: object, moved: readonly (number | unknown[])[]): void;
}

export function compileMirrorReader(entity: object, schema: MirrorSchema): MirrorReader {
  // each parent resolved (or built) once on the page's hull: the page never replaces the objects its battle made
  const parents: Bag[] = new Array(schema.parentOf.length);
  const resolve = (index: number): Bag => {
    if (parents[index]) return parents[index]!;
    const owner = schema.parentOf[index]! < 0 ? entity as Bag : resolve(schema.parentOf[index]!);
    const key = schema.parentKey[index]!;
    let value = owner[key];
    if (value === null || typeof value !== 'object') {
      const kind = schema.parentKind[index];
      value = kind === CONTAINER.vector3 ? new Vector3() : kind === CONTAINER.array ? [] : {};
      owner[key] = value;
    }
    parents[index] = value as Bag;
    return value as Bag;
  };
  for (let index = 0; index < schema.parentOf.length; index++) resolve(index);
  const leafOwners: Bag[] = schema.leafParent.map((parent) => (parent < 0 ? entity as Bag : parents[parent]!));
  const keys = schema.leafKey;
  const kinds = schema.leafKind;
  const count = kinds.length;
  return {
    leaves: count,
    // hot-path: every applied tick, every hull
    apply(_entity, values, offset, strings) {
      for (let index = 0; index < count; index++) {
        const value = values[offset + index]!;
        const owner = leafOwners[index]!;
        switch (kinds[index]) {
          case LEAF.number: owner[keys[index]!] = value; break;
          case LEAF.boolean: owner[keys[index]!] = value !== 0; break;
          case LEAF.string: owner[keys[index]!] = strings[value]; break;
          case LEAF.null: owner[keys[index]!] = null; break;
          case LEAF.undefined: if (owner[keys[index]!] !== undefined) owner[keys[index]!] = undefined; break;
          default: break;
        }
      }
    },
    applySets(_entity, moved) {
      for (let at = 0; at < moved.length; at += 2) {
        const index = moved[at] as number;
        const owner = leafOwners[index];
        if (!owner) continue;
        const members = moved[at + 1] as unknown[];
        const current = owner[keys[index]!];
        if (current instanceof Set) { current.clear(); for (const member of members) current.add(member); }
        else owner[keys[index]!] = new Set(members);
      }
    },
  };
}
