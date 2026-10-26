// The riding parts' wire (UI-LOCKDOWN E, 2026-10-25): the riding-parts worker (ridingPartsWorker.ts) posts the entries it
// builds into ridingPartsCache.ts's stores as transferable arrays, and the prebuild (ridingPartsPrebuild.ts) seeds them.
import type { RidingCradleFit } from './machineGunGeometry.ts';
import { addGeometryBuffers, geometryFrom, geometryWire, type GeometryWire } from './geometryWire.ts';
import { RIDING_CRADLE_PARTS, RIDING_STATION_PARTS } from './ridingPartsCache.ts';

/** The public fitting (KIT.fittings) that builds a key's entry, and the options it was built with (mats aside). */
export function ridingPartsSource(key: string): { readonly fitting: string; readonly options: Record<string, unknown> } | null {
  const at = key.indexOf('{');
  if (at < 0) return null;
  const prefix = key.slice(0, at);
  const fitting = prefix === '' ? 'pintleMG' : prefix === 'americanM2:' ? 'americanM2' : prefix === 'americanRws:' ? 'americanRws'
    : prefix === 'openYokeRws:' ? 'openYokeRws' : null;
  return fitting ? { fitting, options: JSON.parse(key.slice(at)) as Record<string, unknown> } : null;
}

/** One entry as a worker posts it: its slots' geometries as transferable arrays, and a cradle's fit. */
export interface RidingPartsWire {
  readonly key: string;
  readonly sets: readonly (readonly (readonly [string, readonly GeometryWire[]])[])[];
  readonly fit: RidingCradleFit | null;
}

/** A cached entry as a worker posts it (null when the key holds none). */
export function ridingPartsWire(key: string): RidingPartsWire | null {
  const cradle = RIDING_CRADLE_PARTS.get(key), station = cradle ? null : RIDING_STATION_PARTS.get(key);
  const slots = cradle?.parts ?? station;
  if (!slots) return null;
  return { key, sets: slots.map((set) => set.map(([slot, geos]) => [slot, geos.map((geometry) => geometryWire(geometry))] as const)),
    fit: cradle ? structuredClone(cradle.fit) : null };
}

/** The arrays a wire can hand over without a copy. */
export function ridingPartsTransfer(wire: RidingPartsWire): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const set of wire.sets) for (const [, geos] of set) for (const geometry of geos) addGeometryBuffers(geometry, buffers);
  return [...buffers];
}

/** Seed an entry a worker built; a key a build already filled keeps its own. Returns whether it was seeded. */
export function seedRidingParts(wire: RidingPartsWire): boolean {
  if (RIDING_CRADLE_PARTS.has(wire.key) || RIDING_STATION_PARTS.has(wire.key)) return false;
  const parts = wire.sets.map((set) => set.map(([slot, geos]) => [slot, geos.map((geometry) => geometryFrom(geometry))] as const));
  if (wire.fit) RIDING_CRADLE_PARTS.set(wire.key, { parts, fit: wire.fit });
  else RIDING_STATION_PARTS.set(wire.key, parts);
  return true;
}

/** Every key the caches hold (built in-line or seeded). */
export function ridingPartKeys(): string[] {
  return [...RIDING_CRADLE_PARTS.keys(), ...RIDING_STATION_PARTS.keys()];
}
