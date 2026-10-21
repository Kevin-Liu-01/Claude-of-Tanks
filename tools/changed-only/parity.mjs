#!/usr/bin/env node
// Changed-only parity: a changed-only tree against a full-regen tree of the same commit, byte for byte.
// First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/parity.mjs --changed=<tree C> --full=<tree F> [--base=<tree B>] [--steps=a,b]
//
// Compares every output file the step table names (tables and whole files, the manifest included) between C and F
// and fails on any byte difference. With --base (the tree both started from) it also proves the resolver's sets were
// supersets of the truth: for each step, every id whose rows differ between F and B must be among the ids C's chain
// ran (every successful run recorded in C's .qa-dev/changed-only/<stamp>.json summaries).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expandGlobs } from './globs.mjs';
import { MANIFEST_PATH } from './fingerprint.mjs';
import { STEPS, TABLES } from './steps.mjs';

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const changedRoot = resolve(value('changed') ?? '.'), fullRoot = resolve(value('full') ?? '.');
const baseRoot = value('base') ? resolve(value('base')) : null;
const only = value('steps')?.split(',') ?? null;
const steps = STEPS.filter((step) => !only || only.includes(step.name));

const read = (root, file) => { try { return readFileSync(join(root, file)); } catch { return null; } };
const filesOf = (step) => [...new Set([...step.outputs.flatMap((table) => TABLES[table].files), ...step.files])];

function rowsIn(root) {
  // One child per tree: the same reader the resolver uses (tools/changed-only/rows-child.mjs).
  const out = execFileSync(process.execPath, ['--max-old-space-size=4096', join(import.meta.dirname, 'rows-child.mjs'), root],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(out).rows;
}

let failures = 0;
const report = { files: {}, oracle: {} };
for (const step of steps) {
  for (const pattern of filesOf(step)) {
    const names = new Set([...expandGlobs(changedRoot, [pattern]), ...expandGlobs(fullRoot, [pattern])]);
    for (const file of names) {
      const a = read(changedRoot, file), b = read(fullRoot, file);
      const same = a && b && a.equals(b);
      report.files[file] = same ? 'identical' : !a || !b ? 'missing on one side' : 'differs';
      if (!same) { failures++; console.error(`[parity] ${step.name}: ${file} ${report.files[file]}`); }
    }
  }
}
const manifestSame = read(changedRoot, MANIFEST_PATH)?.equals(read(fullRoot, MANIFEST_PATH) ?? Buffer.alloc(0));
report.files[MANIFEST_PATH] = manifestSame ? 'identical' : 'differs';
if (!manifestSame) { failures++; console.error(`[parity] ${MANIFEST_PATH} differs`); }

if (baseRoot) {
  // Which ids C's chain ran per step: every run of every summary (.qa-dev/changed-only/<stamp>.json) in that tree.
  const qa = join(changedRoot, '.qa-dev/changed-only');
  const summaries = existsSync(qa) ? readdirSync(qa).filter((name) => /^\d{4}-.*Z\.json$/.test(name)).sort() : [];
  const ran = {};
  for (const name of summaries) {
    const summary = JSON.parse(readFileSync(join(qa, name), 'utf8'));
    if (summary.dryRun) continue;
    for (const run of summary.runs ?? []) if (Array.isArray(run.ids) && run.code === 0) {
      for (const id of run.ids) (ran[run.step] ??= new Set()).add(id);
    }
  }
  const fullRows = rowsIn(fullRoot), baseRows = rowsIn(baseRoot);
  for (const step of steps) {
    const truth = new Set();
    for (const table of step.outputs) {
      const ids = new Set([...Object.keys(fullRows[table] ?? {}), ...Object.keys(baseRows[table] ?? {})]);
      for (const id of ids) if (fullRows[table]?.[id] !== baseRows[table]?.[id]) truth.add(id);
    }
    const resolved = ran[step.name] ?? new Set();
    const missed = [...truth].filter((id) => !resolved.has('*') && !resolved.has(id));
    report.oracle[step.name] = { changedRows: [...truth].sort(), ran: resolved.has('*') ? 'all' : [...resolved].sort(), missed };
    if (missed.length) { failures++; console.error(`[parity] ${step.name}: rows moved without a changed-only run: ${missed.join(',')}`); }
  }
}
console.log(JSON.stringify(report, null, 1));
console.log(`[parity] ${failures ? `FAIL (${failures})` : 'PASS'}: ${Object.values(report.files).filter((v) => v === 'identical').length} files identical`);
if (failures) process.exitCode = 1;
