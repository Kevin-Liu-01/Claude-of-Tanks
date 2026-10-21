#!/usr/bin/env node
// Interior fills --check: measure ids into a scratch directory with the generator's own code and flags, then compare each
// id's record (and its moving-clearance cells) with the committed one. Writes nothing in the tree.
// First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/fills-check.mjs --voxel=0.025 --cell=2 --rounds=8 --min-fine=1 --ids=a,b | --all [--jobs=4] [--root=<tree>]
//
// gen-interior-fills.mjs measures and writes in one pass; this wrapper runs it with --out-dir/--loader under a scratch
// directory (the clearance cells land beside the scratch shards), so the generator's code stays byte-identical and its
// changed-only key does not move. A record compares by its JSON, which the generator's serializer writes one-to-one
// (fixed field order, numbers printed by JavaScript), so equal JSON is an equal shard line.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(value('root') ?? resolve(import.meta.dirname, '../..'));
const jobs = Math.max(1, Number(value('jobs') ?? 1) | 0);
// Everything except the scope, the scratch paths and this wrapper's own options goes to the generator unchanged.
const OWN = /^--(?:ids|all|jobs|root|out-dir|loader|clearance-air|merge-from|stats)(?:=|$)/;
const passThrough = args.filter((arg) => !OWN.test(arg));
for (const required of ['voxel', 'cell', 'rounds', 'min-fine']) {
  if (!passThrough.some((arg) => arg.startsWith(`--${required}=`))) throw new Error(`fills-check: pass --${required}= explicitly (the canonical release flags)`);
}

const { FLEET_GROUP_BY_ID } = await import(pathToFileURL(join(root, 'src/vehicles/fleetManifest.ts')).href);
const idsArg = value('ids');
const ids = args.includes('--all') || idsArg === 'all' ? Object.keys(FLEET_GROUP_BY_ID).sort()
  : [...new Set((idsArg ?? '').split(',').filter(Boolean))].sort();
if (!ids.length) throw new Error('fills-check: pass --ids=a,b or --all');
for (const id of ids) if (!Object.hasOwn(FLEET_GROUP_BY_ID, id)) throw new Error(`fills-check: unknown id ${id}`);

const scratch = mkdtempSync(join(tmpdir(), 'cot-fills-check-'));
const parts = Math.min(jobs, ids.length);
const lists = Array.from({ length: parts }, () => []);
ids.forEach((id, index) => lists[index % parts].push(id));
const run = (list, k) => new Promise((done) => {
  const dir = join(scratch, `part${k}`);
  const child = execFile(process.execPath, ['--max-old-space-size=4096', join(root, 'tools/gen-interior-fills.mjs'), ...passThrough,
    `--ids=${list.join(',')}`, `--out-dir=${dir}`, `--loader=${join(dir, 'loader.ts')}`],
  { cwd: root, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' } }, (error, stdout, stderr) => done({ error, stderr, dir }));
  child.on('spawn', () => console.log(`[fills-check] part ${k}: ${list.length} id(s), pid ${child.pid}`));
});
const results = await Promise.all(lists.map(run));
for (const result of results) if (result.error) {
  console.error(String(result.stderr).split('\n').slice(-12).join('\n'));
  throw new Error(`fills-check: a measuring part failed (${result.error.message.split('\n')[0]})`);
}

const shards = async (dir) => {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.generated.ts')).sort()) {
    const records = (await import(pathToFileURL(join(dir, name)).href)).INTERIOR_FILLS;
    for (const [id, record] of Object.entries(records)) out[id] = record;
  }
  return out;
};
const clearance = (file) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).tanks ?? {} : {};
const committed = await shards(join(root, 'src/vehicles/interiorFillGroups'));
const committedAir = clearance(join(root, 'docs/geometry-gate/moving-clearance-air.json'));
const measured = {}, measuredAir = {};
for (const { dir } of results) {
  Object.assign(measured, await shards(dir));
  Object.assign(measuredAir, clearance(join(dir, 'moving-clearance-air.json')));
}

const stale = [];
for (const id of ids) {
  const why = [];
  if (!measured[id]) why.push('not measured');
  else if (JSON.stringify(measured[id]) !== JSON.stringify(committed[id] ?? null)) why.push(committed[id] ? 'fill record differs' : 'no committed record');
  if (JSON.stringify(measuredAir[id] ?? null) !== JSON.stringify(committedAir[id] ?? null)) why.push('moving-clearance cells differ');
  if (why.length) stale.push(`${id} (${why.join(', ')})`);
}
if (stale.length) {
  console.error(`[fills-check] ${stale.length} of ${ids.length} id(s) stale; regenerate with tools/gen-interior-fills.mjs ${passThrough.join(' ')} --ids=<ids>:\n  ${stale.join('\n  ')}`);
  process.exitCode = 1;
} else console.log(`[fills-check] PASS: ${ids.length} id(s) match their committed fills and clearance cells (scratch ${scratch})`);
