// Saved tank ids follow the id renames (SSOT 2.19, ID.03).
//
// Browser storage written before a rename holds that schema's ids: the last
// tank, the per-nation garage choice, per-tank camouflage, custom paint and
// loadouts (their keys carry the id), the profile's last battle and the
// Service Record. One pass at boot, before any reader, rewrites them into this
// build's ids and stamps `cot.tankIds.schema`. The stamp is written even when a
// write fails, so no value is ever renamed twice (a swap would turn it back).
// Studio slots carry their own `tankIdSchema` and resolve when loaded.

import { TANK_IDS, type TankIdResolver } from '../vehicles/tankIdAliases.ts';

export const TANK_ID_STORAGE_SCHEMA_KEY = 'cot.tankIds.schema';

/** Keys whose suffix is a tank id. */
const ID_KEYED_PREFIXES = Object.freeze(['cot.camo.', 'cot.camoCustom.v1.', 'cot.equip.']);
const LAST_TANK_KEY = 'cot.lastTank.v1';
const NATION_TANK_KEY = 'cot.garage.nationTank.v1';
const PROFILE_KEY = 'cot.profile.v2';
const SERVICE_KEY = 'cot.service.v1';

interface MigrationStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface MigrationResult {
  from: number;
  to: number;
  /** Keys written or removed. */
  changed: string[];
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** The pending writes (key -> value, null = remove) for one storage, without touching it. */
export function planTankIdStorageMigration(
  storage: MigrationStorage,
  resolver: TankIdResolver = TANK_IDS,
): { from: number; writes: Map<string, string | null> } {
  const from = resolver.schemaOf(storage.getItem(TANK_ID_STORAGE_SCHEMA_KEY));
  const writes = new Map<string, string | null>();
  if (from >= resolver.schema) return { from, writes };
  const id = (value: unknown): unknown => (typeof value === 'string' && value ? resolver.resolve(value, from) : value);

  // Keys that carry an id move together: all sources are read before any
  // target is written, so a swap (a -> b, c -> a) never loses a value.
  const moves: [string, string, string][] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    const prefix = ID_KEYED_PREFIXES.find((p) => key.startsWith(p));
    if (!prefix) continue;
    const next = prefix + String(id(key.slice(prefix.length)));
    const value = storage.getItem(key);
    if (next !== key && value !== null) moves.push([key, next, value]);
  }
  for (const [source] of moves) writes.set(source, null);
  for (const [, target, value] of moves) writes.set(target, value);

  const lastTank = storage.getItem(LAST_TANK_KEY);
  if (lastTank && id(lastTank) !== lastTank) writes.set(LAST_TANK_KEY, String(id(lastTank)));

  const nations = parse(storage.getItem(NATION_TANK_KEY));
  if (isRecord(nations)) {
    const next = Object.fromEntries(Object.entries(nations).map(([nation, specId]) => [nation, id(specId)]));
    if (JSON.stringify(next) !== JSON.stringify(nations)) writes.set(NATION_TANK_KEY, JSON.stringify(next));
  }

  const profile = parse(storage.getItem(PROFILE_KEY));
  if (isRecord(profile) && isRecord(profile.lastBattle)) {
    const before = JSON.stringify(profile);
    profile.lastBattle.vehicleId = id(profile.lastBattle.vehicleId);
    if (JSON.stringify(profile) !== before) writes.set(PROFILE_KEY, JSON.stringify(profile));
  }

  const service = parse(storage.getItem(SERVICE_KEY));
  if (isRecord(service)) {
    const before = JSON.stringify(service);
    if (Array.isArray(service.vehicles)) service.vehicles = service.vehicles.map(id);
    if (Array.isArray(service.history)) {
      for (const battle of service.history) {
        if (!isRecord(battle)) continue;
        battle.vehicleId = id(battle.vehicleId);
        if (Array.isArray(battle.trace)) for (const step of battle.trace) if (isRecord(step)) step.specId = id(step.specId);
      }
    }
    if (JSON.stringify(service) !== before) writes.set(SERVICE_KEY, JSON.stringify(service));
  }
  return { from, writes };
}

/** Rewrite stored tank ids into this build's schema once; a no-op when already current or storage is unavailable. */
export function migrateStoredTankIds(
  storage: MigrationStorage | null | undefined,
  resolver: TankIdResolver = TANK_IDS,
): MigrationResult {
  const result: MigrationResult = { from: resolver.schema, to: resolver.schema, changed: [] };
  if (!storage) return result;
  let plan: ReturnType<typeof planTankIdStorageMigration>;
  try { plan = planTankIdStorageMigration(storage, resolver); } catch { return result; }
  result.from = plan.from;
  if (plan.from >= resolver.schema) return result;
  try {
    for (const [key, value] of plan.writes) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      result.changed.push(key);
    }
  } catch {
    // Quota or a revoked storage: keep what landed; the stamp below stops a second pass.
  } finally {
    try { storage.setItem(TANK_ID_STORAGE_SCHEMA_KEY, String(resolver.schema)); } catch { /* session-only */ }
  }
  return result;
}
