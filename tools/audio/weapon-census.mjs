#!/usr/bin/env node
// tools/audio/weapon-census.mjs — the census of every weapon the fleet fires, as the sound engine keys it
// (gun-reports-269). Walks every playable vehicle (its gun's mounts, by src/audio/weaponAudio.ts weaponMounts, and
// its roof and auxiliary stations), the Gun Game ladder and the AC-130's guns, and writes:
//   - src/audio/weaponCensus.generated.ts: the key union of every weapon fired (weaponAudio.ts FLEET_ROWS must cover it,
//     so a new weapon fails typecheck until it has a row), each vehicle's main-gun loader make and whether its loader
//     reaches a ready rack behind an armoured door (both read from vehicles/internalLayoutRegistry.ts, the fleet's
//     interior source of truth, so the audio chunk never imports the registry), and the keys of each vehicle's roof and
//     auxiliary stations (from vehicles/auxiliaryInventory.ts, so the audio chunk never imports the inventory);
//   - docs/audio-generation/weapon-census.md: the census by key and by vehicle.
//
//   node tools/audio/weapon-census.mjs [--check]
//
// --check writes nothing and exits 1 when either file is stale (weaponCensus.selftest.mjs runs the same comparison).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATED = join(ROOT, 'src', 'audio', 'weaponCensus.generated.ts');
const DOC = join(ROOT, 'docs', 'audio-generation', 'weapon-census.md');

/** The layout's autoloader forms → the loader make the reload choreography plays. An unknown form fails the census. */
const AUTOLOADER_MAKE = Object.freeze({
  azCarousel: 'carousel_az',
  // the BMP-3M Dragun's front autoloader is inferred from the Soviet carousel pattern
  inferredAutomaticLoader: 'carousel_az',
  mzBasket: 'basket_mz',
  unmannedTurretCarousel: 'carousel_unmanned',
  isolatedCarousel: 'carousel_unmanned',
  bustleConveyor: 'bustle',
  fourRoundBustleConveyor: 'bustle',
  fixedGunRamLoader: 'fixed_ram',
});
/** Ready racks the loader opens with a knee switch: a turret bustle or protected rack behind an armoured door. */
const DOOR_RACKS = new Set(['blowOffBustleRack', 'isolatedBlowOffBustleRack', 'hullAndBustleRacks', 'hullAndTurretReadyRacks', 'protectedReadyBins']);

export async function census() {
  await import('../../src/vehicles/authorityFleet.ts');
  const { TANK_SPECS, VISIBLE_TANK_IDS, RUNTIME_TANK_IDS } = await import('../../src/vehicles/specs.ts');
  const { auxiliaryCapabilities } = await import('../../src/vehicles/auxiliaryInventory.ts');
  const { internalLayoutFor } = await import('../../src/vehicles/internalLayoutRegistry.ts');
  const { GUN_GAME_WEAPONS, GUNSHIP_WEAPONS } = await import('../../src/sim/matchRuleset.ts');
  const { weaponMounts, stationMount, WEAPON_ROWS } = await import('../../src/audio/weaponAudio.ts');

  const ids = [...new Set([...VISIBLE_TANK_IDS, ...RUNTIME_TANK_IDS])].filter((id) => TANK_SPECS[id]).sort();
  const keys = new Map();
  const note = (key, where) => { if (!keys.has(key)) keys.set(key, []); keys.get(key).push(where); };
  const loaders = {};
  const doors = {};
  const vehicles = [];
  for (const id of ids) {
    const spec = TANK_SPECS[id];
    const layout = internalLayoutFor(id);
    const form = layout?.systems.autoloader?.form ?? null;
    if (form && !AUTOLOADER_MAKE[form]) throw new Error(`${id}: autoloader form '${form}' has no loader make (add it to AUTOLOADER_MAKE)`);
    if (form) loaders[id] = AUTOLOADER_MAKE[form];
    if (DOOR_RACKS.has(layout?.systems.ammoRack?.form)) doors[id] = true;
    const mounts = weaponMounts(spec.gun);
    for (const m of mounts) note(m.key, `${id} ${m.rounds.join(' / ')}`);
    const stations = (auxiliaryCapabilities(spec)?.guns ?? []).map((station) => ({ name: station.name, mm: station.caliberMm, key: stationMount(station.caliberMm).key }));
    for (const station of stations) note(station.key, `${id} station ${station.name}`);
    vehicles.push({ id, name: spec.name, nation: spec.nation, gunMm: spec.gun.caliberMm, mounts, stations, loader: loaders[id] ?? null, door: !!doors[id] });
  }
  for (const round of GUN_GAME_WEAPONS) for (const m of weaponMounts({ caliberMm: round.caliberMm, shells: [round] })) note(m.key, `Gun Game ${round.name}`);
  const gunship = { caliberMm: GUNSHIP_WEAPONS[0].caliberMm, shells: GUNSHIP_WEAPONS };
  for (const m of weaponMounts(gunship)) note(m.key, `AC-130 ${m.rounds.join(' / ')}`);
  return { keys, loaders, doors, vehicles, rows: WEAPON_ROWS };
}

const q = (s) => `'${s}'`;

export function renderGenerated({ keys, loaders, doors, vehicles }) {
  const sorted = [...keys.keys()].sort();
  const loaderLines = Object.keys(loaders).sort().map((id) => `  ${id}: ${q(loaders[id])},`);
  const doorLines = Object.keys(doors).sort().map((id) => `  ${id}: true,`);
  const stationLines = vehicles.filter((v) => v.stations.length)
    .map((v) => `  ${v.id}: [${[...new Set(v.stations.map((st) => st.key))].sort().map(q).join(', ')}],`);
  return `// Generated by tools/audio/weapon-census.mjs — do not edit by hand.
// Every weapon key the fleet fires (weaponAudio.ts weaponMounts over every playable vehicle's gun and stations, the
// Gun Game ladder and the AC-130's guns): weaponAudio.ts FLEET_ROWS must hold a row for each. The main gun's loader
// make and the ready-rack doors are projected from vehicles/internalLayoutRegistry.ts, the stations' keys from
// vehicles/auxiliaryInventory.ts.
import type { LoaderMake } from './weaponAudio.ts';

export type FleetWeaponKey =
${sorted.map((key) => `  | ${q(key)}`).join('\n')};

export const FLEET_WEAPON_KEYS: readonly FleetWeaponKey[] = [
${sorted.map((key) => `  ${q(key)},`).join('\n')}
];

/** The loader make of each autoloaded main gun (a vehicle not named loads by hand). */
export const MAIN_GUN_LOADER: Readonly<Record<string, LoaderMake>> = {
${loaderLines.join('\n')}
};

/** Vehicles whose loader opens an armoured ready-rack door for each round. */
export const READY_RACK_DOOR: Readonly<Record<string, true>> = {
${doorLines.join('\n')}
};

/** The keys of each vehicle's roof and auxiliary stations (a vehicle not named carries none). */
export const STATION_KEYS: Readonly<Record<string, readonly FleetWeaponKey[]>> = {
${stationLines.join('\n')}
};
`;
}

export function renderDoc({ keys, vehicles, rows }) {
  const lines = [];
  lines.push('# Weapon census (generated)', '');
  lines.push('Generated by `tools/audio/weapon-census.mjs` from the fleet\'s own specs; do not edit by hand. Every weapon a');
  lines.push('playable vehicle, the Gun Game ladder or the AC-130 fires, keyed as the sound engine keys it: bore class and');
  lines.push('ammunition construction (`src/audio/weaponAudio.ts` `WEAPON_ROWS`). Coaxial machine guns are not fired by the');
  lines.push('simulation; roof, loader and remote stations are. Loader makes come from `src/vehicles/internalLayoutRegistry.ts`.', '');
  lines.push('## By key', '');
  lines.push('| Key | Ordnance | Rifling | Barrel | Muzzle | Construction | Default loader | Close / own / interior / distant | Mounts |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const key of [...keys.keys()].sort()) {
    const row = rows[key];
    const banks = row ? [row.close, row.own ?? '—', row.interior ?? '—', row.far].map((id) => `\`${id}\``).join(' / ') : '**no row**';
    lines.push(`| \`${key}\` | ${row?.ordnance ?? '—'} | ${row?.rifling ?? '—'} | ${row?.barrel ?? '—'} | ${row?.brake ?? '—'} | ${row?.build ?? '—'} | ${row?.loader ?? '—'} | ${banks} | ${keys.get(key).length} |`);
  }
  lines.push('', '## By vehicle', '');
  lines.push('| Vehicle | Gun | Mounts (key: rounds) | Loader | Ready-rack door | Stations |');
  lines.push('|---|---|---|---|---|---|');
  for (const v of vehicles) {
    const mounts = v.mounts.map((m) => `\`${m.key}\`${m.throughGun ? ' (through the gun)' : ''}: ${m.rounds.join(', ')}`).join('<br>');
    const stations = v.stations.length ? v.stations.map((s) => `${s.mm} mm \`${s.key}\``).join(', ') : '—';
    lines.push(`| ${v.name} (\`${v.id}\`) | ${v.gunMm} mm | ${mounts} | ${v.loader ?? 'manual'} | ${v.door ? 'yes' : 'no'} | ${stations} |`);
  }
  lines.push('');
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await census();
  const generated = renderGenerated(result);
  const doc = renderDoc(result);
  const missing = [...result.keys.keys()].filter((key) => !result.rows[key]);
  if (process.argv.includes('--check')) {
    const stale = [[GENERATED, generated], [DOC, doc]].filter(([file, text]) => !existsSync(file) || readFileSync(file, 'utf8') !== text);
    for (const [file] of stale) console.error(`stale: ${file} (run node tools/audio/weapon-census.mjs)`);
    process.exit(stale.length ? 1 : 0);
  }
  writeFileSync(GENERATED, generated);
  writeFileSync(DOC, doc);
  console.log(`weapon census: ${result.vehicles.length} vehicles, ${result.keys.size} keys (${[...result.keys].map(([k, w]) => `${k}×${w.length}`).join(' ')})`
    + `; ${Object.keys(result.loaders).length} autoloaded main guns, ${Object.keys(result.doors).length} ready-rack doors`
    + (missing.length ? `; NO ROW for ${missing.join(', ')} (typecheck fails until weaponAudio.ts has them)` : ''));
}
