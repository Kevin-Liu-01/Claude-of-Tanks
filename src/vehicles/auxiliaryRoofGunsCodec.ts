// src/vehicles/auxiliaryRoofGunsCodec.ts — the roof-gun table's compact form (2026-10-16, the perf lane; 227: the table
// rides in the garage boot through combatAnatomy.ts, and it doubled in 226 and grows again with 227's new MG stations).
//
// A roof gun is a weapon body — its fitting name, calibre, muzzle, pivot, scale and collision parts, shared by every
// vehicle that mounts the same fitting — placed by a row: owner, position, rotation, and the station's own traverse
// limits. The compact form keeps each distinct body once and each row as a reference; the collision parts' corners go
// as integers of 1/10000 m when every one of them is exactly such a number. decodeAuxiliaryRoofGuns gives back the same
// record, key order and number (Object.is) for every vehicle; encodeAuxiliaryRoofGuns (tools/vehicle-controls-
// inventory.mjs) refuses any table it cannot give back so.
import type { AuxiliaryInventory } from './auxiliaryInventory.ts';

type RoofGun = AuxiliaryInventory['guns'][number];
/** [name, caliberMm, muzzle, pivot, scale (0: [1, 1, 1]), parts scale (1: integers of 1/10000 m, 0: as written),
 *  the parts' corners flat: minX, minY, minZ, maxX, maxY, maxZ per part] */
export type RoofGunBody = readonly [string, number, readonly number[], readonly number[], readonly number[] | 0, 0 | 1, readonly number[]];
/** [vehicle id, body index, owner (0 turret, 1 hull), position, rotation, yawArc?, depressionByYaw?] (trailing
 *  absent members omitted; a null keeps a later member's place) */
export type RoofGunRow = readonly [string, number, 0 | 1, readonly number[], readonly number[], (readonly number[] | null)?, (readonly (readonly number[])[])?];

const SCALE = 10_000;
const KEY_ORDER = ['collisionParts', 'name', 'owner', 'position', 'caliberMm', 'muzzle', 'pivot', 'scale', 'rotation', 'yawArc', 'depressionByYaw'] as const;
const UNIT_SCALE = [1, 1, 1];

const scaled = (value: number): number | null => {
  const n = Math.round(value * SCALE) + 0;
  return Number.isSafeInteger(n) && n / SCALE === value ? n : null;
};

/** The table back, every record as the inventory wrote it (fresh arrays per vehicle: no record shares one). */
export function decodeAuxiliaryRoofGuns(bodies: readonly RoofGunBody[], rows: readonly RoofGunRow[]): Readonly<Record<string, RoofGun>> {
  const out: Record<string, RoofGun> = {};
  for (const [id, index, owner, position, rotation, yawArc, depressionByYaw] of rows) {
    const [name, caliberMm, muzzle, pivot, scale, partsScale, corners] = bodies[index];
    const collisionParts: { min: number[]; max: number[] }[] = [];
    for (let i = 0; i < corners.length; i += 6) {
      const c = partsScale ? corners.slice(i, i + 6).map((n) => n / SCALE) : corners.slice(i, i + 6);
      collisionParts.push({ min: [c[0], c[1], c[2]], max: [c[3], c[4], c[5]] });
    }
    const gun: Record<string, unknown> = {
      collisionParts, name, owner: owner ? 'hull' : 'turret', position: [...position], caliberMm, muzzle: [...muzzle],
      pivot: [...pivot], scale: scale === 0 ? [...UNIT_SCALE] : [...scale], rotation: [...rotation],
    };
    if (yawArc) gun.yawArc = [...yawArc];
    if (depressionByYaw) gun.depressionByYaw = depressionByYaw.map((sample) => [...sample]);
    out[id] = gun as unknown as RoofGun;
  }
  return out;
}

/** The compact form of a roof-gun table; throws when the form would not give every record back exactly. */
export function encodeAuxiliaryRoofGuns(table: Readonly<Record<string, RoofGun>>): { bodies: RoofGunBody[]; rows: RoofGunRow[] } {
  const bodies: RoofGunBody[] = [];
  const index = new Map<string, number>();
  const rows: RoofGunRow[] = [];
  for (const [id, gun] of Object.entries(table)) {
    const keys = Object.keys(gun);
    const order = KEY_ORDER.filter((key) => key in gun);
    if (keys.join() !== order.join()) throw new Error(`${id}: roof gun keys ${keys.join()} are not the compact form's order`);
    if (gun.owner !== 'turret' && gun.owner !== 'hull') throw new Error(`${id}: roof gun owner ${String(gun.owner)}`);
    const flat = (gun.collisionParts ?? []).flatMap((part) => [...part.min, ...part.max]);
    const ints = flat.map(scaled);
    const exact = ints.every((n) => n !== null);
    const unit = gun.scale.length === 3 && gun.scale.every((n) => Object.is(n, 1));
    const body: RoofGunBody = [gun.name, gun.caliberMm, [...gun.muzzle], [...gun.pivot], unit ? 0 : [...gun.scale], exact ? 1 : 0,
      exact ? ints as number[] : flat];
    const key = JSON.stringify(body);
    let at = index.get(key);
    if (at === undefined) { at = bodies.length; bodies.push(body); index.set(key, at); }
    const row: unknown[] = [id, at, gun.owner === 'hull' ? 1 : 0, [...gun.position], [...gun.rotation]];
    if (gun.depressionByYaw) row.push(gun.yawArc ? [...gun.yawArc] : null, gun.depressionByYaw.map((sample) => [...sample]));
    else if (gun.yawArc) row.push([...gun.yawArc]);
    rows.push(row as unknown as RoofGunRow);
  }
  const back = decodeAuxiliaryRoofGuns(bodies, rows);
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a, (_k, v) => (Object.is(v, -0) ? '-0' : v))
    === JSON.stringify(b, (_k, v) => (Object.is(v, -0) ? '-0' : v));
  if (!same(back, table)) {
    const id = Object.keys(table).find((key) => !same(back[key], table[key]));
    throw new Error(`the compact roof-gun table does not give ${id} back exactly`);
  }
  return { bodies, rows };
}

/** The generated module's source for a roof-gun table (tools/vehicle-controls-inventory.mjs writes and checks it). */
export function auxiliaryRoofGunsModuleSource(table: Readonly<Record<string, RoofGun>>): string {
  const { bodies, rows } = encodeAuxiliaryRoofGuns(table);
  return '// Generated by tools/vehicle-controls-inventory.mjs: each vehicle\'s first roof gun when it has collision parts.\n'
    + '// Combat anatomy reads this table; the battle path keeps the full mount geometry in src/vehicles/auxiliaryInventory.generated.ts.\n'
    + '// Compact form (auxiliaryRoofGunsCodec.ts): each distinct weapon body once, each vehicle a row placing one.\n'
    + 'import type { RoofGunBody, RoofGunRow } from \'./auxiliaryRoofGunsCodec.ts\';\n'
    + 'import { decodeAuxiliaryRoofGuns } from \'./auxiliaryRoofGunsCodec.ts\';\n'
    + `const BODIES: readonly RoofGunBody[] = ${JSON.stringify(bodies)};\n`
    + `const ROWS: readonly RoofGunRow[] = ${JSON.stringify(rows)};\n`
    + 'export const AUXILIARY_ROOF_GUNS = decodeAuxiliaryRoofGuns(BODIES, ROWS);\n';
}
