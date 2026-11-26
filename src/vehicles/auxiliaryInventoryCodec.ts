// src/vehicles/auxiliaryInventoryCodec.ts — the auxiliary inventory's compact form (host-fleet-bytes-278).
//
// The inventory rides in every battle and in the host Worker, where it was 424 kB of the Worker's 2.94 MB: each smoke
// tube and roof gun written as a keyed object, the same launcher set and weapon body repeated on every variant that
// shares them. The compact form keeps each distinct smoke set once (a set whose second half is its first mirrored in x
// keeps only the first half), each distinct weapon body once (auxiliaryRoofGunsCodec.ts's bodies and rows, starting
// from the roof-gun table's own bodies, which every battle and the Worker load beside it, so neither repeats one), and
// coordinates as integers of 1/10000 m where every one is exactly such a number. decodeAuxiliaryInventory gives back the
// same record, key order and number (Object.is) for every vehicle, in fresh arrays; encodeAuxiliaryInventory
// (tools/vehicle-controls-inventory.mjs) refuses any table it cannot give back so.
import type { AuxiliaryInventory } from './auxiliaryInventory.ts';
import { decodeAuxiliaryRoofGuns, encodeAuxiliaryRoofGuns, type RoofGunBody, type RoofGunRow } from './auxiliaryRoofGunsCodec.ts';

/** [owner (0 turret, 1 hull, or one digit per tube), mirrored (1: the tubes listed, then each mirrored in x), scale (1:
 *  integers of 1/10000 m, 0: as written), position and direction flat per tube: px, py, pz, dx, dy, dz] */
export type SmokeSet = readonly [number | string, 0 | 1, 0 | 1, readonly number[]];
/** a roof-gun row without its vehicle id: [body index, owner, position, rotation, yawArc?, depressionByYaw?] */
export type GunRow = RoofGunRow extends readonly [string, ...infer Rest] ? Readonly<Rest> : never;
/** [vehicle id, turret pivot (integers of 1/10000 m, or [the numbers as written], or 0: none), smoke set index (-1:
 *  none), lights (0|1), roof gun count (its rows follow the previous vehicle's in GUNS)] */
export type InventoryRow = readonly [string, readonly number[] | readonly [readonly number[]] | 0, number, 0 | 1, number];

const SCALE = 10_000;
const OWNER = ['turret', 'hull'] as const;
const scaled = (value: number): number | null => {
  const n = Math.round(value * SCALE) + 0;
  return Number.isSafeInteger(n) && Object.is(n / SCALE, value) ? n : null;
};
/** [1, integers] when every number is an exact integer of 1/10000, else [0, the numbers as written] */
const pack = (values: readonly number[]): [0 | 1, number[]] => {
  const ints = values.map(scaled);
  return ints.every((n) => n !== null) ? [1, ints as number[]] : [0, [...values]];
};

/** The table back, every record as the inventory wrote it (fresh arrays per vehicle: no record shares one). */
export function decodeAuxiliaryInventory(smokeSets: readonly SmokeSet[], bodies: readonly RoofGunBody[], guns: readonly GunRow[],
  rows: readonly InventoryRow[]): Readonly<Record<string, AuxiliaryInventory>> {
  const out: Record<string, AuxiliaryInventory> = {};
  let next = 0;
  for (const [id, pivot, smokeIndex, lights, gunCount] of rows) {
    const record: Record<string, unknown> = {};
    if (pivot !== 0) record.turretPivot = Array.isArray(pivot[0]) ? [...pivot[0] as readonly number[]] : (pivot as readonly number[]).map((n) => n / SCALE);
    const smoke: { owner: string; position: number[]; direction: number[] }[] = [];
    if (smokeIndex >= 0) {
      const [owner, mirrored, scale, flat] = smokeSets[smokeIndex];
      const values = scale ? flat.map((n) => n / SCALE) : flat;
      const tubes = values.length / 6;
      for (let pass = 0; pass <= mirrored; pass++) for (let i = 0; i < tubes; i++) {
        const v = values.slice(i * 6, i * 6 + 6);
        if (pass) { v[0] = -v[0]; v[3] = -v[3]; }
        smoke.push({ owner: OWNER[typeof owner === 'string' ? +owner[i] : owner], position: [v[0], v[1], v[2]], direction: [v[3], v[4], v[5]] });
      }
    }
    record.smoke = smoke;
    const gunRows: RoofGunRow[] = guns.slice(next, next + gunCount).map((row, i) => [`${i}`, ...row] as unknown as RoofGunRow);
    next += gunCount;
    record.guns = Object.values(decodeAuxiliaryRoofGuns(bodies, gunRows));
    record.lights = !!lights;
    out[id] = record as unknown as AuxiliaryInventory;
  }
  return out;
}

/** The roof-gun table the inventory implies: each vehicle's first roof gun when it has collision parts (the damageable
 *  external module combat anatomy reads; tools/vehicle-controls-inventory.mjs writes it from the same rows). */
export function roofGunTableOf(table: Readonly<Record<string, AuxiliaryInventory>>): Record<string, AuxiliaryInventory['guns'][number]> {
  return Object.fromEntries(Object.entries(table).filter(([, kit]) => kit.guns[0]?.collisionParts?.length).map(([id, kit]) => [id, kit.guns[0]]));
}

const mirrorsInX = (flat: readonly number[]): boolean => {
  const half = flat.length / 2;
  if (!flat.length || half % 6) return false;
  for (let i = 0; i < half; i++) {
    const axis = i % 6;
    if (!Object.is(flat[half + i], axis === 0 || axis === 3 ? -flat[i] : flat[i])) return false;
  }
  return true;
};

/** The compact form of an inventory table; throws when the form would not give every record back exactly. */
export function encodeAuxiliaryInventory(table: Readonly<Record<string, AuxiliaryInventory>>): {
  smokeSets: SmokeSet[]; roofBodies: RoofGunBody[]; bodies: RoofGunBody[]; guns: GunRow[]; rows: InventoryRow[];
} {
  const roofBodies = encodeAuxiliaryRoofGuns(roofGunTableOf(table)).bodies;
  const smokeSets: SmokeSet[] = [];
  const smokeIndex = new Map<string, number>();
  const gunTable: Record<string, AuxiliaryInventory['guns'][number]> = {};
  const rows: InventoryRow[] = [];
  for (const [id, record] of Object.entries(table)) {
    let pivot: InventoryRow[1] = 0;
    if (record.turretPivot) {
      const [exact, values] = pack(record.turretPivot);
      pivot = exact ? values : [values];
    }
    let index = -1;
    if (record.smoke.length) {
      const owners = record.smoke.map((tube) => OWNER.indexOf(tube.owner));
      if (owners.some((o) => o < 0)) throw new Error(`${id}: smoke owner ${record.smoke.map((t) => t.owner).join()}`);
      let flat = record.smoke.flatMap((tube) => [...tube.position, ...tube.direction]);
      let owner: number | string = owners.every((o) => o === owners[0]) ? owners[0] : owners.join('');
      let mirrored: 0 | 1 = 0;
      if (typeof owner === 'number' && mirrorsInX(flat)) { flat = flat.slice(0, flat.length / 2); mirrored = 1; }
      const [scale, values] = pack(flat);
      const set: SmokeSet = [owner, mirrored, scale, values];
      const key = JSON.stringify(set);
      index = smokeIndex.get(key) ?? -1;
      if (index < 0) { index = smokeSets.length; smokeSets.push(set); smokeIndex.set(key, index); }
    }
    record.guns.forEach((gun, i) => { gunTable[`${id}\u0000${i}`] = gun; });
    rows.push([id, pivot, index, record.lights ? 1 : 0, record.guns.length]);
  }
  const { bodies, rows: gunRows } = encodeAuxiliaryRoofGuns(gunTable, roofBodies);
  const guns = gunRows.map(([, ...rest]) => rest as unknown as GunRow);
  const back = decodeAuxiliaryInventory(smokeSets, bodies, guns, rows);
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a, (_k, v) => (Object.is(v, -0) ? '-0' : v))
    === JSON.stringify(b, (_k, v) => (Object.is(v, -0) ? '-0' : v));
  if (Object.keys(back).join() !== Object.keys(table).join()) throw new Error('the compact inventory does not keep the vehicle order');
  for (const id of Object.keys(table)) {
    if (!same(back[id], table[id])) throw new Error(`the compact inventory does not give ${id} back exactly`);
  }
  return { smokeSets, roofBodies, bodies, guns, rows };
}

/** The generated module's source for an inventory table (tools/vehicle-controls-inventory.mjs writes and checks it). */
export function auxiliaryInventoryModuleSource(table: Readonly<Record<string, AuxiliaryInventory>>): string {
  const { smokeSets, roofBodies, bodies, guns, rows } = encodeAuxiliaryInventory(table);
  return '// Generated from authored fittings by tools/vehicle-controls-inventory.mjs.\n'
    + '// Compact form (auxiliaryInventoryCodec.ts): each distinct smoke set and weapon body once, each vehicle a row.\n'
    + 'import type { AuxiliaryInventory } from \'./auxiliaryInventory.ts\';\n'
    + 'import type { RoofGunBody } from \'./auxiliaryRoofGunsCodec.ts\';\n'
    + 'import { AUXILIARY_ROOF_GUN_BODIES } from \'./auxiliaryRoofGuns.generated.ts\';\n'
    + 'import { decodeAuxiliaryInventory, type GunRow, type InventoryRow, type SmokeSet } from \'./auxiliaryInventoryCodec.ts\';\n'
    + `const SMOKE: readonly SmokeSet[] = ${JSON.stringify(smokeSets)};\n`
    + '// the roof-gun table\'s bodies, then the stations it does not hold\n'
    + `const EXTRA_BODIES: readonly RoofGunBody[] = ${JSON.stringify(bodies.slice(roofBodies.length))};\n`
    + 'const BODIES: readonly RoofGunBody[] = [...AUXILIARY_ROOF_GUN_BODIES, ...EXTRA_BODIES];\n'
    + `const GUNS: readonly GunRow[] = ${JSON.stringify(guns)};\n`
    + `const ROWS: readonly InventoryRow[] = ${JSON.stringify(rows)};\n`
    + 'export const AUXILIARY_INVENTORY: Readonly<Record<string, AuxiliaryInventory>> = decodeAuxiliaryInventory(SMOKE, BODIES, GUNS, ROWS);\n';
}
