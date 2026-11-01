#!/usr/bin/env node
// Runtime check of the changed-only keys: run fleet steps on a few ids under the read trace (trace-reads.mjs, inherited
// by every child process) and fail on any file inside the repository the process read or loaded that the step's key does
// not cover. Writes the steps' outputs: run it in a scratch tree. First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/trace-check.mjs --root=<scratch tree> [--steps=controls,fills] [--ids=kf51_u,mbt70] [--json=out]
//
// --combat (266): instead, each step runs on the ids plain twice and once with every registered spec's combat leaves moved
// (steps.mjs BALANCE.combat, combat-perturb.mjs). A step whose rows follow the moved leaves must name SPEC_COMBAT in its
// rowReads, or the balance pass's levers would not re-run it; rows that differ between the two plain runs fail too (not
// judged). The GPU steps render in a browser the preload never reaches: they key SPEC_COMBAT without this proof.
//
// Covered (an fs read, stat or directory listing): the shared core, the groups on the ids' spec chains, what the tables
// import (a decoder, keyed through the rows it decodes), the step's tool
// closure (directories it names cover what lies under them), every per-id table and index map, the step's own outputs
// and `writes`, its declared `reads`, directories that hold covered files, node_modules (the lockfiles are keyed) and
// .qa-dev scratch. Paths a declaration marks `covered` must still be in that set when read (spare-track reads the source
// lines of the frames that built an id: those files must be in the id's builder key). A module LOAD is covered by that
// set too, or by any other group's closure: the tools import the eager factory, which registers every group's builders
// without running them for other ids; tools/changed-only/closure-trace.mjs proves each group builds alone to the same
// ledger digest. Reads outside the repository (the Node install, temporary directories, the browser) are listed, not
// failed.
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { computeState } from './fingerprint.mjs';
import { expandGlobs } from './globs.mjs';
import { AGGREGATES, DECLARED_DYNAMIC, SPEC_COMBAT, STEPS, TABLES } from './steps.mjs';

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(value('root') ?? process.cwd());
const ids = (value('ids') ?? 'kf51_u,mbt70').split(',').filter(Boolean);
const names = value('steps')?.split(',') ?? STEPS.filter((step) => step.device === 'cpu').map((step) => step.name);
const trace = join(import.meta.dirname, 'trace-reads.mjs');

if (args.includes('--combat')) {
  const perturb = join(import.meta.dirname, 'combat-perturb.mjs');
  const rowsNow = () => JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=4096', join(import.meta.dirname, 'rows-child.mjs'), root],
    { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 1_800_000, env: { ...process.env, NODE_OPTIONS: '' } })).rows;
  const report = { root, ids, combat: {} };
  let failures = 0;
  for (const name of names) {
    const step = STEPS.find((entry) => entry.name === name);
    const out = mkdtempSync(join(tmpdir(), `cot-combat-${name}-`));
    const run = (label, moved) => new Promise((done) => {
      const runArgs = [step.tool, ...step.flags, ...step.scoped(ids), ...(step.report ? [`${step.report}=${join(out, `${label}.report.json`)}`] : []),
        ...(step.json ? [`${step.json}=${join(out, `${label}.run.json`)}`] : [])];
      execFile('nice', ['-n', '10', process.execPath, ...runArgs], {
        cwd: root, maxBuffer: 256 * 1024 * 1024, timeout: 3_600_000,
        env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=4096${moved ? ` --import=${perturb}` : ''}`, COT_COMBAT_PERTURB: moved ? '1' : '' },
      }, (error, stdout, stderr) => done(error ? `${label} exit ${error.code ?? 1}: ${String(stderr).trim().split('\n').slice(-2).join(' / ')}` : null));
    });
    const rowsOf = () => { const all = rowsNow(); return step.outputs.flatMap((table) => ids.map((id) => [`${table}[${id}]`, all[table]?.[id] ?? 'absent'])); };
    const differ = (a, b) => a.filter(([key, row], index) => row !== b[index][1]).map(([key]) => key);
    const started = Date.now();
    const errors = [];
    errors.push(await run('plain1', false)); const plain1 = rowsOf();
    errors.push(await run('plain2', false)); const plain2 = rowsOf();
    errors.push(await run('moved', true)); const moved = rowsOf();
    const unstable = differ(plain1, plain2), follows = differ(plain2, moved);
    if (follows.length) errors.push(await run('restore', false)); // the plain rows back for the next step
    const keys = step.rowReads?.includes(SPEC_COMBAT) ?? false;
    const problems = [...errors.filter(Boolean), ...unstable.map((key) => `${key} differs between two plain runs`),
      ...(keys ? [] : follows.map((key) => `${key} follows the combat leaves, but rowReads lacks ${SPEC_COMBAT}`))];
    report.combat[name] = { keysCombat: keys, follows, unstable, problems, seconds: Math.round((Date.now() - started) / 1000) };
    if (problems.length) failures++;
    console.log(`[trace-check --combat] ${name}: ${follows.length ? `rows follow the combat leaves (${follows.join(', ')})` : 'rows ignore the combat leaves'}; ${keys ? 'keys' : 'does not key'} ${SPEC_COMBAT}; ${problems.length ? `FAIL: ${problems.join('; ')}` : 'ok'} (${report.combat[name].seconds} s)`);
  }
  if (value('json')) writeFileSync(value('json'), `${JSON.stringify(report, null, 1)}\n`);
  console.log(`[trace-check --combat] ${failures ? `FAIL (${failures})` : 'PASS'}: ${names.length} step(s) on ${ids.join(',')}`);
  process.exit(failures ? 1 : 0);
}

const state = computeState({ root, steps: STEPS });
const rel = (path) => relative(root, path);
const insideRoot = (path) => path === root || path.startsWith(root + sep);
const isDirectory = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };

const tableFiles = Object.values(TABLES).flatMap((table) => expandGlobs(root, table.files));
const groups = [...new Set(ids.flatMap((id) => state.groupChain(id)))];
const report = { root, ids, steps: {} };
let failures = 0;
for (const name of names) {
  const step = STEPS.find((entry) => entry.name === name);
  const s = state.steps[name];
  // Files the step's key holds for these ids.
  // the balance pass is keyed through the spec rows (steps.mjs BALANCE), and what a table imports (a decoder) through the
  // rows it decodes
  const keyed = new Set([...state.partition.core, ...state.partition.balance, ...state.partition.tableImports,
    ...groups.flatMap((group) => state.partition.groups[group] ?? []),
    ...s.toolFiles, ...s.foreignTables, ...tableFiles, ...AGGREGATES, ...s.outputFiles, ...step.files,
    ...expandGlobs(root, [...(step.writes ?? []), ...(step.reads ?? [])]), step.tool, ...(step.entries ?? []),
    ...Object.entries(DECLARED_DYNAMIC).filter(([file]) => s.toolFiles.includes(file) || file === step.tool)
      .flatMap(([, declaration]) => [...expandGlobs(root, declaration.reads ?? []), ...(declaration.scheduleOnly ?? [])]),
    'package-lock.json', 'node_modules/.package-lock.json']);
  // Directories in the key (fingerprinted whole) cover what lies under them; a directory holding a keyed file may be
  // listed or stat'ed (the generators read their own output directories).
  const keyedDirs = [...keyed].filter((entry) => isDirectory(join(root, entry)));
  const ancestors = new Set();
  for (const entry of keyed) for (let dir = dirname(entry); dir && dir !== '.'; dir = dirname(dir)) ancestors.add(dir);
  const eagerGroups = new Set(Object.values(state.partition.groups).flat());
  // Declared verdict-only reads (steps.mjs `verdictOnly`): files whose contents reach only printed problems.
  const verdictOnly = new Set(expandGlobs(root, Object.entries(DECLARED_DYNAMIC)
    .filter(([file]) => s.toolFiles.includes(file) || file === step.tool).flatMap(([, declaration]) => declaration.verdictOnly ?? [])));
  const classify = (path, loadedOnly) => {
    const r = rel(path);
    if (r === 'node_modules' || r.startsWith('node_modules/') || r === '.qa-dev' || r.startsWith('.qa-dev/')) return 'ok';
    if (keyed.has(r) || keyedDirs.some((dir) => r.startsWith(`${dir}/`))) return 'ok';
    if (ancestors.has(r) && isDirectory(path)) return 'ok';
    if (loadedOnly && eagerGroups.has(r)) return 'eager';
    if (!loadedOnly && verdictOnly.has(r)) return 'verdict';
    return 'uncovered';
  };
  const out = mkdtempSync(join(tmpdir(), `cot-trace-${name}-`));
  const runArgs = [step.tool, ...step.flags, ...step.scoped(ids), ...(step.report ? [`${step.report}=${join(out, 'report.json')}`] : []),
    ...(step.json ? [`${step.json}=${join(out, 'run.json')}`] : [])];
  const started = Date.now();
  const result = await new Promise((done) => execFile('nice', ['-n', '10', process.execPath, ...runArgs], {
    cwd: root, maxBuffer: 256 * 1024 * 1024, timeout: 3_600_000,
    env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=4096 --import=${trace}`, COT_TRACE_READS_OUT: join(out, 'trace') },
  }, (error, stdout, stderr) => done({ error, stderr })));
  let files = [];
  try { files = readdirSync(join(out, 'trace')).filter((entry) => entry.endsWith('.json')); } catch {}
  const reads = new Set(), loads = new Set(), external = new Set();
  for (const file of files) {
    const record = JSON.parse(readFileSync(join(out, 'trace', file), 'utf8'));
    for (const path of [...record.reads, ...record.listed]) (insideRoot(path) ? reads : external).add(path);
    for (const path of record.loads) (insideRoot(path) ? loads : external).add(path);
  }
  const verdicts = new Map();
  for (const path of new Set([...reads, ...loads])) verdicts.set(path, classify(path, !reads.has(path)));
  const pick = (kind) => [...verdicts].filter(([, verdict]) => verdict === kind).map(([path]) => rel(path)).sort();
  const uncovered = pick('uncovered'), eager = pick('eager'), verdict = pick('verdict');
  const entry = { exit: result.error ? (result.error.code ?? 1) : 0, seconds: Math.round((Date.now() - started) / 1000),
    processes: files.length, reads: reads.size, loads: loads.size, uncovered, eagerLoads: eager, verdictReads: verdict,
    external: [...new Set([...external].map((path) => path.split(sep).slice(0, 5).join(sep)))].sort() };
  report.steps[name] = entry;
  const bad = uncovered.length || entry.exit !== 0 || !files.length;
  if (bad) failures++;
  console.log(`[trace-check] ${name}: exit ${entry.exit}, ${files.length} process(es), ${reads.size} repository reads, ${loads.size} module loads (${eager.length} other groups' builders registered by the eager factory), ${verdict.length} verdict-only reads, ${uncovered.length} uncovered (${entry.seconds} s)`);
  for (const path of uncovered.slice(0, 30)) console.log(`  uncovered: ${path}`);
  if (entry.exit !== 0) console.log(String(result.stderr).split('\n').slice(-6).join('\n'));
}
if (value('json')) writeFileSync(value('json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`[trace-check] ${failures ? `FAIL (${failures})` : 'PASS'}: ${names.length} step(s) on ${ids.join(',')}`);
if (failures) process.exitCode = 1;
