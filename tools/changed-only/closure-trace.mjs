#!/usr/bin/env node
// Runtime proof of the changed-only partition (nightly, or after a fleet-structure change; about 20 minutes niced):
// every builder group loads alone through the demand-loaded fleet in its own process, with only the groups of its ids'
// spec chains, and builds each id at the geometry ledger's options. Two things must hold for every id:
//   1. every repository module the process loaded is in the shared core, a group on the id's spec chain, a per-id
//      table, an index map, a module a table imports (a decoder, keyed through the rows it decodes) or the digest tool
//      itself (the resolver's builder key covers all of them);
//   2. the build's ledger digest equals the eager tool factory's row in docs/references/fleet-geometry-ledger.json, so
//      the tools' whole-fleet factory builds the id from exactly those modules.
// A violation means a builder reaches code outside its group closure at run time: the resolver's per-group keys
// would miss it, so fix the import (or merge the groups) before trusting changed-only for that group.
// --combat (266): every registered spec's combat leaves (steps.mjs BALANCE.combat) are moved before the builds
// (combat-perturb.mjs), so 2. proves that no id's geometry follows them: the geometry steps need not key SPEC_COMBAT.
// First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/closure-trace.mjs [--groups=a,b] [--jobs=2] [--json=out.json] [--combat]
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { computeState } from './fingerprint.mjs';
import { AGGREGATES, TABLES } from './steps.mjs';
import { expandGlobs } from './globs.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(value('root') ?? process.cwd());
const jobs = Math.max(1, Number(value('jobs') ?? 2) | 0);
const COMBAT = args.includes('--combat');
const state = computeState({ root });
const groups = value('groups')?.split(',') ?? Object.keys(state.groups).sort();
const ledger = JSON.parse(readFileSync(join(root, 'docs/references/fleet-geometry-ledger.json'), 'utf8')).tanks;
const tableFiles = new Set([...Object.values(TABLES).flatMap((table) => expandGlobs(root, table.files)), ...AGGREGATES]);
const core = new Set(state.partition.core);

const problems = [], report = {};
const queue = [...groups];
async function worker() {
  for (let group = queue.shift(); group; group = queue.shift()) {
    const ids = state.ids.filter((id) => state.groupById[id] === group);
    if (!ids.length) continue;
    const loadIds = [...new Set(ids.flatMap((id) => state.chainOf(id)))];
    const allowedGroups = new Set(ids.flatMap((id) => state.groupChain(id)));
    // the balance pass is keyed through the spec rows (steps.mjs BALANCE), and what a table imports (a decoder) through the
    // rows it decodes (266: auxiliaryRoofGunsCodec.ts failed every group)
    const allowed = new Set([...core, ...[...allowedGroups].flatMap((name) => state.partition.groups[name] ?? []), ...tableFiles,
      ...state.partition.balance, ...state.partition.tableImports, 'tools/fleet-geometry-digest.mjs',
      'tools/changed-only/closure-trace-child.mjs']);
    const started = Date.now();
    let out;
    try {
      ({ stdout: out } = await run('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096',
        ...(COMBAT ? [`--import=${join(import.meta.dirname, 'combat-perturb.mjs')}`] : []),
        join(import.meta.dirname, 'closure-trace-child.mjs'), root, ids.join(','), loadIds.join(',')],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 1_800_000,
        env: { ...process.env, NODE_OPTIONS: '', COT_COMBAT_PERTURB: COMBAT ? '1' : '' } }));
    } catch (error) {
      problems.push(`${group}: child failed: ${String(error.stderr ?? error.message).split('\n').slice(-3).join(' ')}`);
      continue;
    }
    const { loaded, digests } = JSON.parse(out);
    const outside = loaded.map((url) => relative(root, fileURLToPath(url)))
      .filter((file) => !file.startsWith('..') && !file.startsWith('node_modules/') && !allowed.has(file));
    for (const file of outside) problems.push(`${group}: loaded ${file}, outside the core and its chain's group closures`);
    for (const id of ids) for (const [quality, digest] of Object.entries(digests[id] ?? {})) {
      const want = ledger[id]?.[quality];
      if (JSON.stringify(digest) !== JSON.stringify(want)) {
        problems.push(`${group}: ${id} ${quality} ${COMBAT ? 'geometry follows the combat leaves (digest with them moved' : 'demand-loaded digest'} differs from the eager ledger row${COMBAT ? ')' : ''}`);
      }
    }
    report[group] = { ids: ids.length, loadedRepoModules: loaded.length, outside, seconds: Math.round((Date.now() - started) / 1000) };
    console.log(`[closure-trace] ${group}: ${ids.length} ids, ${outside.length} outside, ${report[group].seconds} s`);
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
if (value('json')) writeFileSync(value('json'), `${JSON.stringify({ problems, report }, null, 1)}\n`);
for (const problem of problems) console.error(`[closure-trace] ${problem}`);
console.log(`[closure-trace] ${problems.length ? `FAIL (${problems.length})` : 'PASS'}: ${Object.keys(report).length} groups${COMBAT ? ', combat leaves moved' : ''}`);
if (problems.length) process.exitCode = 1;
