#!/usr/bin/env node
// Which manual suites a diff warrants, and why, in the words Main relays to the owner. First-party tooling: Kevin B. Liu.
//
//   npm run test:recommend [-- --base=<ref>] [--json=<path>]
//
// One line per warranted suite, its time on an idle machine and what moved, with the command the owner triggers under it:
//   balance (~1 min): 12 tanks changed armour/gun/HP in tiers VIII-IX (leo2a4, ...)
//     npm run test:heavy -- balance
// Nothing here runs a suite. A suite is warranted when
//   - one of its receipts (or a tool its commands run) reads a changed path through the result cache's own closure
//     (a broad-fallback match alone is not a read);
//   - a stale-output guard of it fires (tools/selftest-tiers.mjs STALE_GUARDS: a map's files, the world core, the
//     shared fleet core or a wreck donor moved, from the changed-only world partition; or any tank moved);
//   - balance: an id's balance inputs moved (spec armour, gun, HP, mobility, size, role: base and head registries);
//   - the `hits` suites (balance, pacing, bots, sims), whole: a file in the static import closure of the authority's hit
//     resolution moved (test-diff.mjs hitResolutionMoves), a fleet-wide balance move whatever the specs say.
// A read that decides no result does not count: one only through a module that declares the path `scheduleOnly`
// (test-diff.mjs withoutScheduleReads), and a hits suite's reads of builder paths when the tanks they name emit the same
// finalized specs and HIGH/LOW geometry in the base's tree and this one (test-diff.mjs builderObservables).
// `tanks` is id-scoped: lane mode runs the pins of the changed tanks, so the whole suite is warranted only when the
// shared fleet core moved under them. An entry page's HTML (a root *.html Vite builds from) counts only for a receipt
// that names that page itself: many receipts reach index.html and 404.html through Vite's entry, and a document-head
// change moves no simulation, bot or world result (the og:video head warranted six suites that way). A receipt file
// (*.selftest.mjs) or a test-support file is never product input: it counts only for a receipt that runs or reads it (its
// own file, a module its run executes, a path its own source names, bytes it was seen reading), never through a
// directory a receipt lists or a registry its closure names (267: object695X.selftest.mjs warranted ten suites).
// `--root=<dir>` evaluates another checkout (a report on another branch's diff); `--base=integ` and the integration
// suggestion as in lane mode; the command exits with its parent and on SIGTERM/SIGINT/SIGHUP/SIGALRM.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANUAL_SUITES, STALE_GUARDS, manualSuiteFiles } from './selftest-tiers.mjs';
import { balanceChanges, balanceInputs, builderMoves, builderObservables, builderPaths, changedMaps, changedPaths, changedTankIds,
  chooseBase, createReadIndex, exitWithParent, fleetPartition, hitResolutionMoves, laneReadOf, receiptRunTimes, roman, TOOLS_ROOT,
  withBaseSources, withoutScheduleReads } from './test-diff.mjs';
import { simulateWall } from './test-audit.mjs';

const READS = new Set(['named', 'scan', 'observed']);
/** An entry page's HTML: it counts only for a receipt that names the page itself. */
export const ENTRY_HTML = /^[^/]+\.html$/;
/** Whether `file` reads `path` on purpose: any path but an entry page, or a page the receipt's own source names. */
export const readsOnPurpose = (path, text) => !ENTRY_HTML.test(path) || text.includes(path);
/** A receipt or a file only receipts import. */
export const RECEIPT_FILE = /\.(selftest|test-support)\.mjs$/;
/**
 * Whether `file` runs or reads the receipt file `path` itself (any other path: true): `path` is `file`, a module its run
 * executes (cache.runSetOf: imports and spawned tools), named in its own source, or among the bytes its latest PASS read.
 * A directory it lists or names, or a registry in its closure that names every receipt, does not count.
 */
export const readsReceiptFile = (cache, root, textOf) => (file, path) => !RECEIPT_FILE.test(path) || path === file
  || cache.runSetOf(resolve(root, file)).has(resolve(root, path)) || textOf(file).includes(path)
  || Boolean(cache.observedOf?.(file)?.reads.has(path));
const list = (items, count = 5) => `${items.slice(0, count).join(', ')}${items.length > count ? `, +${items.length - count} more` : ''}`;
const CLASS_WORDS = { armour: 'armour', gun: 'gun', hp: 'HP', mobility: 'mobility', size: 'size', role: 'role', new: 'new', removed: 'removed' };

/** Tiers as roman numerals: a run reads "VIII-IX", gaps read "V, VIII-IX". */
export function tierList(tiers) {
  const sorted = [...new Set(tiers)].sort((a, b) => a - b), runs = [];
  for (const tier of sorted) {
    const last = runs.at(-1);
    if (last && tier === last[1] + 1) last[1] = tier; else runs.push([tier, tier]);
  }
  return runs.map(([from, to]) => (from === to ? roman(from) : `${roman(from)}-${roman(to)}`)).join(', ');
}

const minutes = (ms) => (ms < 90_000 ? `~${Math.max(1, Math.round(ms / 60_000))} min` : `~${Math.round(ms / 60_000)} min`);

/**
 * The recommendation as data. `readers`: suite -> Map(receipt or tool -> changed paths it reads); `balance`:
 * balanceChanges() rows (null when not compared); `hits`: hitResolutionMoves() paths; `ids`: changed tank ids (Map id ->
 * reasons); `core`: changed shared fleet core paths; `maps`: changedMaps() output; `wallMs`: suite -> its idle wall time;
 * `idPins`: the tanks receipts
 * lane mode runs for `ids`, `idPinsDeferred` those it leaves to the owner (more than its share of the suite).
 * `builders`: { paths, moved } when the builder observables were compared (test-diff.mjs builderObservables): with
 * nothing moved, a `hits` suite drops its reads of those paths; with tanks moved, balance names them.
 * When closure reads alone warrant a suite and they reach at most a quarter of its receipts, the command names just
 * those (`--only=`), timed by `subsetWallMs(files)`.
 * Returns one row per suite: { suite, warranted, line, run }.
 */
export function recommend({ suites = MANUAL_SUITES, guards = STALE_GUARDS, readers, balance = null, hits = [], builders = null,
  ids = new Map(), core = [], maps = {}, wallMs = {}, idPins = 0, idPinsDeferred = 0, subsetWallMs = null }) {
  const rows = [];
  const inert = builders && !builders.moved.length ? new Set(builders.paths) : null;
  for (const [name, entry] of Object.entries(suites)) {
    const reading = new Map([...(readers.get(name) ?? new Map())]
      .map(([file, paths]) => [file, entry.hits && inert ? paths.filter((path) => !inert.has(path)) : paths]).filter(([, paths]) => paths.length));
    const parts = [];
    let warranted = false, run = `npm run test:heavy -- ${name}`;
    if (name === 'balance' && balance?.length) {
      warranted = true;
      const tiers = tierList(balance.map((row) => row.tier));
      const fresh = balance.filter((row) => row.classes.includes('new')).length, gone = balance.filter((row) => row.classes.includes('removed')).length;
      const moved = balance.filter((row) => !row.classes.includes('new') && !row.classes.includes('removed'));
      const classes = [...new Set(moved.flatMap((row) => row.classes))].map((word) => CLASS_WORDS[word] ?? word);
      const counts = [fresh && `${fresh} new ${fresh === 1 ? 'tank' : 'tanks'}`, moved.length && `${moved.length} ${moved.length === 1 ? 'tank' : 'tanks'} changed ${classes.join('/')}`,
        gone && `${gone} removed`].filter(Boolean);
      parts.push(`${counts.join(', ')} in tier${/[-,]/.test(tiers) ? 's' : ''} ${tiers} (${list(balance.map((row) => row.id), 6)})`);
    }
    const hitMove = Boolean(entry.hits && hits.length);
    if (hitMove) {
      warranted = true;
      parts.push(`hit resolution changed (${list(hits, 3)}), a fleet-wide balance move`);
    }
    const built = name === 'balance' && builders?.moved.length ? builders.moved : null;
    if (built) {
      warranted = true;
      const classes = [...new Set(built.flatMap((row) => row.classes))];
      parts.push(`${built.length} ${built.length === 1 ? 'tank is' : 'tanks are'} built differently (${list(classes, 4)}: ${list(built.map((row) => row.id), 6)})`);
    }
    const onMaps = [], ofTanks = [];
    for (const [file, guard] of Object.entries(guards)) {
      if (!entry.files.includes(file) && !entry.commands.some((command) => command[1] === file)) continue;
      if (guard.worldSteps) {
        const moved = new Set(guard.worldSteps.flatMap((step) => [...(maps[step]?.keys() ?? [])]));
        if (moved.size) onMaps.push(`${guard.keeps} may be stale on ${moved.size} ${moved.size === 1 ? 'map' : 'maps'} (${list([...moved], 4)})`);
      } else if (guard.tanks && (ids.size || core.length)) ofTanks.push(guard.keeps);
    }
    if (ofTanks.length) {
      const why = core.length ? `the shared fleet core changed (${list(core, 2)})` : `${ids.size} ${ids.size === 1 ? 'tank' : 'tanks'} changed (${list([...ids.keys()], 6)})`;
      const items = [...new Set(ofTanks.flatMap((keeps) => keeps.split(', ')))];
      parts.push(`${why}, so ${items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]} may be stale`);
    }
    parts.push(...onMaps);
    if (onMaps.length || ofTanks.length) warranted = true;
    if (entry.idScoped) {
      const coreReads = [...reading.values()].some((paths) => paths.some((path) => core.includes(path)));
      if (core.length && coreReads) {
        warranted = true;
        parts.push(`the shared fleet core changed (${list(core, 2)}), so every tank pin's inputs moved`);
      } else if (ids.size && idPinsDeferred) {
        warranted = true;
        parts.push(`${ids.size} tanks changed (${list([...ids.keys()], 6)}): their ${idPinsDeferred} pins are more than lane mode runs`);
      } else if (ids.size) {
        parts.push(`${ids.size} ${ids.size === 1 ? 'tank' : 'tanks'} changed (${list([...ids.keys()], 6)}): lane mode and tank:release:check run their ${idPins} pins; the whole suite is not needed`);
        run = `npm run test:heavy -- ${name} --ids=${[...ids.keys()].join(',')}`;
      }
    } else if (reading.size) {
      warranted = true;
      const counts = new Map();
      for (const paths of reading.values()) for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')).map(([path]) => path);
      parts.push(`${reading.size} of its ${entry.files.length + entry.commands.length} checks read the change (${list(top, 3)})`);
      if (name === 'balance' && balance && !balance.length && !hitMove && !built) parts.push('no tank\'s armour, gun, HP, mobility, size or role changed');
    }
    let timeMs = wallMs[name];
    const onlyReads = warranted && !onMaps.length && !ofTanks.length && !(name === 'balance' && balance?.length) && !hitMove && !built && !entry.idScoped;
    const readFiles = [...reading.keys()].filter((file) => entry.files.includes(file));
    if (onlyReads && readFiles.length === reading.size && readFiles.length <= entry.files.length / 4) {
      run = `npm run test:heavy -- ${name} --only=${readFiles.join(',')}`;
      if (subsetWallMs) timeMs = subsetWallMs(readFiles);
    }
    const time = timeMs === undefined ? '' : ` (${minutes(timeMs)})`;
    rows.push({ suite: name, warranted, line: `${name}${time}: ${parts.join('; ') || 'nothing it checks changed'}`, run });
  }
  return rows;
}

/** The report's lines: warranted suites with their commands, then one line naming the rest. */
export function reportLines(rows) {
  const lines = [];
  for (const row of rows.filter((entry) => entry.warranted)) lines.push(row.line, `  ${row.run}`);
  const optional = rows.filter((entry) => !entry.warranted && entry.run.includes('--ids='));
  for (const row of optional) lines.push(row.line, `  (optional) ${row.run}`);
  const rest = rows.filter((entry) => !entry.warranted && !optional.includes(entry));
  if (rest.length) lines.push(`Not warranted: ${rest.map((row) => row.suite).join(', ')}.`);
  return lines;
}

async function main(argv) {
  exitWithParent();
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const root = resolve(value('root') ?? TOOLS_ROOT);
  const base = chooseBase(root, value('base'), 'test:recommend');
  const load = (path) => import(pathToFileURL(join(root, path)).href);
  const { SELFTEST_SUITES } = await load('tools/selftest-suites.mjs');
  const runner = await load('tools/run-selftests.mjs');
  const { createSelftestCache } = await load('tools/selftest-cache.mjs');
  const registered = Object.values(SELFTEST_SUITES).flat();
  const diff = changedPaths(root, base);
  console.log(`[test:recommend] ${root === TOOLS_ROOT ? '' : `${root}: `}base ${base} (merge base ${diff.mergeBase.slice(0, 10)}), ${diff.paths.length} changed paths`);
  const cache = createSelftestCache({ root, alwaysRun: runner.SELFTEST_FRESH_FILES, fixtureKeyed: runner.SELFTEST_FIXTURE_KEYED_FILES,
    declaredInputs: runner.SELFTEST_DECLARED_INPUTS });
  const { SELFTEST_BROAD_DIRS } = await load('tools/selftest-cache.mjs');
  const index = createReadIndex(cache, root, diff.paths, SELFTEST_BROAD_DIRS);
  const { DECLARED_DYNAMIC = {} } = await load('tools/changed-only/steps.mjs');
  const readOf = withoutScheduleReads(cache, root, DECLARED_DYNAMIC, laneReadOf(cache, index.readOf, root), SELFTEST_BROAD_DIRS);
  const texts = new Map();
  const textOf = (file) => {
    if (!texts.has(file)) { try { texts.set(file, readFileSync(join(root, file), 'utf8')); } catch { texts.set(file, ''); } }
    return texts.get(file);
  };
  const runsOrReads = readsReceiptFile(cache, root, textOf);
  const readers = new Map();
  for (const [name, entry] of Object.entries(MANUAL_SUITES)) {
    const reading = new Map();
    for (const file of [...manualSuiteFiles(registered, [name]), ...entry.commands.map((command) => command[1])]) {
      const paths = diff.paths.filter((path) => READS.has(readOf(file, path)) && readsOnPurpose(path, textOf(file)) && runsOrReads(file, path));
      if (paths.length) reading.set(file, paths);
    }
    readers.set(name, reading);
  }
  const partition = await fleetPartition(root, { world: true });
  const idChanges = changedTankIds(partition, diff.paths, { root, mergeBase: diff.mergeBase });
  const hits = hitResolutionMoves(root, partition, diff.paths);
  // The world steps' Node captures never read a page: their keys hold index.html and 404.html only because the locale
  // route table names them (src/ui/localeRouting.ts) and the probe runtime's browser mode serves them (declared modeOnly).
  const maps = changedMaps(partition.world, diff.paths.filter((path) => !ENTRY_HTML.test(path)), { ids: idChanges.ids, core: idChanges.core });
  const tanks = manualSuiteFiles(registered, ['tanks']);
  const { selectLane } = await import('./test-lane.mjs');
  const { receiptsNaming } = await import('./test-diff.mjs');
  const naming = receiptsNaming(root, tanks, new Set(idChanges.ids.keys()));
  const runMsOf = await receiptRunTimes(root);
  const pins = selectLane({ defaults: [], tanks, changed: diff.paths, readOf: (file, path) => (runsOrReads(file, path) ? readOf(file, path) : null),
    core: partition.core, naming, pinCostOf: runMsOf });
  const idPins = pins.selected.size, idPinsDeferred = pins.deferred.size;
  cache.persist();
  let balance = null;
  if (readers.get('balance').size) {
    try { balance = balanceChanges(await withBaseSources(root, diff.mergeBase, (dir) => balanceInputs(dir)), balanceInputs(root)); }
    catch (error) { console.log(`[test:recommend] balance inputs not compared (${error.message}); the receipts' reads stand`); }
  }
  // A hits suite that only builder paths warrant: compare what the builders emit for the tanks those paths name, the
  // base's tree against this one (builderObservables), only when the answer can drop the suite.
  let builders = null;
  const judgeable = new Set(builderPaths(root, partition, diff.paths, hits));
  const builderOnly = (name) => MANUAL_SUITES[name].hits && readers.get(name).size && !(name === 'balance' && balance?.length)
    && [...readers.get(name).values()].every((paths) => paths.every((path) => judgeable.has(path)));
  if (!hits.length && Object.keys(MANUAL_SUITES).some(builderOnly)) {
    const paths = [...new Set(Object.keys(MANUAL_SUITES).filter((name) => MANUAL_SUITES[name].hits)
      .flatMap((name) => [...readers.get(name).values()].flat()).filter((path) => judgeable.has(path)))].sort();
    const ids = [...changedTankIds(partition, paths, { root, mergeBase: diff.mergeBase }).ids.keys()];
    const started = Date.now();
    try {
      const [before, after] = await Promise.all([
        withBaseSources(root, diff.mergeBase, (dir) => builderObservables(dir, ids), ['src', 'tools', 'package.json']), builderObservables(root, ids)]);
      builders = { paths, ids, moved: builderMoves(before, after), seconds: Math.round((Date.now() - started) / 1000) };
      console.log(`[test:recommend] builders: ${paths.length} ${paths.length === 1 ? 'path' : 'paths'} (${list(paths, 3)}) read by the hits suites; `
        + `${builders.moved.length ? `${builders.moved.length} of ${ids.length} tanks built differently` : `none of their ${ids.length} tanks' finalized specs or HIGH/LOW geometry moved, so those reads drop`} (${builders.seconds} s)`);
    } catch (error) { console.log(`[test:recommend] builder observables not compared (${error.message}); the receipts' reads stand`); }
  }
  const wallMs = Object.fromEntries(Object.keys(MANUAL_SUITES).map((name) => [name, simulateWall(manualSuiteFiles(registered, [name]), runMsOf).wallMs]));
  const rows = recommend({ readers, balance, hits, builders, ids: idChanges.ids, core: idChanges.core, maps, wallMs, idPins, idPinsDeferred,
    subsetWallMs: (files) => simulateWall(files, runMsOf).wallMs });
  for (const line of reportLines(rows)) console.log(line);
  console.log('[test:recommend] Main relays this to the owner; the owner triggers npm run test:heavy.');
  if (value('json')) writeFileSync(resolve(value('json')), JSON.stringify({ base, mergeBase: diff.mergeBase, changed: diff.paths.length,
    rows, balance, hits, builders, ids: Object.fromEntries(idChanges.ids), core: idChanges.core,
    maps: Object.fromEntries(Object.entries(maps).map(([step, moved]) => [step, Object.fromEntries(moved)])),
    readers: Object.fromEntries([...readers].map(([name, reading]) => [name, Object.fromEntries(reading)])) }, null, 1) + '\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = await main(process.argv.slice(2));
}
