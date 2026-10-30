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
//   - balance: an id's balance inputs moved (spec armour, gun, HP, mobility, size, role: base and head registries).
// `tanks` is id-scoped: lane mode runs the pins of the changed tanks, so the whole suite is warranted only when the
// shared fleet core moved under them. `--root=<dir>` evaluates another checkout (a report on another branch's diff).
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANUAL_SUITES, STALE_GUARDS, manualSuiteFiles } from './selftest-tiers.mjs';
import { balanceChanges, balanceInputs, changedMaps, changedPaths, changedTankIds, fleetPartition, laneReadOf, receiptRunTimes, roman,
  TOOLS_ROOT, withBaseSources } from './test-diff.mjs';
import { simulateWall } from './test-audit.mjs';

const READS = new Set(['named', 'scan']);
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
 * balanceChanges() rows (null when not compared); `ids`: changed tank ids (Map id -> reasons); `core`: changed shared
 * fleet core paths; `maps`: changedMaps() output; `wallMs`: suite -> its idle wall time; `idPins`: the tanks receipts
 * lane mode runs for `ids`, `idPinsDeferred` those it leaves to the owner (more than its share of the suite).
 * Returns one row per suite: { suite, warranted, line, run }.
 */
export function recommend({ suites = MANUAL_SUITES, guards = STALE_GUARDS, readers, balance = null, ids = new Map(), core = [],
  maps = {}, wallMs = {}, idPins = 0, idPinsDeferred = 0 }) {
  const rows = [];
  for (const [name, entry] of Object.entries(suites)) {
    const reading = readers.get(name) ?? new Map();
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
      if (name === 'balance' && balance && !balance.length) parts.push('no tank\'s armour, gun, HP, mobility, size or role changed');
    }
    const time = wallMs[name] === undefined ? '' : ` (${minutes(wallMs[name])})`;
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
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const root = resolve(value('root') ?? TOOLS_ROOT);
  const base = value('base') ?? 'origin/main';
  const load = (path) => import(pathToFileURL(join(root, path)).href);
  const { SELFTEST_SUITES } = await load('tools/selftest-suites.mjs');
  const runner = await load('tools/run-selftests.mjs');
  const { createSelftestCache } = await load('tools/selftest-cache.mjs');
  const registered = Object.values(SELFTEST_SUITES).flat();
  const diff = changedPaths(root, base);
  console.log(`[test:recommend] ${root === TOOLS_ROOT ? '' : `${root}: `}base ${base} (merge base ${diff.mergeBase.slice(0, 10)}), ${diff.paths.length} changed paths`);
  const cache = createSelftestCache({ root, alwaysRun: runner.SELFTEST_FRESH_FILES, fixtureKeyed: runner.SELFTEST_FIXTURE_KEYED_FILES,
    declaredInputs: runner.SELFTEST_DECLARED_INPUTS });
  const readOf = laneReadOf(cache, runner.selftestReadOf, root);
  const readers = new Map();
  for (const [name, entry] of Object.entries(MANUAL_SUITES)) {
    const reading = new Map();
    for (const file of [...manualSuiteFiles(registered, [name]), ...entry.commands.map((command) => command[1])]) {
      const paths = diff.paths.filter((path) => READS.has(readOf(file, path)));
      if (paths.length) reading.set(file, paths);
    }
    readers.set(name, reading);
  }
  const partition = await fleetPartition(root, { world: true });
  const idChanges = changedTankIds(partition, diff.paths, { root, mergeBase: diff.mergeBase });
  const maps = changedMaps(partition.world, diff.paths, { ids: idChanges.ids, core: idChanges.core });
  const tanks = manualSuiteFiles(registered, ['tanks']);
  const { selectLane } = await import('./test-lane.mjs');
  const { receiptsNaming } = await import('./test-diff.mjs');
  const naming = receiptsNaming(root, tanks, new Set(idChanges.ids.keys()));
  const runMsOf = await receiptRunTimes(root);
  const pins = selectLane({ defaults: [], tanks, changed: diff.paths, readOf, core: partition.core, naming, pinCostOf: runMsOf });
  const idPins = pins.selected.size, idPinsDeferred = pins.deferred.size;
  cache.persist();
  let balance = null;
  if (readers.get('balance').size) {
    try { balance = balanceChanges(withBaseSources(root, diff.mergeBase, (dir) => balanceInputs(dir)), balanceInputs(root)); }
    catch (error) { console.log(`[test:recommend] balance inputs not compared (${error.message}); the receipts' reads stand`); }
  }
  const wallMs = Object.fromEntries(Object.keys(MANUAL_SUITES).map((name) => [name, simulateWall(manualSuiteFiles(registered, [name]), runMsOf).wallMs]));
  const rows = recommend({ readers, balance, ids: idChanges.ids, core: idChanges.core, maps, wallMs, idPins, idPinsDeferred });
  for (const line of reportLines(rows)) console.log(line);
  console.log('[test:recommend] Main relays this to the owner; the owner triggers npm run test:heavy.');
  if (value('json')) writeFileSync(resolve(value('json')), JSON.stringify({ base, mergeBase: diff.mergeBase, changed: diff.paths.length,
    rows, balance, ids: Object.fromEntries(idChanges.ids), core: idChanges.core,
    maps: Object.fromEntries(Object.entries(maps).map(([step, moved]) => [step, Object.fromEntries(moved)])),
    readers: Object.fromEntries([...readers].map(([name, reading]) => [name, Object.fromEntries(reading)])) }, null, 1) + '\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = await main(process.argv.slice(2));
}
