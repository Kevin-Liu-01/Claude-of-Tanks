// Child process of tools/changed-only/fingerprint.mjs: the roster, every per-id table row and each id's spec chain,
// read by importing the data modules only (no builder, no tank build). First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/rows-child.mjs <root>   -> JSON on stdout
//
// A row is the JSON of one id's entry as the module or file holds it (insertion order, so a reordered row is a changed
// row). A spec chain is every roster id named anywhere in an id's registered spec (visualBase, variantOf, donors,
// balance peers), followed transitively: over-inclusion only widens what a change marks.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expandGlobs } from './globs.mjs';
import { TABLES } from './steps.mjs';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '../..'));
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

process.stdout.write(JSON.stringify({ roster, rows, fileIds, chains, errors, root: relative(root, root) }));
