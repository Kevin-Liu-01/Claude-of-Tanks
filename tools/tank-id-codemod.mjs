#!/usr/bin/env node
// Rename tank spec ids in tracked source files (SSOT 2.19, ID.04/05).
//
//   node tools/tank-id-codemod.mjs --table=<rename-table.json> [--dry-run] [--max-file-mb=2]
//   node tools/tank-id-codemod.mjs old=new [old=new ...] [--dry-run]
//
// MEMORY SAFETY (2026-10-13). An earlier Python version of this tool searched by
// building one `git grep -l -E` alternation of all 130 ids, at first without -I.
// git scanned every binary asset (videos, models, images) with 18 threads and
// grew from 42 GB to 166 GB in about 55 s, and the owner had to kill it by hand.
// This version:
//   - finds candidate files with fixed strings only: `git grep -I -F -l -f <ids>
//     --threads 4`, never a regular-expression alternation of literals;
//   - excludes binaries (-I), media, models, icons, dated records and generated
//     files (their generators re-key them), and skips any file over
//     --max-file-mb (default 2 MB) with a warning;
//   - rewrites one file at a time with a plain token scan (no big regex).
// Run it under a memory ceiling (~/cot-launch-state/streams/ids/tools/memcap.sh 8 -- node ...),
// check `headroom can-start` first, try a small sample first, and never run it
// in parallel with another bulk scan.
//
// What it renames: a whole id token ([A-Za-z0-9_]+ run equal to an old id) in a
// text file. What it leaves: a token inside a path (after '/'), a file name
// (followed by .md/.json/.glb/.png/.webp), a link's `id=` parameter (links
// without `ids=` are read as schema 1 and resolve themselves), and the files in
// SKIP_EXACT whose id vocabulary is schema 1 on purpose (they test
// tankSeedId(id), so a rename never changes how a vehicle sounds or is built).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dry = args.includes('--dry-run');
const maxBytes = Number(flag('max-file-mb') ?? 2) * 1024 * 1024;
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const pairs = new Map();
const table = flag('table');
if (table) for (const [from, to] of Object.entries(JSON.parse(readFileSync(table, 'utf8')).renames)) pairs.set(from, to);
for (const a of args) if (!a.startsWith('--') && a.includes('=')) { const [from, to] = a.split('='); pairs.set(from, to); }
if (!pairs.size) { console.error('no renames given'); process.exit(2); }
for (const [from, to] of pairs) if (!/^[a-z0-9_]+$/.test(from) || !/^[a-z0-9_]+$/.test(to)) throw new Error(`bad id pair ${from}=${to}`);

const SKIP_PREFIX = ['docs/history/', 'docs/qa/', 'docs/references/', 'docs/tank-generation/', 'docs/geometry-gate/',
  'public/media/', 'public/models/', 'public/icons/', 'tools/media-r5/', 'tools/marketing-shots/'];
const SKIP_EXACT = new Set([
  // The alias layer and its receipts name old ids on purpose.
  'src/vehicles/tankIdAliases.ts', 'src/vehicles/tankIdAliases.selftest.mjs', 'src/game/tankIdBoundaries.selftest.mjs',
  'tools/tank-id-rename-table.mjs', 'tools/tank-id-rename-table.selftest.mjs', 'tools/tank-id-codemod.mjs',
  // Generated or re-keyed by their own tools / later steps.
  'docs/VEHICLE-ROSTER.md', 'docs/FLEET-FREEZE-CURRENT.json', 'src/vehicles/camoProductionBaseline.json',
  // Schema-1 id vocabulary, matched against tankSeedId(id).
  'src/audio/vehicleAudioProfiles.ts', 'src/vehicles/smokeFan.ts', 'src/vehicles/suspensionPatterns.ts',
]);
const GENERATED = /\.generated\.|tank-assets\.json$|fleet-geometry-ledger\.json$/;
const PATHSPEC = ['--', '.', ...SKIP_PREFIX.map((p) => `:(exclude)${p}`), ':(exclude,glob)**/*.generated.*',
  ':(exclude)public/icons/tank-assets.json',
  ...['png', 'webp', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'mov', 'glb', 'gltf', 'bin', 'wav', 'mp3', 'ogg', 'opus', 'ktx2',
    'woff', 'woff2', 'ttf', 'pdf', 'zip'].map((ext) => `:(exclude,glob)**/*.${ext}`)];

const scratch = mkdtempSync(join(tmpdir(), 'tank-id-codemod-'));
const idsFile = join(scratch, 'ids.txt');
writeFileSync(idsFile, `${[...pairs.keys()].join('\n')}\n`);
let listed = '';
try {
  listed = execFileSync('git', ['-C', root, 'grep', '-I', '-F', '-l', '--threads', '4', '-f', idsFile, ...PATHSPEC],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (error) {
  if (error.status !== 1) throw error; // 1 = no match
}
const files = listed.split('\n').filter(Boolean);

const TOKEN = /[A-Za-z0-9_]+/g;
const FILE_EXT = /^\.(?:md|json|glb|png|webp)\b/;
function rewrite(text) {
  let count = 0;
  const out = text.replace(TOKEN, (token, offset) => {
    const to = pairs.get(token);
    if (to === undefined) return token;
    if (text[offset - 1] === '/') return token; // inside a path
    if (text.slice(Math.max(0, offset - 3), offset) === 'id=') return token; // a link parameter (schema 1)
    if (FILE_EXT.test(text.slice(offset + token.length, offset + token.length + 6))) return token; // a file name
    count += 1;
    return to;
  });
  return { out, count };
}

const changed = [];
const skippedLarge = [];
for (const rel of files) {
  if (SKIP_PREFIX.some((p) => rel.startsWith(p)) || SKIP_EXACT.has(rel) || GENERATED.test(rel)) continue;
  const path = join(root, rel);
  const size = statSync(path).size;
  if (size > maxBytes) { skippedLarge.push(`${rel} (${(size / 1048576).toFixed(1)} MB)`); continue; }
  const { out, count } = rewrite(readFileSync(path, 'utf8'));
  if (!count) continue;
  changed.push([rel, count]);
  if (!dry) writeFileSync(path, out);
}
for (const [rel, n] of changed.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`${String(n).padStart(5)} ${rel}`);
for (const rel of skippedLarge) console.warn(`skipped (too large; re-key through its generator): ${rel}`);
console.log(`${changed.reduce((s, [, n]) => s + n, 0)} occurrences in ${changed.length} files${dry ? ' (dry run)' : ''}; ${files.length} candidates`);
