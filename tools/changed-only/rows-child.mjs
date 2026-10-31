// Child process of tools/changed-only/fingerprint.mjs: the roster, every per-id table row and each id's spec chain,
// read by importing the data modules only (no builder, no tank build). First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/rows-child.mjs <root> [<step table module>]   -> JSON on stdout
//
// A row is the JSON of one id's entry as the module or file holds it (insertion order, so a reordered row is a changed
// row). A spec chain is every roster id named anywhere in an id's registered spec (visualBase, variantOf, donors,
// balance peers), followed transitively: over-inclusion only widens what a change marks.
// With steps.mjs BALANCE, each id's registered spec is two more rows: its combat leaves and the rest of it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { splitCombat } from './combat-fields.mjs';
import { expandGlobs } from './globs.mjs';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '../..'));
// The repository's step table, or a fixture's (tools/changed-only/table.mjs).
const { TABLES, WORLD_TABLES, MAP_REGISTRY_FILE, BALANCE, SPEC_COMBAT, SPEC_REST } = process.argv[3]
  ? await import(pathToFileURL(resolve(process.argv[3])).href) : await import('./steps.mjs');
const h16 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const load = (rel) => import(pathToFileURL(join(root, rel)).href);

await load('src/vehicles/fleetRegistration.ts');
const specs = await load('src/vehicles/specs.ts');
const { FLEET_GROUP_BY_ID } = await load('src/vehicles/fleetManifest.ts');
const aliases = await load('src/vehicles/tankIdAliases.ts');

const roster = {
  all: [...specs.ALL_TANK_IDS],
  saved: [...specs.SAVED_TANK_IDS],
  development: [...specs.DEVELOPMENT_TANK_IDS],
  groupById: { ...FLEET_GROUP_BY_ID },
  renames: aliases.TANK_ID_RENAMES,
  idSchema: aliases.TANK_ID_SCHEMA,
};

const rows = {}, fileIds = {}, errors = [];
for (const [name, table] of Object.entries(TABLES)) {
  rows[name] = {};
  {
    for (const file of expandGlobs(root, table.files)) {
      let data;
      try {
        if (table.kind === 'module') data = (await load(file))[table.exportName];
        else data = table.path.reduce((value, key) => value?.[key], JSON.parse(readFileSync(join(root, file), 'utf8')));
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ERR_MODULE_NOT_FOUND') continue;
        errors.push(`${name} ${file}: ${error.message}`);
        continue;
      }
      if (!data || typeof data !== 'object') { errors.push(`${name} ${file}: no ${table.exportName ?? table.path.join('.')}`); continue; }
      const ids = Object.keys(data);
      fileIds[file] = [...new Set([...(fileIds[file] ?? []), ...ids])];
      for (const id of ids) {
        if (Object.hasOwn(rows[name], id)) errors.push(`${name}: ${id} appears in more than one file`);
        rows[name][id] = h16(JSON.stringify(data[id]) ?? 'undefined');
      }
    }
  }
}

const known = new Set([...roster.saved, ...roster.all]);
// Each id's registered spec as two rows (steps.mjs BALANCE): its combat leaves and the rest. The balance pass reaches a
// tool only through these specs, so it is keyed here instead of in the shared core.
if (BALANCE) {
  rows[SPEC_COMBAT] = {};
  rows[SPEC_REST] = {};
  for (const id of [...known].sort()) {
    const spec = specs.TANK_SPECS[id];
    if (!spec) continue;
    const { combat, rest } = splitCombat(spec, BALANCE.combat);
    rows[SPEC_COMBAT][id] = h16(combat);
    rows[SPEC_REST][id] = h16(rest);
  }
}
const direct = {};
const scan = (value, out, depth = 0) => {
  if (typeof value === 'string') { if (known.has(value)) out.add(value); return; }
  if (!value || typeof value !== 'object' || depth > 16 || ArrayBuffer.isView(value)) return;
  if (Array.isArray(value)) { for (const item of value) scan(item, out, depth + 1); return; }
  for (const item of Object.values(value)) scan(item, out, depth + 1);
};
for (const id of known) {
  const out = new Set();
  scan(specs.TANK_SPECS[id], out);
  out.delete(id);
  direct[id] = [...out];
}
const chains = {};
for (const id of known) {
  const seen = new Set([id]), stack = [id];
  while (stack.length) for (const next of direct[stack.pop()] ?? []) if (!seen.has(next)) { seen.add(next); stack.push(next); }
  chains[id] = [...seen].sort();
}

// The world: map ids, each map's wreck donors and its rows in the world steps' tables (tools/changed-only/world.mjs).
let world = null;
if (WORLD_TABLES && MAP_REGISTRY_FILE && existsSync(join(root, MAP_REGISTRY_FILE))) {
  world = { mapIds: [], donors: {}, rows: {}, frames: {}, errors: [] };
  try {
    const registry = await load(MAP_REGISTRY_FILE);
    world.mapIds = [...registry.MAP_IDS];
    let roster = null;
    try { roster = await load('src/world/wreckRoster.ts'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
    const tables = {};
    for (const [name, table] of Object.entries(WORLD_TABLES)) {
      world.rows[name] = {};
      const file = join(root, table.file);
      if (!existsSync(file)) continue;
      if (table.kind === 'collision') {
        const index = JSON.parse(readFileSync(file, 'utf8'));
        const entries = table.path.reduce((value, key) => value?.[key], index) ?? {};
        for (const map of world.mapIds) {
          const shard = join(dirname(file), table.shard.replace('{map}', map));
          const bytes = existsSync(shard) ? createHash('sha256').update(readFileSync(shard)).digest('hex') : 'missing';
          if (entries[map] !== undefined || bytes !== 'missing') world.rows[name][map] = h16(`${JSON.stringify(entries[map] ?? null)}|${bytes}`);
        }
        // The frame: the index with each map's entry reduced to its key (the entries are the rows).
        world.frames[table.file] = h16(JSON.stringify({ ...index, maps: Object.keys(index.maps ?? {}),
          variants: Object.fromEntries(Object.entries(index.variants ?? {}).map(([variant, maps]) => [variant, Object.keys(maps)])) }));
      } else if (table.kind === 'wreckPlan') {
        const module = await load(table.file);
        const plan = module[table.exportName] ?? {}, variants = module[table.variantsExport] ?? {};
        tables.plan = { plan, variants };
        for (const map of world.mapIds) {
          const own = Object.keys(variants).filter((key) => key.startsWith(`${map}@`)).sort();
          if (plan[map] === undefined && !own.length) continue;
          world.rows[name][map] = h16(JSON.stringify({ desktop: plan[map] ?? null, variants: own.map((key) => [key, variants[key]]) }));
        }
        // The frame: the file without its row lines (`  <map>: [...],`).
        world.frames[table.file] = h16(readFileSync(file, 'utf8').split('\n').filter((line) => !/^ {2}(?:[a-z_][a-z0-9_]*|'[^']+'): \[/.test(line)).join('\n'));
      }
    }
    for (const map of world.mapIds) {
      const config = registry.getMapConfig(map);
      const named = new Set();
      scan(config, named);
      const props = config.props ?? {}, wrecks = props.tankWrecks;
      const count = wrecks ? (wrecks.count ?? 3) : (props.wrecks ?? 0);
      const era = (wrecks && wrecks.era) || 'ww2';
      const cast = count > 0 && roster ? [...new Set([...roster.resolveWreckRoster(era, wrecks?.ids), ...roster.resolveWreckRoster(era)])] : [];
      const { plan = {}, variants = {} } = tables.plan ?? {};
      const planned = new Set((plan[map] ?? []).map((row) => row[0]));
      for (const [key, rows] of Object.entries(variants)) if (key.startsWith(`${map}@`)) for (const row of rows) planned.add(row[0]);
      world.donors[map] = { plan: [...planned].sort(), named: [...named].sort(), cast: cast.sort(), wrecks: count };
    }
  } catch (error) {
    world.errors.push(String(error.stack ?? error.message).split('\n').slice(0, 3).join(' '));
  }
}

process.stdout.write(JSON.stringify({ roster, rows, fileIds, chains, errors, world, root: relative(root, root) }));
