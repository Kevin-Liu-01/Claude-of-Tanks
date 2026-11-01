#!/usr/bin/env node
// Move the files named after a tank id when the id is renamed (SSOT 2.19, ID.04/05).
//
//   node tools/tank-id-move-files.mjs --apply --schema=3     (or --dry-run; --table=<rename-table.json> replaces the map)
//
// Renames, for every old id of the schema's map, the icon views
// public/icons/<id>_<view>.<ext>, the thumbnail public/icons/thumbs/<id>_angle.webp
// and the geometry gate record docs/geometry-gate/<id>.json. The bytes do not
// change, so the manifest's hashes stay valid; `genIcons --metadata-only` then
// re-keys the manifest rows (public/icons/tank-assets/). Source studies, references and source
// models keep their schema-1 names (tools read them through tankSeedId).
//
// The map has swaps (one vehicle's new id is an id another gave up), so every
// file first moves to a temporary name and then to its new one, and the tool
// runs once: it refuses when HEAD already holds the rename commit (trailer
// `Tank-Id-Schema: N`) or when moves are already staged under these folders.
// It stages exactly the paths it moved (never a whole folder).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = args.includes('--apply');
const dry = args.includes('--dry-run');
if (apply === dry) { console.error('pass exactly one of --apply or --dry-run'); process.exit(2); }
const schema = Number(flag('schema') ?? 0);
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (argv) => execFileSync('git', ['-C', root, ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const refuse = (message) => { console.error(`tank-id-move-files: ${message}`); process.exit(3); };
if (!Number.isInteger(schema) || schema < 2) refuse('pass --schema=<N> (N >= 2)');

const pairs = new Map();
const table = flag('table');
if (table) {
  for (const [from, to] of Object.entries(JSON.parse(readFileSync(table, 'utf8')).renames)) pairs.set(from, to);
} else {
  const { TANK_ID_SCHEMA, TANK_ID_RENAMES } = await import(pathToFileURL(join(root, 'src/vehicles/tankIdAliases.ts')).href);
  if (TANK_ID_SCHEMA < schema) refuse(`this tree is at tank id schema ${TANK_ID_SCHEMA}, not ${schema}`);
  for (const [from, to] of Object.entries(TANK_ID_RENAMES[schema - 2])) pairs.set(from, to);
}

const FOLDERS = ['public/icons', 'docs/geometry-gate'];
const VIEWS = ['angle.webp', 'side.webp', 'top.webp', 'side_silhouette.png', 'top_silhouette.png', 'markings.png',
  'armor_side.webp', 'modules_side.webp', 'crew_side.webp', 'technical.json'];
const namesFor = (id) => [...VIEWS.map((view) => `public/icons/${id}_${view}`), `public/icons/thumbs/${id}_angle.webp`,
  `docs/geometry-gate/${id}.json`];

try {
  const found = git(['log', '-1', '--format=%H', '-E', `--grep=^Tank-Id-Schema: ${schema}$`, 'HEAD']).trim();
  if (found) refuse(`HEAD already holds the schema ${schema} rename (${found.slice(0, 9)})`);
} catch (error) {
  if (error.status === 3) throw error;
}
if (git(['diff', '--cached', '--name-only', '--', ...FOLDERS]).trim()) {
  refuse(`changes are already staged under ${FOLDERS.join(', ')}: the files were moved (this tool runs once)`);
}
const tracked = new Set(git(['ls-files', '--', ...FOLDERS]).split('\n').filter(Boolean));

const moves = [];
for (const [from, to] of pairs) {
  namesFor(from).forEach((source, i) => {
    if (tracked.has(source)) moves.push([source, namesFor(to)[i]]);
  });
}
const sources = new Set(moves.map(([source]) => source));
for (const [, target] of moves) {
  if (tracked.has(target) && !sources.has(target)) refuse(`${target} exists and is not itself moving`);
}
const targets = new Set(moves.map(([, target]) => target));
if (targets.size !== moves.length) refuse('two files would move to the same name');

if (apply) {
  const temp = (path) => `${path}.tank-id-move`;
  for (const [source] of moves) renameSync(join(root, source), join(root, temp(source)));
  for (const [source, target] of moves) renameSync(join(root, temp(source)), join(root, target));
  const paths = [...new Set([...sources, ...targets])];
  for (let i = 0; i < paths.length; i += 200) git(['add', '-A', '--', ...paths.slice(i, i + 200)]);
  for (const [, target] of moves) if (!existsSync(join(root, target))) refuse(`lost ${target}`);
}
const swapped = moves.filter(([, target]) => sources.has(target)).length;
console.log(`${moves.length} files ${apply ? 'moved and staged' : 'to move (dry run)'} for ${pairs.size} renamed ids; `
  + `${swapped} land on a name another file gave up`);
