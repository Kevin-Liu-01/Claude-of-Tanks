#!/usr/bin/env node
// tank-assets-split.mjs — move rows from a pre-266 single-file tank asset manifest (public/icons/tank-assets.json)
// into the split layout (tools/tank-assets-store.mjs), and reassemble the single file from the split.
// First-party tooling: Kevin B. Liu.
//
//   node tools/tank-assets-split.mjs --from-ref=<rev> --changed-since=<rev>
//       re-home a lane's rows: the rows <from-ref>'s single file holds that differ from <changed-since>'s (new or
//       changed), and the removal of rows it dropped. A lane that edited the old file runs this after merging the
//       split (its own side is HEAD; an integrator merging the lane takes MERGE_HEAD), with the merge base as
//       --changed-since, then `git rm public/icons/tank-assets.json`. No render: the rows are its branch's own.
//   node tools/tank-assets-split.mjs --from-ref=<rev> --ids=<id,...>     the named rows only
//   node tools/tank-assets-split.mjs --from=<file> --all                 every row and the header (the 266 conversion)
//   node tools/tank-assets-split.mjs --join=<file>                       write the split manifest as the old single file
//   --out=<icons dir>   the split manifest's icons directory (default public/icons)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uniqueIds } from './id-list.mjs';
import { readTankAssets, tankAssetIndexPath, tankAssetRowPath, tankAssetsMonolithText, writeTankAssets }
  from './tank-assets-store.mjs';

const LEGACY_PATH = 'public/icons/tank-assets.json';
const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const iconsDir = resolve(value('out') ?? 'public/icons');
const fail = (message) => { console.error(`[tank-assets-split] ${message}`); process.exit(2); };

const join = value('join');
if (join) {
  const manifest = readTankAssets(iconsDir);
  if (!manifest) fail(`no split manifest under ${iconsDir}`);
  writeFileSync(resolve(join), tankAssetsMonolithText(manifest));
  console.log(`[tank-assets-split] ${Object.keys(manifest.tanks).length} rows -> ${join}`);
  process.exit(0);
}

/** A single-file manifest from a file or from git (a branch, a commit, HEAD or MERGE_HEAD during a merge). */
function legacy(file, ref) {
  const text = file ? readFileSync(resolve(file), 'utf8')
    : execFileSync('git', ['show', `${ref}:${LEGACY_PATH}`], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const manifest = JSON.parse(text);
  if (!manifest?.tanks || typeof manifest.tanks !== 'object') fail(`${file ?? `${ref}:${LEGACY_PATH}`} has no tanks`);
  return manifest;
}

const fromFile = value('from'), fromRef = value('from-ref'), since = value('changed-since');
if (!fromFile === !fromRef) fail('name the old manifest with --from=<file> or --from-ref=<rev>');
const source = legacy(fromFile, fromRef);
let ids, dropped = [];
if (args.includes('--all')) {
  ids = Object.keys(source.tanks);
} else if (value('ids')) {
  ids = uniqueIds(value('ids').split(',').map((id) => id.trim()).filter(Boolean), 'tank-assets-split --ids');
} else if (since) {
  const base = legacy(null, since);
  ids = Object.keys(source.tanks).filter((id) => JSON.stringify(source.tanks[id]) !== JSON.stringify(base.tanks[id]));
  dropped = Object.keys(base.tanks).filter((id) => !Object.hasOwn(source.tanks, id));
} else {
  fail('choose the rows: --changed-since=<rev>, --ids=<id,...> or --all');
}
const missing = ids.filter((id) => !Object.hasOwn(source.tanks, id));
if (missing.length) fail(`not in the old manifest: ${missing.join(', ')}`);

const { tanks: _, ...sourceHeader } = source;
// A whole conversion, or a tree with no split manifest yet, takes the old file's header; a re-home keeps this tree's.
const indexPath = tankAssetIndexPath(iconsDir);
const header = args.includes('--all') || !existsSync(indexPath) ? sourceHeader : JSON.parse(readFileSync(indexPath, 'utf8'));
const { changed } = writeTankAssets(iconsDir, { ...header, tanks: Object.fromEntries(ids.map((id) => [id, source.tanks[id]])) },
  { prune: args.includes('--all') });
for (const id of dropped) {
  const path = tankAssetRowPath(iconsDir, id);
  if (existsSync(path)) rmSync(path);
}
console.log(`[tank-assets-split] ${ids.length} rows from ${fromFile ?? fromRef}: ${changed.length} files written`
  + `${dropped.length ? `, ${dropped.length} dropped rows removed (${dropped.join(', ')})` : ''} -> ${iconsDir}`);
