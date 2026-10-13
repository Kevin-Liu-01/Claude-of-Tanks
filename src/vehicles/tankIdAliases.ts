// The tank id alias layer (SSOT 2.19, ID.03).
//
// Ids are renamed so they match the names shown in game (the owner,
// 2026-10-12). A rename can reuse an id another vehicle gave up (a "swap":
// leo2a6m was the Leopard 2A4 OTCO and becomes the Leopard 2A6M), so a bare id
// is only meaningful with the id schema it was written under. Every stored or
// sent id therefore carries `tankIdSchema`; anything without one is schema 1,
// the ids before the first rename, and resolves through each later rename map
// in order. Never apply a rename map to data already in the current schema.
//
// Boot-safe and dependency-free: the maps are small string tables and the
// functions are pure. Simulation, network and Node tools may import it.

/** The tank id schema this build writes. Bump it only by appending a rename map. */
export const TANK_ID_SCHEMA = 1;

/**
 * Append-only rename maps. `TANK_ID_RENAMES[k]` turns schema k+1 ids into
 * schema k+2 ids; an id it does not name keeps its spelling. A landed map is
 * never edited: a later rename appends another map and bumps the schema.
 */
export const TANK_ID_RENAMES: readonly Readonly<Record<string, string>>[] = Object.freeze([]);

/** The URL parameter that stamps a link's id schema (`/gallery?id=…&ids=2`). */
export const TANK_ID_SCHEMA_PARAM = 'ids';

export interface TankIdResolver {
  /** The schema this resolver writes. */
  readonly schema: number;
  /** A stamped schema as this build reads it: missing or malformed is 1; newer than this build reads as current. */
  schemaOf(value: unknown): number;
  /** An id written under `schema` (default 1) in this build's spelling. */
  resolve(id: string, schema?: unknown): string;
  /**
   * An id from a source with no stamp that is almost always current (a room
   * seat chosen on this build): current ids pass, a retired id resolves from
   * the last schema that had it.
   */
  resolveIncoming(id: string): string;
  /** True when no vehicle carries this id in the current schema any more. */
  isRetired(id: string): boolean;
  /**
   * The schema-1 spelling of a current id (itself for a vehicle added later).
   * Everything that hashes a vehicle id into its look or its name (decor
   * layout, texture seeds, AUTO camouflage, hull numbers, track shade, bot
   * names) hashes this, so a rename never changes how a vehicle looks.
   */
  originalOf(id: string): string;
  /** `{ tankIdSchema }` to spread into a record this build writes ({} while schema 1, where missing means 1). */
  stamp(): { tankIdSchema?: number };
  /** `ids=N` for a link this build writes ('' while schema 1). */
  linkParam(): string;
}

export function createTankIdResolver({
  schema, renames,
}: { schema: number; renames: readonly Readonly<Record<string, string>>[] }): TankIdResolver {
  if (!Number.isInteger(schema) || schema < 1) throw new RangeError(`tank id schema must be a positive integer: ${schema}`);
  if (renames.length !== schema - 1) {
    throw new RangeError(`tank id schema ${schema} needs ${schema - 1} rename maps, has ${renames.length}`);
  }
  // The last schema each retired id was valid in: an id renamed away by map k
  // and never spelled again by a later map.
  const retiredAt = new Map<string, number>();
  renames.forEach((map, k) => {
    for (const to of Object.values(map)) retiredAt.delete(to);
    for (const from of Object.keys(map)) if (!Object.values(map).includes(from)) retiredAt.set(from, k + 1);
  });
  const schemaOf = (value: unknown): number => {
    const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return 1;
    return Math.min(n, schema);
  };
  const resolve = (id: string, from: unknown = 1): string => {
    let out = String(id);
    for (let s = schemaOf(from); s < schema; s += 1) out = renames[s - 1]![out] ?? out;
    return out;
  };
  const inverses = renames.map((map) => new Map(Object.entries(map).map(([from, to]) => [to, from])));
  const originalOf = (id: string): string => {
    let out = String(id);
    for (let k = inverses.length - 1; k >= 0; k -= 1) out = inverses[k]!.get(out) ?? out;
    return out;
  };
  return Object.freeze({
    schema,
    schemaOf,
    resolve,
    resolveIncoming: (id: string) => (retiredAt.has(id) ? resolve(id, retiredAt.get(id)) : id),
    isRetired: (id: string) => retiredAt.has(id),
    originalOf,
    stamp: () => (schema > 1 ? { tankIdSchema: schema } : {}),
    linkParam: () => (schema > 1 ? `${TANK_ID_SCHEMA_PARAM}=${schema}` : ''),
  });
}

/** This build's resolver over the landed rename maps. */
export const TANK_IDS = createTankIdResolver({ schema: TANK_ID_SCHEMA, renames: TANK_ID_RENAMES });

/** An id written under `schema` (missing = 1) in this build's spelling. */
export function resolveTankId(id: string, schema?: unknown): string {
  return TANK_IDS.resolve(id, schema);
}

/** The id a vehicle's look and name are seeded from: its schema-1 spelling, stable across renames. */
export function tankSeedId(id: string): string {
  return TANK_IDS.originalOf(id);
}
