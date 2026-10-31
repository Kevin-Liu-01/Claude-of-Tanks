#!/usr/bin/env node
// The manual tier, run by name: what the owner triggers. First-party tooling: Kevin B. Liu.
//
//   npm run test:heavy                                # the suites, their size and what each covers
//   npm run test:heavy -- <suite> [<suite>...]        # their receipts (one runner pool), then their commands
//   npm run test:heavy -- all
//   npm run test:heavy -- tanks --ids=<ids>           # an id-scoped suite's receipts that name or read those ids
//   npm run test:heavy -- <suite> --only=<glob> | --dry-run
//
// Owner 2026-10-30: strenuous suites are "manually recommended annd triggered by ME". npm test, the release gate,
// hooks and CI never call this (tools/selftest-tiers.selftest.mjs holds the callers); tank:release:check calls only
// the id-scoped `tanks --ids=<its ids>` form. A CI environment is refused.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { MANUAL_SUITES, MANUAL_SUITE_NAMES, manualSuiteFiles, namedIds, parseSuiteNames } from './selftest-tiers.mjs';
import { fleetPartition, receiptRunTimes, TOOLS_ROOT } from './test-diff.mjs';
import { uniqueIds } from './id-list.mjs';

/** Receipts of an id-scoped suite for `ids`: those naming an id, or whose closure holds a file of an id's own group. */
export function idScopedSelection(files, ids, { textOf, groupFilesOf, readsAny }) {
  const wanted = new Set(ids), out = new Map();
  const groupFiles = [...new Set(ids.flatMap((id) => groupFilesOf(id)))];
  for (const file of files) {
    const named = [...namedIds(textOf(file), wanted)];
    if (named.length) { out.set(file, `names ${named.join(', ')}`); continue; }
    const read = readsAny(file, groupFiles);
    if (read) out.set(file, `reads ${read}`);
  }
  return out;
}

async function main(argv) {
  const suites = argv.filter((arg) => !arg.startsWith('--'));
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const registered = Object.values(SELFTEST_SUITES).flat();
  if (!suites.length) {
    const runMsOf = await receiptRunTimes();
    console.log('[test:heavy] manual suites (Main recommends with npm run test:recommend; the owner triggers):');
    for (const name of MANUAL_SUITE_NAMES) {
      const files = manualSuiteFiles(registered, [name]);
      const minutes = files.reduce((sum, file) => sum + (runMsOf(file) ?? 0), 0) / 60_000;
      console.log(`  ${name.padEnd(8)} ${String(files.length).padStart(4)} receipts ~${minutes.toFixed(0)} CPU-min${MANUAL_SUITES[name].commands.length ? ` + ${MANUAL_SUITES[name].commands.map((command) => command.slice(1).join(' ')).join('; ')}` : ''}: ${MANUAL_SUITES[name].about}`);
    }
    console.log('usage: npm run test:heavy -- <suite...>|all [--ids=<ids> for tanks] [--only=<glob>] [--dry-run]');
    return 0;
  }
  if (process.env.CI) { console.error('[test:heavy] refused: manual suites are owner-triggered; CI never runs them'); return 2; }
  let names;
  try { names = parseSuiteNames(suites.join(',')); } catch (error) { console.error(`[test:heavy] ${error.message}`); return 2; }
  let ids;
  try { ids = uniqueIds(value('ids')?.split(',').filter(Boolean) ?? null, 'test:heavy --ids'); }
  catch (error) { console.error(`[test:heavy] ${error.message}`); return 2; }
  if (ids && names.some((name) => !MANUAL_SUITES[name].idScoped)) {
    console.error(`[test:heavy] --ids narrows an id-scoped suite (${MANUAL_SUITE_NAMES.filter((name) => MANUAL_SUITES[name].idScoped).join(', ')}) only`);
    return 2;
  }
  const runnerArgs = ['tools/run-selftests.mjs', 'all', `--heavy=${names.join(',')}`, ...argv.filter((arg) => arg.startsWith('--only='))];
  const dir = mkdtempSync(join(tmpdir(), 'cot-test-heavy-'));
  try {
    if (ids) {
      const partition = await fleetPartition(TOOLS_ROOT);
      const unknown = ids.filter((id) => !partition.ids.includes(id));
      if (unknown.length) { console.error(`[test:heavy] unknown tank ids: ${unknown.join(', ')}`); return 2; }
      const { createSelftestCache } = await import('./selftest-cache.mjs');
      const runner = await import('./run-selftests.mjs');
      const cache = createSelftestCache({ alwaysRun: runner.SELFTEST_FRESH_FILES, fixtureKeyed: runner.SELFTEST_FIXTURE_KEYED_FILES,
        declaredInputs: runner.SELFTEST_DECLARED_INPUTS });
      const selection = idScopedSelection(manualSuiteFiles(registered, names), ids, {
        textOf: (file) => { try { return readFileSync(join(TOOLS_ROOT, file), 'utf8'); } catch { return ''; } },
        groupFilesOf: (id) => partition.groupChain(id).flatMap((group) => partition.groups[group] ?? []),
        readsAny: (file, paths) => paths.find((path) => runner.selftestReadOf(cache, file, path, TOOLS_ROOT) === 'named') ?? null,
      });
      cache.persist();
      console.log(`[test:heavy] ${names.join(', ')} --ids=${ids.join(',')}: ${selection.size} receipts`);
      for (const [file, why] of selection) console.log(`  ${file}: ${why}`);
      if (!selection.size) return 0;
      const listFile = join(dir, 'ids.txt');
      writeFileSync(listFile, [...selection.keys()].join('\n') + '\n');
      runnerArgs.push(`--only-from=${listFile}`);
    }
    const commands = ids || argv.some((arg) => arg.startsWith('--only=')) ? [] : names.flatMap((name) => MANUAL_SUITES[name].commands);
    console.log(`[test:heavy] manual tier, triggered by name: ${names.join(', ')}`);
    if (argv.includes('--dry-run')) {
      console.log(`  node ${runnerArgs.join(' ')}`);
      for (const command of commands) console.log(`  ${command.join(' ')}`);
      return 0;
    }
    let status = spawnSync(process.execPath, runnerArgs, { cwd: TOOLS_ROOT, stdio: 'inherit' }).status ?? 1;
    for (const [command, ...args] of commands) {
      console.log(`\n[test:heavy] ${command} ${args.join(' ')}`);
      const child = spawnSync(command === 'node' ? process.execPath : command, args, { cwd: TOOLS_ROOT, stdio: 'inherit' });
      if (child.status !== 0 && !status) status = child.status ?? 1;
    }
    console.log(`[test:heavy] ${status ? 'FAIL' : 'PASS'}: ${names.join(', ')}`);
    return status;
  } finally {
    rmSync(dir, { recursive: true, force: true }); // this run's own list file
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = await main(process.argv.slice(2));
}
