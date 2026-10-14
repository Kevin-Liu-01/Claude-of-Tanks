#!/usr/bin/env node
// Rename tank spec ids in tracked source files (SSOT 2.19, ID.04/05), and the
// lanes' merge helper for that rename.
//
//   node tools/tank-id-codemod.mjs --apply --schema=3            merge helper (any branch, idempotent)
//   node tools/tank-id-codemod.mjs --apply --schema=3 --initial  the rename itself, on the rename branch
//   ... --dry-run instead of --apply reports without writing; --table=<rename-table.json> replaces the map.
//
// The map is TANK_ID_RENAMES for --schema (src/vehicles/tankIdAliases.ts of
// this tree). It contains swaps (leo2a6m_x -> leo2a6m while leo2a6m ->
// leo2a4_otco), so applying it twice to the same line renames a vehicle into
// another one. The tool therefore only converts text that is still in the
// previous schema:
//   --initial  converts the whole tree once, on a clean tree that does not yet
//              hold the rename. Commit the result with the trailer line
//              `Tank-Id-Schema: <N>` (the rename commit, R). A dirty tree is
//              refused, so a second run changes nothing.
//   default    the merge helper, for a branch that merges a main holding R.
//              1. During that merge, each conflicted text file is re-merged
//                 3-way from the converted base, the converted lane side and
//                 main's side (git merge-file): a conflict that was only the
//                 rename resolves and is staged; a real one keeps its markers.
//              2. Every line that git blame attributes to one of the lane's own
//                 commits from before R (neither an ancestor nor a descendant
//                 of R) is converted. Lines from R, from main and uncommitted
//                 lines are never touched, so a second run changes nothing.
//              On a branch without R in HEAD or MERGE_HEAD it refuses and
//              changes nothing. Generated files, icons and the other skipped
//              paths are reported: regenerate them with their generators.
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
// Run it with NODE_OPTIONS=--max-old-space-size=4096 under a memory ceiling
// (~/cot-launch-state/streams/ids/tools/memcap.sh 4 -- ...) and a wall-clock
// alarm, check `headroom can-start` first, and never in parallel with another
// bulk scan.
//
// What it renames: a whole id token ([A-Za-z0-9_]+ run equal to an old id) in a
// text file. What it leaves: a token inside a path (after '/'), a file name
// (followed by a file extension), a hyphenated slug (mesh labels, media file
// names), SVG files (path data such as `m1a2` is a moveto and an arc), Studio
// scenes (public/field-guide, tools/marketing-shots: unstamped scenes resolve
// as schema 1 at load), a link's `id=` parameter (links without `ids=` are read
// as schema 1 and resolve themselves), any line carrying the marker
// `tank-ids:keep` (an old id kept on purpose, or a token that only looks like
// an id), and the files in SKIP_EXACT whose id vocabulary is schema 1 on
// purpose (they test tankSeedId(id), so a rename never changes how a vehicle
// sounds or is built).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = args.includes('--apply');
const dry = args.includes('--dry-run');
const initial = args.includes('--initial');
if (apply === dry) { console.error('pass exactly one of --apply or --dry-run'); process.exit(2); }
const schema = Number(flag('schema') ?? 0);
const maxBytes = Number(flag('max-file-mb') ?? 2) * 1024 * 1024;
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (argv, options = {}) => execFileSync('git', ['-C', root, ...argv],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
const gitOk = (argv) => { try { git(argv); return true; } catch { return false; } };
const refuse = (message) => { console.error(`tank-id-codemod: ${message}`); process.exit(3); };

// ---- the rename map
const pairs = new Map();
const table = flag('table');
if (table) {
  for (const [from, to] of Object.entries(JSON.parse(readFileSync(table, 'utf8')).renames)) pairs.set(from, to);
} else {
  if (!Number.isInteger(schema) || schema < 2) refuse('pass --schema=<N> (N >= 2), the tank id schema to convert to');
  const aliases = join(root, 'src/vehicles/tankIdAliases.ts');
  if (!existsSync(aliases)) refuse(`no ${aliases}`);
  const { TANK_ID_SCHEMA, TANK_ID_RENAMES } = await import(pathToFileURL(aliases).href);
  if (TANK_ID_SCHEMA < schema) {
    refuse(`this tree is at tank id schema ${TANK_ID_SCHEMA}: merge the main that carries schema ${schema} first`);
  }
  for (const [from, to] of Object.entries(TANK_ID_RENAMES[schema - 2])) pairs.set(from, to);
}
for (const a of args) if (!a.startsWith('--') && a.includes('=')) { const [from, to] = a.split('='); pairs.set(from, to); }
if (!pairs.size) refuse('no renames given');
for (const [from, to] of pairs) if (!/^[a-z0-9_]+$/.test(from) || !/^[a-z0-9_]+$/.test(to)) refuse(`bad id pair ${from}=${to}`);

// ---- what is never rewritten
const SKIP_PREFIX = ['docs/history/', 'docs/qa/', 'docs/references/', 'docs/tank-generation/', 'docs/geometry-gate/',
  'public/media/', 'public/models/', 'public/icons/', 'public/field-guide/', 'tools/media-r5/', 'tools/marketing-shots/'];
const SKIP_EXACT = new Set([
  // The alias layer and its receipts name old ids on purpose.
  'src/vehicles/tankIdAliases.ts', 'src/vehicles/tankIdAliases.selftest.mjs', 'src/game/tankIdBoundaries.selftest.mjs',
  'tools/tank-id-rename-table.mjs', 'tools/tank-id-rename-table.selftest.mjs', 'tools/tank-id-codemod.mjs',
  'tools/tank-id-codemod.selftest.mjs', 'tools/tank-id-move-files.selftest.mjs',
  // Generated or re-keyed by their own tools / later steps.
  'docs/VEHICLE-ROSTER.md', 'docs/FLEET-FREEZE-CURRENT.json', 'src/vehicles/camoProductionBaseline.json',
  // Schema-1 id vocabulary, matched against tankSeedId(id).
  'src/audio/vehicleAudioProfiles.ts', 'src/vehicles/smokeFan.ts', 'src/vehicles/suspensionPatterns.ts',
  'src/vehicles/trackPatterns.ts', 'src/vehicles/wheelPatterns.ts', 'src/fx/projectileTracers.ts',
]);
const GENERATED = /\.generated\.|tank-assets\.json$|fleet-geometry-ledger\.json$/;
const BINARY_EXT = ['svg', 'png', 'webp', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'mov', 'glb', 'gltf', 'bin', 'wav', 'mp3',
  'ogg', 'opus', 'ktx2', 'woff', 'woff2', 'ttf', 'pdf', 'zip'];
const PATHSPEC = ['--', '.', ...SKIP_PREFIX.map((p) => `:(exclude)${p}`), ':(exclude,glob)**/*.generated.*',
  ':(exclude)public/icons/tank-assets.json', ...BINARY_EXT.map((ext) => `:(exclude,glob)**/*.${ext}`)];
const BINARY_RE = new RegExp(`\\.(?:${BINARY_EXT.join('|')})$`, 'i');
const skipped = (rel) => SKIP_PREFIX.some((p) => rel.startsWith(p)) || SKIP_EXACT.has(rel);
const generated = (rel) => GENERATED.test(rel);

// ---- the token rewrite
const TOKEN = /[A-Za-z0-9_]+/g;
const FILE_EXT = /^\.(?:md|json|glb|gltf|png|webp|jpe?g|svg|mp4|webm|ts|mjs|js|html|css|txt|csv|generated|LICENSE)\b/;
function rewrite(text) {
  let count = 0;
  const out = text.replace(TOKEN, (token, offset) => {
    const to = pairs.get(token);
    if (to === undefined) return token;
    if (text[offset - 1] === '/') return token; // inside a path
    if (text.slice(Math.max(0, offset - 3), offset) === 'id=') return token; // a link parameter (schema 1)
    // A hyphen next to the token makes it part of a slug, never an id: a mesh label (`t90-front-mudguard`), a media
    // file name (`studio-leclerc-knockout.jpg`) or a CSS class.
    if (text[offset - 1] === '-' || text[offset + token.length] === '-') return token;
    if (FILE_EXT.test(text.slice(offset + token.length, offset + token.length + 6))) return token; // a file name
    count += 1;
    return to;
  });
  return { out, count };
}
const KEEP = 'tank-ids:keep';
/** Rewrite only the lines (0-based) for which `convert(line)` is true; a line marked `tank-ids:keep` never. */
function rewriteLines(text, convert = () => true) {
  const lines = text.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!convert(i) || lines[i].includes(KEEP)) continue;
    const r = rewrite(lines[i]);
    lines[i] = r.out;
    count += r.count;
  }
  return { out: lines.join('\n'), count };
}
const readText = (rel) => {
  const path = join(root, rel);
  if (!existsSync(path)) return null;
  const size = statSync(path).size;
  if (size > maxBytes) { skippedLarge.push(`${rel} (${(size / 1048576).toFixed(1)} MB)`); return null; }
  const text = readFileSync(path, 'utf8');
  return text.slice(0, 8000).includes('\0') ? null : text;
};

const changed = [];
const skippedLarge = [];
const regenerate = new Set();
const unresolved = [];
const record = (rel, count, out) => {
  if (!count) return;
  changed.push([rel, count]);
  if (apply) writeFileSync(join(root, rel), out);
};

// ---- the rename commit R (trailer `Tank-Id-Schema: N`)
const TRAILER = `Tank-Id-Schema: ${schema}`;
const renameCommit = (rev) => {
  if (!schema || !gitOk(['rev-parse', '-q', '--verify', `${rev}^{commit}`])) return null;
  const found = git(['log', '--format=%H', '--reverse', '-E', `--grep=^${TRAILER}$`, rev]).split('\n').filter(Boolean);
  return found[0] ?? null;
};
const merging = gitOk(['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
const rHead = renameCommit('HEAD');
const rMerge = merging ? renameCommit('MERGE_HEAD') : null;

if (initial) {
  // ---- the rename itself: the whole tree, once
  if (rHead) refuse(`HEAD already holds the schema ${schema} rename (${rHead.slice(0, 9)}): run without --initial`);
  if (git(['status', '--porcelain', '--untracked-files=no']).trim()) {
    refuse('--initial needs a clean tree (commit or stash first); a second run would rename swapped ids twice');
  }
  const idsFile = join(mkdtempSync(join(tmpdir(), 'tank-id-codemod-')), 'ids.txt');
  writeFileSync(idsFile, `${[...pairs.keys()].join('\n')}\n`);
  let listed = '';
  try {
    listed = git(['grep', '-I', '-F', '-l', '--threads', '4', '-f', idsFile, ...PATHSPEC]);
  } catch (error) {
    if (error.status !== 1) throw error; // 1 = no match
  }
  for (const rel of listed.split('\n').filter(Boolean)) {
    if (skipped(rel)) continue;
    if (generated(rel)) { regenerate.add(rel); continue; }
    const text = readText(rel);
    if (text == null) continue;
    const { out, count } = rewriteLines(text);
    record(rel, count, out);
  }
} else {
  // ---- the merge helper
  const r = rHead ?? rMerge;
  if (!r) {
    refuse(`neither HEAD nor MERGE_HEAD holds a commit with "${TRAILER}": merge the main that carries the rename first`
      + ' (the rename branch itself uses --initial)');
  }
  // 1. Conflicts this merge brings: re-merge from the converted base and lane side.
  const remerged = new Set(); // their lane side was converted whole: step 2 leaves them alone
  if (merging && !rHead && rMerge) {
    const scratch = mkdtempSync(join(tmpdir(), 'tank-id-merge-'));
    const conflicted = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
    for (const rel of conflicted) {
      if (generated(rel)) { regenerate.add(rel); continue; }
      if (skipped(rel) || BINARY_RE.test(rel)) { unresolved.push(rel); continue; }
      const stage = (n) => { try { return git(['show', `:${n}:${rel}`]); } catch { return null; } };
      const [base, ours, theirs] = [stage(1), stage(2), stage(3)];
      if (base == null || ours == null || theirs == null || [base, ours, theirs].some((t) => t.slice(0, 8000).includes('\0'))) {
        unresolved.push(rel); continue;
      }
      const files = ['ours', 'base', 'theirs'].map((name) => join(scratch, `${name}-${rel.replace(/[\\/]/g, '__')}`));
      writeFileSync(files[0], rewriteLines(ours).out);
      writeFileSync(files[1], rewriteLines(base).out);
      writeFileSync(files[2], theirs);
      let merged; let conflicts = 0;
      try {
        merged = execFileSync('git', ['merge-file', '-p', '-L', 'lane (converted)', '-L', 'base (converted)', '-L', 'main', ...files],
          { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      } catch (error) {
        if (!(error.status > 0)) throw error;
        merged = error.stdout; conflicts = error.status;
      }
      changed.push([rel, conflicts ? `re-merged, ${conflicts} conflict(s) left` : 'conflict resolved']);
      remerged.add(rel);
      if (conflicts) unresolved.push(rel);
      if (apply) {
        writeFileSync(join(root, rel), merged);
        if (!conflicts) git(['add', '--', rel]);
      }
    }
  }
  // 2. Lines from the lane's own commits from before R.
  const list = (argv) => new Set(git(argv).split('\n').filter(Boolean));
  const lane = list(['rev-list', 'HEAD', '--not', r]);
  if (rHead) for (const c of list(['rev-list', '--ancestry-path', `${r}..HEAD`])) lane.delete(c);
  if (lane.size) {
    const files = new Set();
    let current = null;
    for (const line of git(['log', '--format=%x01%H', '--name-only', '--no-renames', 'HEAD', '--not', r]).split('\n')) {
      if (line.startsWith('\x01')) current = line.slice(1);
      else if (line && lane.has(current)) files.add(line);
    }
    const unmerged = new Set(git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean));
    for (const rel of [...files].sort()) {
      if (skipped(rel) || BINARY_RE.test(rel) || unmerged.has(rel) || remerged.has(rel)) continue;
      const text = readText(rel);
      if (text == null) continue;
      if (!rewriteLines(text).count) continue; // no old-id token at all
      if (generated(rel)) { regenerate.add(rel); continue; }
      let blame;
      try {
        blame = git(['blame', '--porcelain', '--contents', join(root, rel), 'HEAD', '--', rel]);
      } catch {
        continue; // not in HEAD: main's file, or new and uncommitted
      }
      const owner = [];
      let sha = null; let finalLine = 0;
      for (const line of blame.split('\n')) {
        const m = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
        if (m) { sha = m[1]; finalLine = Number(m[2]) - 1; } else if (line.startsWith('\t')) owner[finalLine] = sha;
      }
      const { out, count } = rewriteLines(text, (i) => lane.has(owner[i]));
      record(rel, count, out);
    }
  }
}

const weight = (n) => (typeof n === 'number' ? n : Infinity);
for (const [rel, n] of changed.sort((a, b) => weight(b[1]) - weight(a[1]) || a[0].localeCompare(b[0]))) {
  console.log(`${String(n).padStart(5)} ${rel}`);
}
for (const rel of skippedLarge) console.warn(`skipped (too large; re-key through its generator): ${rel}`);
for (const rel of [...regenerate].sort()) console.warn(`regenerate with its generator: ${rel}`);
for (const rel of [...new Set(unresolved)].sort()) console.warn(`still conflicted, resolve by hand: ${rel}`);
const total = changed.reduce((s, [, n]) => s + (typeof n === 'number' ? n : 0), 0);
console.log(`${initial ? 'initial' : 'merge helper'}: ${total} occurrences in ${changed.length} files${dry ? ' (dry run)' : ''}`);
if (initial && apply && changed.length) console.log(`commit this with the trailer line "${TRAILER}" (the rename commit)`);
