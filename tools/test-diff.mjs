// What a diff touches, for lane mode (tools/test-lane.mjs) and the heavy-suite recommender (tools/test-recommend.mjs).
// First-party tooling: Kevin B. Liu.
//
// No second resolver: a receipt's reads are the result cache's own closure (run-selftests.mjs selftestReadOf), and a
// changed file's tank ids come from the changed-only fleet partition (tools/changed-only/fingerprint.mjs computeState:
// the shared core, each group's files, each table file's ids). This module adds only what those leave open: the
// diff itself, the rows a changed table file moved (row by row), the spec fields balance reads, per id and tier, and the
// hit-resolution code that reads them.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authorityModules } from './det-math-lint.mjs';
import { namedIds } from './selftest-tiers.mjs';
import { scanPatternRegExp } from './selftest-scans.mjs';

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
  const { STEPS, TABLES, WORLD_STEPS } = await import(pathToFileURL(join(root, 'tools/changed-only/steps.mjs')).href);
  const { tableFileList } = await import(pathToFileURL(join(root, 'tools/changed-only/globs.mjs')).href);
  const state = computeState({ root, steps: STEPS, worldSteps: world ? WORLD_STEPS ?? [] : [] });
  return {
    // the balance pass is keyed per id through the spec rows in the chain; here it stays fleet-wide (its duels are chosen
    // from balanceInputs, which compares the specs themselves)
    ids: [...state.ids], core: new Set([...state.partition.core, ...(state.partition.balance ?? [])]), groups: state.partition.groups,
    // a JSON table file -> the key path of its per-id rows (steps.mjs TABLES kind 'json')
    jsonRows: new Map(Object.values(TABLES ?? {}).filter((table) => table.kind === 'json')
      .flatMap((table) => table.files.map((file) => [file, table.path]))),
    // a module table file -> the exports holding its per-id rows (steps.mjs TABLES kind 'module'; a file may hold two)
    moduleRows: Object.values(TABLES ?? {}).filter((table) => table.kind === 'module').reduce((files, table) => {
      for (const file of tableFileList(root, table, state.ids)) files.set(file, [...(files.get(file) ?? []), table.exportName]);
      return files;
    }, new Map()),
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

/**
 * Ids whose rows a JSON table moved, row by row (266: the icons step rewrote the 55 MB public/icons/tank-assets.json, a
 * 2,055,741-line diff git took 182 s to write). Null when anything outside the rows moved: every id it holds.
 */
function jsonRowIds(root, mergeBase, head, path, rowPath, tableIds) {
  const split = (text) => {
    const whole = JSON.parse(text);
    let rows = whole;
    for (const key of rowPath.slice(0, -1)) rows = rows?.[key];
    const own = rows?.[rowPath.at(-1)] ?? {};
    if (rows) rows[rowPath.at(-1)] = null;
    return { own, rest: JSON.stringify(whole) };
  };
  const at = (ref) => { try { return split(ref ? git(root, ['show', `${ref}:${path}`]) : readFileSync(join(root, path), 'utf8')); } catch { return null; } };
  const before = at(mergeBase), after = at(head === 'HEAD' ? null : head);
  if (!before || !after || before.rest !== after.rest) return null;
  const ids = new Set();
  for (const id of new Set([...Object.keys(before.own), ...Object.keys(after.own)])) {
    if (tableIds.has(id) && JSON.stringify(before.own[id]) !== JSON.stringify(after.own[id])) ids.add(id);
  }
  return ids;
}

/**
 * Ids whose rows each changed module table moved, row by row (267: auxiliaryInventory, auxiliaryRoofGuns and the
 * combat anatomy groups are one-line literals, so any hunk named all 276 ids). One child imports each file's exports on
 * both sides (tools/test-module-rows-child.mjs); a file it cannot read is null: every id it holds.
 */
function moduleRowIds(root, mergeBase, head, files, roster) {
  if (!files.size) return new Map();
  const child = spawnSync(process.execPath, ['--max-old-space-size=4096', '--disable-warning=ExperimentalWarning',
    join(TOOLS_ROOT, 'tools/test-module-rows-child.mjs')], { input: JSON.stringify({ root, mergeBase, head, files: Object.fromEntries(files) }),
    encoding: 'utf8', maxBuffer: 64 << 20, timeout: 300_000 });
  if (child.status !== 0) return new Map();
  return new Map(Object.entries(JSON.parse(child.stdout)).map(([path, ids]) => [path, ids && new Set(ids.filter((id) => roster.has(id)))]));
}

/**
 * Tank ids a diff moves, each with its reasons, from the fleet partition: a group's file marks the ids built through
 * that group, a table file the ids whose rows it moved, a path naming an id (a row file, an icon) that id. A shared
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
  const jsonRows = partition.jsonRows ?? new Map(), moduleRows = partition.moduleRows ?? new Map();
  // a file that holds one id's rows is that row whole, with no diff to read (a jsonRow table's <id>.json, steps.mjs
  // TABLES: 266's tank asset manifest, public/icons/tank-assets/tanks/)
  const own = (path) => partition.fileIds[path]?.length === 1;
  const modules = root ? moduleRowIds(root, mergeBase, head, new Map(changed.filter((path) => !partition.core.has(path) && moduleRows.has(path)
    && partition.fileIds[path]?.length && !own(path)).map((path) => [path, moduleRows.get(path)])), idSet) : new Map();
  for (const path of changed) {
    if (partition.core.has(path)) { core.push(path); continue; }
    for (const group of groupsOfFile.get(path) ?? []) {
      for (const id of partition.ids) if (partition.groupChain(id).includes(group)) mark(id, `${path} (group ${group})`);
    }
    const tableIds = partition.fileIds[path];
    if (tableIds?.length) {
      const moved = own(path) ? new Set(tableIds) : !root ? null : jsonRows.has(path) ? jsonRowIds(root, mergeBase, head, path, jsonRows.get(path), new Set(tableIds))
        : modules.get(path) ?? null;
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

/** `base`'s `paths` (src/ and package.json) in a temporary directory beside a link to this tree's node_modules, for `run`
 *  and whatever it awaits. */
export async function withBaseSources(root, ref, run, paths = ['src', 'package.json']) {
  const dir = mkdtempSync(join(tmpdir(), 'cot-test-base-'));
  try {
    const archive = spawnSync('git', ['archive', '--format=tar', ref, ...paths], { cwd: root, maxBuffer: 1 << 30 });
    if (archive.status !== 0) throw new Error(`git archive ${ref}: ${archive.stderr}`);
    const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout, maxBuffer: 1 << 30 });
    if (untar.status !== 0) throw new Error(`tar: ${untar.stderr}`);
    if (existsSync(join(root, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    return await run(dir);
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

/** The authority's hit resolution: the shell's path, the armour it meets and the damage it does. */
export const HIT_RESOLUTION_ENTRIES = Object.freeze(['src/sim/ballistics.ts', 'src/sim/armor.ts', 'src/sim/damage.ts']);

/**
 * The changed paths that move hit resolution for every tank: the static import closure of HIT_RESOLUTION_ENTRIES in the
 * tree (det-math-lint's walk of the authority), less what the fleet partition keys per id (a table file's rows, a
 * group's files), which changedTankIds names by id. balanceChanges compares the data; this is the code that reads it.
 */
export function hitResolutionMoves(root, partition, changed) {
  const closure = new Set(authorityModules(root, HIT_RESOLUTION_ENTRIES).map((file) => relative(root, file).split(sep).join('/')));
  const grouped = new Set(Object.values(partition.groups).flat());
  return changed.filter((path) => closure.has(path) && !partition.fileIds[path]?.length && !grouped.has(path));
}

/**
 * The changed paths whose effect on a tank a builder observable can judge: a fleet group's file or a per-id table file
 * (the partition names their ids) that the authority's own import graph does not hold and that moves no hit
 * resolution. The fleet core (every id) and anything the authority imports stay plain reads.
 */
export function builderPaths(root, partition, changed, hits = []) {
  const authority = new Set(authorityModules(root).map((file) => relative(root, file).split(sep).join('/')));
  const grouped = new Set(Object.values(partition.groups).flat());
  return changed.filter((path) => !partition.core.has(path) && (grouped.has(path) || partition.fileIds[path]?.length > 0)
    && !authority.has(path) && !hits.includes(path));
}

// Each finalized spec field as the eager tool facade registers it, which every authority suite's receipts load
// (src/vehicles/fleetParity.test-support.mjs: armor plates, modules, crew boxes, hit shells, gun, mobility, visual).
const SPEC_FIELDS = "await import('./src/vehicles/tankFactory.ts');"
  + "const { fleetDigest } = await import('./src/vehicles/fleetParity.test-support.mjs');"
  + 'process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(fleetDigest().specs).map(([id, spec]) => [id, spec.fields]))));';

async function runJson(args, cwd) {
  let out = '', err = '';
  const run = runTracked(process.execPath, ['--max-old-space-size=4096', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  run.child.stdout.on('data', (chunk) => { out += chunk; });
  run.child.stderr.on('data', (chunk) => { err += chunk; });
  const status = await run;
  if (status !== 0) throw new Error(`${args.find((arg) => arg.endsWith('.mjs')) ?? 'the spec digest'} in ${cwd} exited ${status}: ${err.trim().split('\n').slice(-2).join(' ')}`);
  return JSON.parse(out);
}

/**
 * What a tree's builders emit for `ids`, as receipts can see it: each finalized spec field's digest (SPEC_FIELDS) and the
 * HIGH and LOW geometry digests from the tree's own fleet-geometry-ledger worker (`jobs` shards; texture pixels and
 * interior fills stay outside, as in the ledger). Resolves { id: { spec: { field: digest } | null, high, low } }.
 */
export async function builderObservables(root, ids, { jobs = 4 } = {}) {
  const specs = await runJson(['--input-type=module', '-e', SPEC_FIELDS], root);
  const present = ids.filter((id) => specs[id]); // the ledger worker refuses an id its tree lacks (a new or removed tank)
  const shards = Math.max(1, Math.min(jobs, present.length));
  const rows = present.length ? Object.assign({}, ...await Promise.all(Array.from({ length: shards }, (_, shard) => runJson(
    ['tools/fleet-geometry-ledger.mjs', '--worker', `--shard=${shard}/${shards}`, `--ids=${present.join(',')}`], root)))) : {};
  return Object.fromEntries(ids.map((id) => [id, { spec: specs[id] ?? null, high: rows[id]?.high?.digest ?? null, low: rows[id]?.low?.digest ?? null }]));
}

/** The ids whose builder observables differ, with what moved: the spec fields by name and `geometry` (HIGH or LOW). */
export function builderMoves(before, after) {
  const rows = [];
  for (const [id, now] of Object.entries(after)) {
    const was = before[id];
    if (!was?.spec || !now.spec) { if (was?.spec || now.spec) rows.push({ id, classes: [was?.spec ? 'removed' : 'new'] }); continue; }
    const fields = [...new Set([...Object.keys(was.spec), ...Object.keys(now.spec)])].filter((field) => was.spec[field] !== now.spec[field]);
    const classes = [...fields.sort(), ...(was.high !== now.high || was.low !== now.low ? ['geometry'] : [])];
    if (classes.length) rows.push({ id, classes });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

/**
 * `readOf` without the reads that decide no result: a module that loads a path only to schedule the work declares it
 * `scheduleOnly` (tools/changed-only/steps.mjs DECLARED_DYNAMIC, as changed-only drops the edge from its keys), so a
 * reader that reaches the path only through such edges does not read it. Any other route (an import of its own, a
 * directory it reads, other than the broad ones createReadIndex already discounts) keeps the read.
 */
export function withoutScheduleReads(cache, root, declared, readOf, broadDirs = []) {
  const broad = new Set(broadDirs.map((dir) => resolve(root, dir)));
  const cut = new Map(); // a declaring file -> the paths it loads only to schedule
  for (const [file, declaration] of Object.entries(declared)) if (declaration.scheduleOnly?.length) cut.set(resolve(root, file), new Set(declaration.scheduleOnly.map((path) => resolve(root, path))));
  const targets = new Set([...cut.values()].flatMap((paths) => [...paths]));
  const reach = new Map();
  const reachOf = (file) => {
    if (reach.has(file)) return reach.get(file);
    const seen = new Set([file]), stack = [file];
    while (stack.length) {
      const current = stack.pop();
      for (const dependency of cache.dependenciesOf(current)) {
        if (seen.has(dependency) || cut.get(current)?.has(dependency)) continue;
        seen.add(dependency); stack.push(dependency);
      }
    }
    reach.set(file, seen);
    return seen;
  };
  return (file, path) => {
    const read = readOf(file, path), absolute = resolve(root, path);
    if (read !== 'named' || !targets.has(absolute)) return read;
    const closure = cache.closureOf(resolve(root, file));
    for (let dir = dirname(absolute); dir.startsWith(root + sep); dir = dirname(dir)) if (closure.has(dir) && !broad.has(dir)) return read;
    return reachOf(resolve(root, file)).has(absolute) ? read : null;
  };
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

/**
 * A receipt's read of a changed path for selection: the cache's own read (selftestReadOf), and when that is none or only
 * the broad fallback, the reads of the tools it spawns. A child-process user names a tool as a file, so the tool's own
 * imports and reads stay outside the receipt's closure (tank-id-rekey-assets.selftest runs tank-id-rekey-assets.mjs
 * --check, which reads the tank asset manifest, public/icons/tank-assets/: the centurion-family-262 proof's red lane
 * mode first missed). The cache's run set (runSetOf: imports plus the modules a spawning file names) supplies the tools;
 * no second resolver.
 * Last, 'observed': a path the receipt's latest PASS on this machine read, or a file of a directory it listed
 * (tools/selftest-observe.mjs). That covers paths computed from data, which no closure can name (266: the boot-closure
 * receipts walk src/main.ts's imports; the page receipts read site/ by slug).
 */
export function laneReadOf(cache, readOne, root) {
  const tools = new Map();
  const spawnedTools = (file) => {
    if (!tools.has(file)) {
      const absolute = resolve(root, file), found = [];
      cache.closureOf(absolute);
      for (const module of cache.runSetOf(absolute)) {
        if (!cache.metadataOf(module)?.spawns) continue; // the receipt itself, or a helper it imports, runs the child
        for (const target of cache.runEdgesOf(module)) if (target !== absolute && !found.includes(target)) found.push(target);
      }
      tools.set(file, found.map((path) => relative(root, path)).filter((path) => !path.startsWith('..')));
    }
    return tools.get(file);
  };
  let current = null;
  return (file, path) => {
    if (file !== current) { current = file; exitIfOrphaned(); } // once per receipt: selection is one synchronous loop
    const read = readOne(file, path);
    if (read === 'named' || read === 'scan') return read;
    for (const tool of spawnedTools(file)) {
      const through = readOne(tool, path);
      if (through === 'named' || through === 'scan') return through;
    }
    // what its latest PASS on this machine read or listed (tools/selftest-observe.mjs): a path computed from data
    const observed = cache.observedOf?.(file);
    if (observed?.reads.has(path) || observed?.lists.has(dirname(path))) return 'observed';
    return read;
  };
}

/** Each receipt's run time: the committed snapshot, else this machine's latest observation (the runner's runtime index). */
export async function receiptRunTimes(root = TOOLS_ROOT) {
  const snapshot = JSON.parse(readFileSync(join(root, 'tools/selftest-durations.json'), 'utf8')).runMs;
  const { resolveSelftestCacheDir } = await import(pathToFileURL(join(root, 'tools/selftest-cache-dir.mjs')).href);
  const { createRuntimeIndex } = await import(pathToFileURL(join(root, 'tools/selftest-schedule.mjs')).href);
  const runtimes = createRuntimeIndex(resolveSelftestCacheDir(root, process.env).dir);
  return (file) => snapshot[file] ?? runtimes.runMsOf(file) ?? null;
}

/**
 * selftestReadOf (run-selftests.mjs) for one diff's paths, each receipt's reads computed once: the same order and
 * rules (a listing it runs, then its closure's file, then a directory above it, a broad fallback directory alone being
 * 'broad'), from the cache's own closureOf and scanOf. Per call it was a path resolve, a pattern pass and a directory
 * walk for every (receipt, path) pair: 1,454 receipts x 2,906 paths took over ten minutes. tools/selftest-tiers.selftest
 * holds the two equal on the real cache.
 */
export function createReadIndex(cache, root, paths, broadDirs) {
  const broad = new Set(broadDirs);
  const rows = paths.map((path) => {
    const absolute = resolve(root, path), ancestors = [];
    for (let dir = dirname(absolute); dir.startsWith(root + sep); dir = dirname(dir)) ancestors.push([dir, broad.has(relative(root, dir))]);
    return { path, absolute, rel: relative(root, absolute).split(sep).join('/'), ancestors };
  });
  const patternHits = new Map();
  const hits = (pattern) => {
    if (!patternHits.has(pattern)) {
      const test = scanPatternRegExp(pattern);
      patternHits.set(pattern, rows.filter((row) => test.test(row.rel)).map((row) => row.path));
    }
    return patternHits.get(pattern);
  };
  const memo = new Map();
  const readsOf = (file) => {
    if (memo.has(file)) return memo.get(file);
    exitIfOrphaned();
    const absolute = resolve(root, file), closure = cache.closureOf(absolute), { lists, tracked } = cache.scanOf(absolute);
    const scanned = new Set([...lists, ...tracked].flatMap(hits)), out = new Map();
    for (const row of rows) {
      if (scanned.has(row.path)) { out.set(row.path, 'scan'); continue; }
      if (closure.has(row.absolute)) { out.set(row.path, 'named'); continue; }
      let read = null;
      for (const [dir, isBroad] of row.ancestors) {
        if (!closure.has(dir)) continue;
        if (!isBroad) { read = 'named'; break; }
        read = 'broad';
      }
      if (read) out.set(row.path, read);
    }
    memo.set(file, out);
    return out;
  };
  const indexed = new Set(paths);
  return { readsOf, has: (path) => indexed.has(path), readOf: (file, path) => readsOf(file).get(path) ?? null };
}

// The commands' children, and their exit with this process: a 600 s alarm on `npm run test:lane` killed npm and left the
// node child running (Main, 266). On SIGTERM, SIGINT, SIGHUP or SIGALRM, or once the parent is gone, every tracked child
// is stopped and this process exits.
const children = new Set();
const startPpid = process.ppid;
const stopAll = (code) => { for (const child of children) { try { child.kill('SIGTERM'); } catch { /* gone */ } } process.exit(code); };
export function exitIfOrphaned() { if (process.ppid !== startPpid) stopAll(129); }
// A signal listener runs only when the event loop does, and while one is attached the signal's default action is off:
// during a synchronous selection the command ignored its alarm (266: a 2,904-path dry run past 11 minutes, SIGKILLed).
// So the listeners are attached only while a tracked child runs (the run phase awaits its children); otherwise the
// default action ends this process at once, and the selection's loops check for a dead parent once per receipt.
const STOP_SIGNALS = [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129], ['SIGALRM', 142]].map(([signal, code]) => [signal, () => stopAll(code)]);
const listen = (on) => { for (const [signal, stop] of STOP_SIGNALS) if (on) process.on(signal, stop); else process.removeListener(signal, stop); };
export function exitWithParent() {
  setInterval(exitIfOrphaned, 2000).unref();
}
/** An async child this process stops when it stops; resolves with its exit status (the promise's `child` is the process). */
export function runTracked(command, args, options) {
  const child = spawn(command, args, options);
  if (!children.size) listen(true);
  children.add(child);
  const untrack = () => { if (children.delete(child) && !children.size) listen(false); };
  const done = new Promise((resolveStatus) => {
    child.on('close', (status, signal) => { untrack(); resolveStatus(status ?? (signal ? 128 : 1)); });
    child.on('error', () => { untrack(); resolveStatus(1); });
  });
  return Object.assign(done, { child });
}

/**
 * The integration tree a branch carries beyond `base` (an origin/integ/* tip whose merge base with HEAD is not in base),
 * or null: diffing such a branch against main counts the whole integration as the lane's own change.
 */
export function suggestedBase(root, base, head = 'HEAD') {
  let refs = [];
  try {
    refs = git(root, ['ls-remote', 'origin', 'refs/heads/integ/*'], { timeout: 20_000, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter(Boolean).map((line) => { const [sha, ref] = line.split('\t'); return { sha, name: ref.replace('refs/heads/', '') }; });
  } catch { return null; }
  const found = [];
  for (const { sha, name } of refs) {
    try {
      try { git(root, ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' }); }
      catch { git(root, ['fetch', '-q', 'origin', `refs/heads/${name}`], { timeout: 120_000, stdio: 'ignore' }); }
      // criss-cross history has several merge bases; keep the newest one `base` does not contain (266: a lane merged
      // integ/265, then main after integ/265 had merged main, and plain merge-base picked main's commit, so the
      // suggestion fell back to origin/main and 2,903 paths)
      const beyond = git(root, ['merge-base', '--all', head, sha]).trim().split('\n').filter(Boolean).filter((mergeBase) => {
        try { git(root, ['merge-base', '--is-ancestor', mergeBase, base], { stdio: 'ignore' }); return false; } catch { return true; }
      }).map((mergeBase) => ({ mergeBase, at: Number(git(root, ['log', '-1', '--format=%ct', mergeBase]).trim()) }));
      if (beyond.length) found.push({ name, sha, ...beyond.sort((a, b) => b.at - a.at)[0] });
    } catch { /* an unreachable ref suggests nothing */ }
  }
  return found.sort((a, b) => b.at - a.at)[0] ?? null;
}

/**
 * A requested local branch that is behind its origin branch is the origin branch (267: --base=main resolved the shared
 * checkout's stale main, dea936556a, and a lane saw 21,662 changed paths). One with commits origin lacks is kept, with
 * a warning.
 */
function currentBase(root, requested, label) {
  const at = (ref) => { try { return git(root, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], { stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  const local = at(`refs/heads/${requested}`), remote = at(`refs/remotes/origin/${requested}`);
  if (!local || !remote || local === remote) return requested;
  const count = (range) => Number(git(root, ['rev-list', '--count', range]).trim());
  const behind = count(`${local}..${remote}`), ahead = count(`${remote}..${local}`);
  const commits = (n) => `${n} commit${n === 1 ? '' : 's'}`;
  if (!ahead) {
    console.log(`[${label}] --base=${requested}: the local ${requested} is ${commits(behind)} behind origin/${requested}; diffing against origin/${requested}`);
    return `origin/${requested}`;
  }
  console.log(`[${label}] warning: --base=${requested}: the local ${requested} has ${commits(ahead)} origin/${requested} lacks and lacks ${behind} of `
    + `its; diffing against the local ${requested} as asked (--base=origin/${requested} for the shared one)`);
  return requested;
}

/** The base a command diffs against: the requested one, or origin/main with the integration suggestion printed (`integ` takes it). */
export function chooseBase(root, requested, label) {
  if (requested && requested !== 'integ') return currentBase(root, requested, label);
  const integration = suggestedBase(root, 'origin/main');
  if (!integration) return 'origin/main';
  const at = integration.mergeBase.slice(0, 10);
  if (requested === 'integ') {
    console.log(`[${label}] --base=integ: origin/${integration.name} at ${at}`);
    return integration.mergeBase;
  }
  console.log(`[${label}] this branch carries origin/${integration.name} commits that are not on origin/main, so they count as `
    + `its own here: run with --base=${at} (its merge base with origin/${integration.name}), or --base=integ`);
  return 'origin/main';
}
