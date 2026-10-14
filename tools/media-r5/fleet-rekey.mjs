#!/usr/bin/env node
// The media's tank-id-keyed files across a schema step (the coordinator, 2026-10-13; src/vehicles/tankIdAliases.ts).
// Every file here keyed by tank id outside a loader takes the rename table's maps in ONE pass, from the schema the
// files were written in:
// - the hull dims, the vehicle -> take map, the fleet roster's casts, the cast table;
// - the fleet index with its loops and posters, and the media manifest's records of them;
// - landedRenames first (schema 1 -> 2), then renames (2 -> 3), composed per id before anything is written, so a swap
//   (an id another vehicle gave up) never renames twice.
// tools/media-r5/tank-id-schema.json records the schema they are in (missing = 1). A step already taken changes
// nothing, and the fleet index carries tankIdSchema itself.
// Scene and shot files stay as written: they carry no stamp, load as schema 1 and resolve themselves.
//   node tools/media-r5/fleet-rekey.mjs --table=<rename-table.json> [--to=<schema>] [--dry]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The ids that move from schema `from` to schema `to`: steps[k] takes schema k+1 ids to schema k+2, composed per id. */
export function composeMoves(steps, from, to) {
  const maps = steps.slice(from - 1, to - 1), moved = new Map();
  // each map once, in order, on the spelling the step before left (the alias layer's resolve): a swap's two ids
  // never meet the same map twice
  const finalOf = (id) => maps.reduce((f, m) => (Object.hasOwn(m, f) ? m[f] : f), id);
  // an id written at `from` changes only at a step whose map names its spelling then, so every candidate is a map's key
  for (const m of maps) for (const id of Object.keys(m)) if (!moved.has(id) && finalOf(id) !== id) moved.set(id, finalOf(id));
  return moved;
}

/** An object keyed by tank id, its keys in one pass (two old keys landing on one new key are an error). */
export function rekeyKeys(obj, moved, label = 'object') {
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    const nk = moved.get(k) ?? k;
    if (Object.hasOwn(out, nk)) throw new Error(`${label}: ${k} -> ${nk} lands on a key already there`);
    out[nk] = v;
    if (nk !== k) n++;
  }
  return [out, n];
}

/** The fleet roster's takes: each hero and its casts. */
export function rekeyRoster(roster, moved) {
  let n = 0;
  const id = (v) => { const nv = moved.get(v) ?? v; if (nv !== v) n++; return nv; };
  const out = roster.map((take) => ({ ...take, ...(typeof take.hero === 'string' ? { hero: id(take.hero) } : {}),
    ...Object.fromEntries(['lineup', 'foes'].filter((k) => Array.isArray(take[k])).map((k) => [k, take[k].map(id)])) }));
  return [out, n];
}

/** cast.mjs: CAST's quoted ids (its keys are cast names) and CAST_NAMES' keys, whose rows take `nameOf(newId)`. */
export function rekeyCastText(text, moved, nameOf) {
  const block = (name) => { const i = text.indexOf(`export const ${name} = {`), j = text.indexOf('\n};', i); return i >= 0 && j > i ? [i, j] : null; };
  const cast = block('CAST'), names = block('CAST_NAMES');
  if (!cast || !names) throw new Error('cast.mjs: CAST or CAST_NAMES not found');
  const ids = [...moved.keys()].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!ids.length) return [text, 0];
  let n = 0;
  const quoted = new RegExp(`'(${ids.join('|')})'`, 'g');
  const keyed = new RegExp(`(^|[\\s{,])(${ids.join('|')})(\\s*:\\s*\\[)'[^']*'`, 'g');
  const castText = text.slice(cast[0], cast[1]).replace(quoted, (_, id) => { n++; return `'${moved.get(id)}'`; });
  const namesText = text.slice(names[0], names[1]).replace(keyed, (_, pre, id, colon) => {
    n++;
    return `${pre}${moved.get(id)}${colon}'${String(nameOf(moved.get(id))).replace(/'/g, "\\'")}'`;
  });
  return [text.slice(0, cast[0]) + castText + text.slice(cast[1], names[0]) + namesText + text.slice(names[1]), n];
}

/** The fleet index: its keys, its loops and posters (the files to rename with them), and its own stamp. */
export function rekeyFleetIndex(index, moved, to) {
  const [vehicles, n] = rekeyKeys(index.vehicles ?? {}, moved, 'fleet/index.json'), files = [];
  for (const [vehicle, entry] of Object.entries(vehicles)) {
    for (const kind of ['loop', 'poster']) {
      const url = entry[kind], m = url && /\/fleet\/([^/]+)\.(webm|jpg)$/.exec(url);
      if (m && m[1] !== vehicle) {
        files.push([`${m[1]}.${m[2]}`, `${vehicle}.${m[2]}`]);
        vehicles[vehicle] = { ...vehicles[vehicle], [kind]: url.replace(`/fleet/${m[1]}.${m[2]}`, `/fleet/${vehicle}.${m[2]}`) };
      }
    }
  }
  return [{ schemaVersion: index.schemaVersion, tankIdSchema: to, collection: index.collection, vehicles }, n, files];
}

/** The media manifest's records of the fleet's files: their paths and vehicles (bytes and hashes are the files'). */
export function rekeyManifest(manifest, moved) {
  let n = 0;
  const files = (manifest.files ?? []).map((file) => {
    const m = /^(.*\/fleet\/)([^/]+)(\.(?:webm|jpg))$/.exec(file.path ?? '');
    const vehicle = file.vehicle != null ? moved.get(file.vehicle) ?? file.vehicle : undefined;
    const path = m && moved.has(m[2]) ? `${m[1]}${moved.get(m[2])}${m[3]}` : file.path;
    if (path !== file.path || vehicle !== file.vehicle) n++;
    return { ...file, path, ...(vehicle !== undefined ? { vehicle } : {}) };
  });
  return [{ ...manifest, files }, n];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
  await import(join(ROOT, 'src/vehicles/tankFactory.ts'));
  const { TANK_SPECS } = await import(join(ROOT, 'src/vehicles/specs.ts'));
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.length ? v.join('=') : true];
  }));
  if (!args.table) throw new Error('usage: fleet-rekey.mjs --table=<rename-table.json> [--to=<schema>] [--dry]');
  const table = JSON.parse(readFileSync(args.table, 'utf8'));
  const RECORD = join(ROOT, 'tools/media-r5/tank-id-schema.json');
  const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : {};
  const from = Number(record.tankIdSchema ?? 1), to = Number(args.to ?? table.tankIdSchema ?? 2), dry = !!args.dry;
  const steps = [...(table.landedRenames ?? []), ...(table.renames && Object.keys(table.renames).length ? [table.renames] : [])];
  if (!(to >= 1 && to <= steps.length + 1)) throw new Error(`schema ${to}: the table reaches schema ${steps.length + 1}`);
  if (from >= to) {
    console.log(`fleet-rekey: the media's files are at schema ${from}; nothing to do for schema ${to}`);
    process.exit(0);
  }
  const moved = composeMoves(steps, from, to);
  for (const [old, now] of moved) if (!TANK_SPECS[now]) throw new Error(`${old} -> ${now}: not a spec in this tree (rebuild on the renamed tree)`);
  const report = [], writes = [], renames = [], rel = (p) => p.slice(ROOT.length + 1);
  const json = (path, data) => writes.push([path, `${JSON.stringify(data, null, 1)}\n`]);
  for (const name of ['hull-dims.json', 'vehicle-takes.json']) {
    const path = join(ROOT, 'tools/media-r5', name);
    if (!existsSync(path)) continue;
    const [out, n] = rekeyKeys(JSON.parse(readFileSync(path, 'utf8')), moved, name);
    report.push(`${rel(path)}: ${n} key${n === 1 ? '' : 's'}`);
    if (n) json(path, out);
  }
  const rosterPath = join(ROOT, 'tools/media-r5/fleet-roster.json');
  if (existsSync(rosterPath)) {
    const [out, n] = rekeyRoster(JSON.parse(readFileSync(rosterPath, 'utf8')), moved);
    report.push(`${rel(rosterPath)}: ${n} id${n === 1 ? '' : 's'}`);
    if (n) json(rosterPath, out);
  }
  const castPath = join(ROOT, 'tools/media-r5/cast.mjs');
  if (existsSync(castPath)) {
    const [out, n] = rekeyCastText(readFileSync(castPath, 'utf8'), moved, (id) => TANK_SPECS[id].name);
    report.push(`${rel(castPath)}: ${n} id${n === 1 ? '' : 's'}`);
    if (n) writes.push([castPath, out]);
  }
  const indexPath = join(ROOT, 'public/media/site50-r14/fleet/index.json');
  if (existsSync(indexPath)) {
    const [out, n, files] = rekeyFleetIndex(JSON.parse(readFileSync(indexPath, 'utf8')), moved, to);
    for (const [a, b] of files) renames.push([join(dirname(indexPath), a), join(dirname(indexPath), b)]);
    report.push(`${rel(indexPath)}: ${n} vehicle${n === 1 ? '' : 's'}, ${files.length} file${files.length === 1 ? '' : 's'}`);
    json(indexPath, out);
  }
  const manifestPath = join(ROOT, 'public/media/site50-r14/manifest.json');
  if (existsSync(manifestPath)) {
    const [out, n] = rekeyManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), moved);
    // a published file this pass rewrites (the fleet index) gets its byte and sha256 receipts anew; renamed files keep
    // theirs (the same bytes under a new name)
    const rewritten = new Map(writes.map(([path, text]) => [rel(path).replace(/^public\//, ''), text]));
    let receipts = 0;
    for (const file of out.files) {
      const text = rewritten.get(file.path);
      if (text === undefined) continue;
      file.bytes = Buffer.byteLength(text);
      file.sha256 = createHash('sha256').update(text).digest('hex');
      receipts++;
    }
    report.push(`${rel(manifestPath)}: ${n} record${n === 1 ? '' : 's'}, ${receipts} receipt${receipts === 1 ? '' : 's'}`);
    if (n || receipts) json(manifestPath, out);
  }
  console.log(`fleet-rekey: schema ${from} -> ${to}, ${moved.size} id${moved.size === 1 ? '' : 's'} move (${[...moved].slice(0, 6).map(([a, b]) => `${a} -> ${b}`).join(', ')}${moved.size > 6 ? ', ...' : ''})`);
  for (const line of report) console.log(`  ${line}`);
  if (dry) { console.log('  (dry run: nothing written)'); process.exit(0); }
  for (const [a, b] of renames) { if (existsSync(b)) throw new Error(`${rel(b)} exists`); renameSync(a, b); }
  for (const [path, text] of writes) writeFileSync(path, text);
  writeFileSync(RECORD, `${JSON.stringify({ tankIdSchema: to, table: table.generatedAt ?? null, files: ['tools/media-r5/hull-dims.json',
    'tools/media-r5/vehicle-takes.json', 'tools/media-r5/fleet-roster.json', 'tools/media-r5/cast.mjs', 'public/media/site50-r14/fleet/index.json',
    'public/media/site50-r14/manifest.json'] }, null, 1)}\n`);
  console.log(`  ${writes.length} file${writes.length === 1 ? '' : 's'} written, ${renames.length} renamed; ${rel(RECORD)} at schema ${to}`);
}
