// What a diff touches, for lane mode (tools/test-lane.mjs) and the heavy-suite recommender (tools/test-recommend.mjs).
// First-party tooling: Kevin B. Liu.
//
// No second resolver: a receipt's reads are the result cache's own closure (run-selftests.mjs selftestReadOf), and a
// changed file's tank ids come from the changed-only fleet partition (tools/changed-only/fingerprint.mjs computeState:
// the shared core, each group's files, each table file's ids). This module adds only what those leave open: the
// diff itself, the rows a changed table file moved (its hunks), and the spec fields balance reads, per id and tier.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { namedIds } from './selftest-tiers.mjs';

export const TOOLS_ROOT = resolve(import.meta.dirname, '..');
const git = (root, args, options = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, ...options });

/**
 * The paths a lane changed against `base`: the merge base to HEAD, plus the working tree (staged, unstaged and untracked
 * files), so a lane sees its uncommitted edits too. Deleted paths are kept (a receipt may list them).
 */
export function changedPaths(root, base = 'origin/main', { head = 'HEAD', worktree = true } = {}) {
  const mergeBase = git(root, ['merge-base', base, head]).trim();
  const paths = new Set(git(root, ['diff', '--name-only', '--no-renames', mergeBase, head]).split('\n').filter(Boolean));
  if (worktree && head === 'HEAD') {
    for (const path of git(root, ['diff', '--name-only', '--no-renames', 'HEAD']).split('\n').filter(Boolean)) paths.add(path);
    for (const path of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) paths.add(path);
  }
  return { base, head, mergeBase, paths: [...paths].sort() };
}

/**
 * The tree's fleet partition and roster from the changed-only fingerprint state (the tree's own copy of the tool), and
 * with `world` its world partition: per world step (wreck plan, collision, trenches) the world core's files, each
 * map's own files and each map's wreck donors.
 */
export async function fleetPartition(root, { world = false } = {}) {
  const { computeState } = await import(pathToFileURL(join(root, 'tools/changed-only/fingerprint.mjs')).href);
  const { STEPS, WORLD_STEPS } = await import(pathToFileURL(join(root, 'tools/changed-only/steps.mjs')).href);
  const state = computeState({ root, steps: STEPS, worldSteps: world ? WORLD_STEPS ?? [] : [] });
  return {
    ids: [...state.ids], core: new Set(state.partition.core), groups: state.partition.groups,
    groupChain: (id) => state.groupChain(id), fileIds: state.fileIds ?? {}, errors: [...state.errors, ...state.globalReasons],
    world: state.world ? {
      maps: [...state.world.ids],
      steps: Object.fromEntries(Object.entries(state.world.steps).map(([name, step]) => [name, {
        core: new Set(step.toolFiles), maps: Object.fromEntries(Object.entries(step.mapFiles).map(([map, files]) => [map, new Set(files)])),
      }])),
      donorsOf: (name, map) => state.world.donorsOf(name, map),
    } : null,
  };
}

/**
 * Maps whose generated world outputs a diff may move, per world step: { step: Map(map -> reasons) }. A world-core file
 * or a shared fleet core file moves every map; a map's own file moves that map; a moved donor id moves the maps that
 * cast it (the changed-only world keys, tools/changed-only/world.mjs, in reverse).
 */
export function changedMaps(world, changed, { ids = new Map(), core = [] } = {}) {
  const out = {};
  if (!world) return out;
  for (const [name, step] of Object.entries(world.steps)) {
    const maps = new Map();
    const mark = (map, why) => { if (!maps.has(map)) maps.set(map, []); if (maps.get(map).length < 3) maps.get(map).push(why); };
    const worldCore = changed.filter((path) => step.core.has(path));
    for (const map of world.maps) {
      if (worldCore.length) mark(map, `world core ${worldCore[0]}`);
      if (core.length) mark(map, `fleet core ${core[0]}`);
      const own = changed.find((path) => step.maps[map]?.has(path));
      if (own) mark(map, own);
      const donor = world.donorsOf(name, map).find((id) => ids.has(id));
      if (donor) mark(map, `donor ${donor}`);
    }
    out[name] = maps;
  }
  return out;
}

/** Ids whose rows one hunk of a changed per-id table moved: the ids its lines name, else the row key above it. */
function hunkIds(root, mergeBase, head, path, tableIds) {
  let diff = '';
  try { diff = git(root, ['diff', '-U0', '--no-renames', mergeBase, ...(head === 'HEAD' ? [] : [head]), '--', path]); } catch { return null; }
  const ids = new Set();
  const keyed = (line) => { const match = /^\s*['"]?([a-z0-9_]+)['"]?\s*:/.exec(line); return match && tableIds.has(match[1]) ? match[1] : null; };
  // the row key at or above each line of the new file, in one pass (a 50 MB table has a million lines and many hunks)
  let owners = null;
  const ownerAt = (line) => {
    if (!owners) {
      let lines = [];
      try { lines = readFileSync(join(root, path), 'utf8').split('\n'); } catch { /* deleted */ }
      owners = new Array(lines.length);
      let last = null;
      for (let index = 0; index < lines.length; index++) owners[index] = last = keyed(lines[index]) ?? last;
    }
    return owners[Math.min(line, owners.length - 1)] ?? null;
  };
  for (const hunk of diff.split(/^@@/m).slice(1)) {
    const header = /^ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(hunk);
    const named = namedIds(hunk, tableIds);
    for (const line of hunk.split('\n')) { const key = keyed(line.slice(1)); if (key) named.add(key); }
    if (!named.size && header) { const owner = ownerAt(Math.max(0, Number(header[1]) - 1)); if (owner) named.add(owner); }
    if (!named.size) return null; // a hunk no row owns: every id in the file
    for (const id of named) ids.add(id);
  }
  return ids;
}

/**
 * Tank ids a diff moves, each with its reasons, from the fleet partition: a group's file marks the ids built through
 * that group, a table file the ids its changed hunks name, a path naming an id (a row file, an icon) that id. A shared
 * core file marks every id: it is returned in `core` and marks no id here, so callers can say so instead of selecting
 * the whole fleet.
 */
export function changedTankIds(partition, changed, { root, mergeBase, head = 'HEAD' } = {}) {
  const ids = new Map(), core = [];
  const idSet = new Set(partition.ids);
  const mark = (id, why) => { if (!ids.has(id)) ids.set(id, []); if (!ids.get(id).includes(why)) ids.get(id).push(why); };
  const groupsOfFile = new Map();
  for (const [group, files] of Object.entries(partition.groups)) for (const file of files) {
    if (!groupsOfFile.has(file)) groupsOfFile.set(file, []);
    groupsOfFile.get(file).push(group);
  }
  for (const path of changed) {
    if (partition.core.has(path)) { core.push(path); continue; }
    for (const group of groupsOfFile.get(path) ?? []) {
      for (const id of partition.ids) if (partition.groupChain(id).includes(group)) mark(id, `${path} (group ${group})`);
    }
    const tableIds = partition.fileIds[path];
    if (tableIds?.length) {
      const moved = root ? hunkIds(root, mergeBase, head, path, new Set(tableIds)) : null;
      for (const id of moved ?? tableIds) mark(id, moved ? `${path} row` : `${path} (rows unresolved)`);
    }
    const stem = basename(path).split('.')[0];
    if (idSet.has(stem)) mark(stem, path);
    for (const segment of path.split('/').slice(0, -1)) if (idSet.has(segment)) mark(segment, path);
  }
  return { ids, core };
}

/** The spec fields balance reads, by class: a spec change in one of these may move a duel. */
export const BALANCE_FIELDS = Object.freeze({
  armour: ['armor'],
  gun: ['gun', 'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'turretTraverseDegS'],
  hp: ['hp'],
  mobility: ['enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh', 'hullTraverseDegS', 'terrainResistance', 'pivotStyle'],
  size: ['dims'],
  role: ['role', 'era'],
});

/** Per-id balance inputs of a tree: { id: { tier, digests: { class: digest } } } from a child that imports its specs. */
export function balanceInputs(root, { node = process.execPath } = {}) {
  const child = spawnSync(node, ['--max-old-space-size=4096', join(TOOLS_ROOT, 'tools/test-balance-inputs-child.mjs'), root],
    { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 600_000 });
  if (child.status !== 0) throw new Error(`balance inputs of ${root}: ${(child.stderr || child.error?.message || '').trim().split('\n').slice(-3).join(' ')}`);
  return JSON.parse(child.stdout);
}

/** `base`'s src/ (and package.json) in a temporary directory beside a link to this tree's node_modules. */
export function withBaseSources(root, ref, run) {
  const dir = mkdtempSync(join(tmpdir(), 'cot-test-base-'));
  try {
    const archive = spawnSync('git', ['archive', '--format=tar', ref, 'src', 'package.json'], { cwd: root, maxBuffer: 1 << 30 });
    if (archive.status !== 0) throw new Error(`git archive ${ref}: ${archive.stderr}`);
    const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout, maxBuffer: 1 << 30 });
    if (untar.status !== 0) throw new Error(`tar: ${untar.stderr}`);
    if (existsSync(join(root, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true }); // this function's own temporary copy
  }
}

/** The ids whose balance inputs differ between two input tables, with the classes that moved and their tiers. */
export function balanceChanges(before, after) {
  const rows = [];
  for (const [id, now] of Object.entries(after)) {
    const was = before[id];
    const classes = was ? Object.keys(now.digests).filter((name) => now.digests[name] !== was.digests[name]) : ['new'];
    if (classes.length) rows.push({ id, tier: now.tier, classes });
  }
  for (const id of Object.keys(before)) if (!after[id]) rows.push({ id, tier: before[id].tier, classes: ['removed'] });
  return rows.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id, 'en'));
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const roman = (tier) => ROMAN[tier] ?? String(tier);

/** Receipts (paths relative to root) that name any of `ids`, with the ids each names. */
export function receiptsNaming(root, files, ids) {
  const out = new Map();
  if (!ids.size) return out;
  for (const file of files) {
    let text = '';
    try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    const named = [...namedIds(text, ids)];
    if (named.length) out.set(file, named);
  }
  return out;
}

export const rel = (root, path) => relative(root, path);

/** Each receipt's run time: the committed snapshot, else this machine's latest observation (the runner's runtime index). */
export async function receiptRunTimes(root = TOOLS_ROOT) {
  const snapshot = JSON.parse(readFileSync(join(root, 'tools/selftest-durations.json'), 'utf8')).runMs;
  const { resolveSelftestCacheDir } = await import(pathToFileURL(join(root, 'tools/selftest-cache-dir.mjs')).href);
  const { createRuntimeIndex } = await import(pathToFileURL(join(root, 'tools/selftest-schedule.mjs')).href);
  const runtimes = createRuntimeIndex(resolveSelftestCacheDir(root, process.env).dir);
  return (file) => snapshot[file] ?? runtimes.runMsOf(file) ?? null;
}
