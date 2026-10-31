#!/usr/bin/env node
// Lane mode: the receipts a lane's diff can move, and nothing else. First-party tooling: Kevin B. Liu.
//
//   npm run test:lane [-- --base=<ref>] [--dry-run] [--json=<path>]
//
// Selection (every selected receipt prints its reason):
//   - a default-tier receipt whose input closure holds a changed path: the result cache's own closure and listing
//     declarations (run-selftests.mjs selftestReadOf; a match through the broad fallback alone is not a read), and the
//     closures of the tools it spawns (tools/test-diff.mjs laneReadOf, from the cache's run set);
//   - a default-tier or `tanks` receipt that names a changed tank id (the changed-only fleet partition: a group's files,
//     a table's moved rows, a path naming the id: tools/test-diff.mjs changedTankIds);
//   - a `tanks` receipt whose closure holds a changed path outside the shared fleet core. One that reads only core
//     files is not run here: every id may move, so `npm run test:recommend` lists the whole suite for the owner.
//     Nor are a lane's pins when they come to more than a quarter of the suite's CPU (a whole-fleet regeneration
//     names nearly every id): that is the suite itself, which test:recommend names and the owner triggers.
// A negative control runs on every invocation: a receipt whose closure holds a file is selected when that file changes,
// and every changed receipt file is selected. A control that fails exits 2 before anything runs.
// `--root=<dir>` evaluates another checkout's registry and closures (a report only: it implies --dry-run).
// A branch carrying an integration tree beyond the base (origin/integ/*) gets the suggested --base printed first;
// `--base=integ` takes it. The command stops its children and exits on SIGTERM/SIGINT/SIGHUP/SIGALRM or its parent's exit.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultTierFiles, manualSuiteFiles } from './selftest-tiers.mjs';
import { changedPaths, changedTankIds, createReadIndex, exitWithParent, fleetPartition, laneReadOf, receiptRunTimes, receiptsNaming,
  chooseBase, runTracked, TOOLS_ROOT } from './test-diff.mjs';

const READS = new Set(['named', 'scan', 'observed']);
const say = (read, path) => `${read === 'scan' ? 'lists' : read === 'observed' ? 'was seen reading' : 'reads'} ${path}`;

/**
 * The lane selection as data. `readOf(file, path)` is the cache's read ('scan', 'named', 'broad' or null), `core` the
 * shared fleet core's paths, `naming` the receipts that name changed ids (file -> ids). With `pinCostOf` (ms per
 * receipt), pins costing more than `pinShare` of the whole tanks suite are all moved to `deferred`, except the pins the
 * diff edits itself. Returns
 * { selected: Map(file -> { tier, reasons }), coreOnly: Map(file -> paths), deferred: Map(file -> { tier, reasons }) }.
 */
export const LANE_PIN_SHARE = 0.25;
export function selectLane({ defaults, tanks, changed, readOf, core = new Set(), naming = new Map(), pinCostOf = null,
  pinShare = LANE_PIN_SHARE }) {
  const selected = new Map(), coreOnly = new Map();
  const add = (file, tier, why) => {
    if (!selected.has(file)) selected.set(file, { tier, reasons: [] });
    selected.get(file).reasons.push(why);
  };
  const tankSet = new Set(tanks);
  for (const file of defaults) for (const path of changed) {
    const read = readOf(file, path);
    if (READS.has(read)) add(file, 'default', say(read, path));
  }
  for (const file of tanks) {
    const reads = changed.map((path) => [path, readOf(file, path)]).filter(([, read]) => READS.has(read));
    const own = reads.filter(([path]) => !core.has(path));
    for (const [path, read] of own) add(file, 'tanks', say(read, path));
    if (!own.length && reads.length) coreOnly.set(file, reads.map(([path]) => path));
  }
  for (const [file, ids] of naming) {
    if (!tankSet.has(file) && !defaults.includes(file)) continue;
    add(file, tankSet.has(file) ? 'tanks' : 'default', `names ${ids.join(', ')} (changed)`);
    coreOnly.delete(file);
  }
  const deferred = new Map();
  if (pinCostOf) {
    const cost = (files) => files.reduce((sum, file) => sum + (pinCostOf(file) ?? 0), 0);
    const pins = [...selected].filter(([, entry]) => entry.tier === 'tanks').map(([file]) => file);
    // a pin the lane edited itself always runs
    const edited = new Set(changed);
    if (pins.length && cost(pins) > pinShare * cost(tanks)) for (const file of pins) {
      if (edited.has(file)) continue;
      deferred.set(file, selected.get(file)); selected.delete(file);
    }
  }
  return { selected, coreOnly, deferred };
}

/**
 * The negative control: (1) every changed path that is itself a receipt of the selection's tiers is selected, and
 * (2) a probe receipt whose closure holds a file outside the broad fallback is selected for a change to that file alone.
 * Returns the failures (empty when the control holds) and the probe it used.
 */
export function laneControl({ defaults, tanks, changed, selected, readOf, closureOf, root }) {
  const failures = [];
  for (const path of changed) if ((defaults.includes(path) || tanks.includes(path)) && !selected.has(path)) {
    failures.push(`${path} changed and is a receipt, but was not selected`);
  }
  let probe = null;
  for (const file of defaults) {
    const input = [...closureOf(file)].map((path) => path.slice(root.length + 1))
      .find((path) => path !== file && /^(src|server|tools)\/.+\.(ts|mjs)$/.test(path) && readOf(file, path) === 'named');
    if (input) { probe = { receipt: file, input }; break; }
  }
  if (!probe) failures.push('no probe receipt with a named source input');
  else if (!selectLane({ defaults, tanks, changed: [probe.input], readOf }).selected.has(probe.receipt)) {
    failures.push(`${probe.receipt} reads ${probe.input} but a change to it did not select it`);
  }
  return { failures, probe };
}

async function main(argv) {
  exitWithParent();
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const root = resolve(value('root') ?? TOOLS_ROOT);
  const dryRun = argv.includes('--dry-run') || root !== TOOLS_ROOT;
  const base = chooseBase(root, value('base'), 'test:lane');
  const load = (path) => import(pathToFileURL(join(root, path)).href);
  const { SELFTEST_SUITES } = await load('tools/selftest-suites.mjs');
  const runner = await load('tools/run-selftests.mjs');
  const { createSelftestCache } = await load('tools/selftest-cache.mjs');
  const registered = Object.values(SELFTEST_SUITES).flat();
  const defaults = defaultTierFiles(registered), tanks = manualSuiteFiles(registered, ['tanks']);
  const diff = changedPaths(root, base, value('head') ? { head: value('head') } : {});
  console.log(`[test:lane] ${root === TOOLS_ROOT ? '' : `${root}: `}base ${base} (merge base ${diff.mergeBase.slice(0, 10)}), ${diff.paths.length} changed paths`);
  const cache = createSelftestCache({ root, alwaysRun: runner.SELFTEST_FRESH_FILES, fixtureKeyed: runner.SELFTEST_FIXTURE_KEYED_FILES,
    declaredInputs: runner.SELFTEST_DECLARED_INPUTS });
  const index = createReadIndex(cache, root, diff.paths, (await load('tools/selftest-cache.mjs')).SELFTEST_BROAD_DIRS);
  const readOne = (file, path) => (index.has(path) ? index.readOf(file, path) : runner.selftestReadOf(cache, file, path, root));
  const readOf = laneReadOf(cache, readOne, root);
  const partition = await fleetPartition(root);
  const idChanges = changedTankIds(partition, diff.paths, { root, mergeBase: diff.mergeBase, head: value('head') ?? 'HEAD' });
  const naming = receiptsNaming(root, [...defaults, ...tanks], new Set(idChanges.ids.keys()));
  const runMsOf = await receiptRunTimes(root);
  const { selected, coreOnly, deferred } = selectLane({ defaults, tanks, changed: diff.paths, readOf, core: partition.core, naming,
    pinCostOf: runMsOf });
  const control = laneControl({ defaults, tanks, changed: diff.paths, selected, readOf, root,
    closureOf: (file) => cache.closureOf(resolve(root, file)) });
  cache.persist();

  const ids = [...idChanges.ids.keys()];
  if (ids.length) console.log(`[test:lane] tank ids changed (${ids.length}): ${ids.join(', ')}`);
  if (idChanges.core.length) console.log(`[test:lane] shared fleet core changed (${idChanges.core.length}: ${idChanges.core.slice(0, 4).join(', ')}${idChanges.core.length > 4 ? ', ...' : ''}): every id may move; npm run test:recommend lists the manual suites`);
  const rows = [...selected].map(([file, entry]) => ({ file, ...entry }));
  for (const tier of ['default', 'tanks']) {
    const mine = rows.filter((row) => row.tier === tier);
    const pool = tier === 'default' ? defaults.length : tanks.length;
    console.log(`[test:lane] ${tier === 'tanks' ? 'tanks (id-scoped)' : 'default tier'}: ${mine.length} of ${pool} receipts selected`);
    for (const row of mine) console.log(`  ${row.file}: ${row.reasons.slice(0, 2).join('; ')}${row.reasons.length > 2 ? `; +${row.reasons.length - 2} more` : ''}`);
  }
  if (coreOnly.size) console.log(`[test:lane] not run here: ${coreOnly.size} tanks receipts read only the shared fleet core (whole-suite run: npm run test:recommend)`);
  if (deferred.size) {
    const minutes = [...deferred.keys()].reduce((sum, file) => sum + (runMsOf(file) ?? 0), 0) / 60_000;
    console.log(`[test:lane] not run here: the ${deferred.size} tanks pins of the changed ids (~${minutes.toFixed(0)} CPU-min) are more than a quarter of the suite; npm run test:recommend names it for the owner`);
  }
  if (partition.errors.length) console.log(`[test:lane] fleet partition notes: ${partition.errors.slice(0, 3).join('; ')}`);
  const verdict = control.failures.length ? `FAIL: ${control.failures.join('; ')}` : 'PASS';
  console.log(`[test:lane] negative control: ${control.probe ? `${control.probe.receipt} for a change to ${control.probe.input}; ` : ''}every changed receipt selected: ${verdict}`);
  const report = { base, mergeBase: diff.mergeBase, changed: diff.paths, ids: Object.fromEntries(idChanges.ids), core: idChanges.core,
    selected: rows, coreOnly: Object.fromEntries(coreOnly), deferred: [...deferred.keys()], control };
  if (value('json')) writeFileSync(resolve(value('json')), JSON.stringify(report, null, 1) + '\n');
  if (control.failures.length) return 2;
  if (dryRun) { console.log('[test:lane] --dry-run: nothing run'); return 0; }

  const dir = mkdtempSync(join(tmpdir(), 'cot-test-lane-'));
  try {
    let status = 0;
    for (const [tier, extra] of [['default', []], ['tanks', ['--heavy=tanks']]]) {
      const files = rows.filter((row) => row.tier === tier).map((row) => row.file);
      if (!files.length) continue;
      const list = join(dir, `${tier}.txt`);
      writeFileSync(list, files.join('\n') + '\n');
      const code = await runTracked(process.execPath, ['tools/run-selftests.mjs', 'all', ...extra, `--only-from=${list}`], { cwd: root, stdio: 'inherit' });
      if (code !== 0 && !status) status = code;
    }
    console.log(`[test:lane] ${status ? 'FAIL' : 'PASS'}: ${rows.length} receipts; the manual suites are the owner's (npm run test:recommend)`);
    return status;
  } finally {
    rmSync(dir, { recursive: true, force: true }); // this run's own list files
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = await main(process.argv.slice(2));
}
