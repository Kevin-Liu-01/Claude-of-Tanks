#!/usr/bin/env node
// `npm run typecheck`: ONE TypeScript 7 (native) compile of tsconfig.json with the unused-symbol flags on,
// and Oxlint (`npm run lint`, .oxlintrc.json) beside it.
// - Every diagnostic that is not an unused symbol fails the check, exactly as a plain `tsc --noEmit` would:
//   the unused flags only add diagnostics, so the plain compile's errors are this compile's other ones.
// - Unused symbols fail only in the core runtime owners (isCoreRuntime below).
// - A compiler that is killed or prints anything but diagnostics fails the check too.
// - Oxlint runs while the compiler does (it takes seconds, the compiler minutes under load) and fails the check on
//   any finding. A checkout whose node_modules predates it skips it with a notice; `npm ci` installs it.
// - Every tracked script file has an owner (tools/typecheck-coverage.mjs): the compile lists the files it checked
//   (--listFiles), oxlint's no-undef owns the JavaScript, and the rest sit in that module's one exclusion list with a
//   reason. A file with no owner fails the check (typecheck-coverage-279).
// - The last line of every run is the whole verdict, `typecheck: PASSED` or `typecheck: FAILED: <why>`, and the whole
//   report goes to one stream (stdout on a pass, stderr on a failure), so `2>&1 | tail -1` reads it. Until 279 the last
//   line was oxlint's own: a lane read "oxlint clean" under `| tail -1` over two TS2304s (dome-detail-275, 2026-11-24).
// Until 2026-10-22 typecheck ran two full compiles: plain tsc, then this file (then core-unused-check.mjs)
// with the unused flags. One compile gives the same verdicts in half the time.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { coverageReport, coverageSummary, lintIgnorePatterns, listedSources, trackedScripts, typecheckCoverage } from './typecheck-coverage.mjs';

// Byte-authenticated sources keep their remaining unused names until the receipts that compare their
// exact text move: the map configs (badlandsRelief's historical byte projection, villageWear and
// mangroveWaterPalette's config digests) and their registry, plus the vehicle profiles whose whole
// source a history receipt hashes. Every other file under src/vehicles and src/world/maps is gated.
const TEXT_PINNED = new Set([
  'src/vehicles/profiles/chieftain10X.ts', // chieftain10XPublishedFoundation
  'src/vehicles/profiles/merkavaX.ts', // merkavaXEndReturnHistory
  'src/vehicles/profiles/t72buX.ts', // fixedSourceSkirtPaint
  ...[
    'alpine', 'autumn', 'badlands', 'blackglass', 'caldera', 'coastal', 'copperMesa', 'delta', 'desert', 'fjord',
    'index', 'mars', 'railyard', 'ruinspires', 'skybridge', 'steppe', 'titanGorge', 'urban', 'whiteout', 'winter',
  ].map((name) => `src/world/maps/${name}.ts`),
]);

const isCoreRuntime = (root, fileName) => {
  const path = relative(root, resolve(root, fileName)).split(sep).join('/');
  if (path === 'src/main.ts' || path === 'middleware.ts' || path === 'vite.config.ts') return true;
  if (path.startsWith('server/') || path.startsWith('api/')) return true;
  if (TEXT_PINNED.has(path)) return false;
  return /^(?:src\/(?:app|audio|dev|engine|fx|game|mp|net|sim|ui|vehicles|world)\/)/.test(path);
};
// Diagnostics that exist only because of --noUnusedLocals/--noUnusedParameters, and the ones the core owners
// are gated on (6138, an unused private property, and 6205, unused type parameters, stay ungated).
const UNUSED_CODES = new Set([6133, 6138, 6192, 6196, 6198, 6199, 6205]);
const GATED_UNUSED_CODES = new Set([6133, 6192, 6196, 6198, 6199]);

/**
 * The verdict on one compile's output: { ok, kind: 'clean' | 'type' | 'unused' | 'compiler', report }.
 * One block per diagnostic: its `file(line,col): error TSnnnn:` (or bare `error TSnnnn:`) line plus the indented
 * lines that continue it (message chains, related information).
 */
export function typecheckVerdict({ output, status, root = process.cwd() }) {
  const diagnostics = [], unknown = [];
  for (const line of output.split('\n')) {
    const located = /^(.*?)\(\d+,\d+\): error TS(\d+):/.exec(line);
    const global = located ? null : /^error TS(\d+):/.exec(line);
    if (located || global) diagnostics.push({ file: located?.[1] ?? null, code: Number(located?.[2] ?? global[1]), text: line });
    else if (/^\s/.test(line) && line.trim() && diagnostics.length) diagnostics.at(-1).text += `\n${line}`;
    else if (line.trim()) unknown.push(line);
  }
  // A killed compiler, or one that printed something other than diagnostics (a crash after part of its output),
  // proves nothing: the diagnostics it did print may be a fraction of the whole.
  if (status === null || unknown.length || (status !== 0 && !diagnostics.length)) {
    return { ok: false, kind: 'compiler', report: output, count: 0 };
  }
  const typeErrors = diagnostics.filter(({ code }) => !UNUSED_CODES.has(code));
  if (typeErrors.length) {
    return { ok: false, kind: 'type', report: typeErrors.map(({ text }) => text).join('\n'), count: typeErrors.length };
  }
  const coreUnused = diagnostics.filter(({ file, code }) => GATED_UNUSED_CODES.has(code) && file && isCoreRuntime(root, file));
  if (coreUnused.length) {
    return { ok: false, kind: 'unused', report: coreUnused.map(({ text }) => text).join('\n'), count: coreUnused.length };
  }
  return { ok: true, kind: 'clean', report: '', count: 0 };
}

// A line `--listFiles` prints: an absolute path to a source the program read. Anything else is the compile's own output.
const LISTED_FILE = /^\/\S.*\.(?:d\.[cm]?ts|[cm]?tsx?|[cm]?js|json)$/;

/** Splits a `--listFiles` compile's output into the files it listed and the rest (the diagnostics' text). */
export function splitListing(output) {
  const listed = [], rest = [];
  for (const line of output.split('\n')) (LISTED_FILE.test(line) && !/\(\d+,\d+\): error TS/.test(line) ? listed : rest).push(line);
  return { listed, output: rest.join('\n') };
}

/** The last line of a run: the whole verdict, so a reader of one line reads every check's. */
export function finalLine({ verdict, lint, coverage }) {
  const failures = [];
  if (!verdict.ok) {
    failures.push(verdict.kind === 'type' ? `${verdict.count} TypeScript error(s)`
      : verdict.kind === 'unused' ? `${verdict.count} unused symbol(s) in the core owners` : 'the compiler did not finish');
  }
  if (lint !== 'clean') failures.push(lint === 'missing' ? 'oxlint is not installed' : 'oxlint findings');
  if (coverage && !coverage.ok) {
    failures.push(`${coverage.unchecked.length + coverage.staleExclusions.length} coverage gap(s) (tools/typecheck-coverage.mjs)`);
  }
  if (!coverage && verdict.ok) failures.push('no coverage census');
  return failures.length ? `typecheck: FAILED: ${failures.join('; ')}` : 'typecheck: PASSED';
}

/** The one compile's arguments after the compiler's path (typecheck-coverage.selftest runs the same compile). */
export const COMPILE_ARGS = Object.freeze(['-p', 'tsconfig.json', '--noEmit', '--pretty', 'false', '--noUnusedLocals', '--noUnusedParameters',
  '--listFiles']);

/** Runs a node entry point to completion: { output (stdout, then stderr), status, signal, error }. */
function runNode(root, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, { cwd: root });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolveRun({ output: stdout + stderr, status: null, signal: null, error }));
    child.on('close', (status, signal) => resolveRun({ output: stdout + stderr, status, signal, error: null }));
  });
}

// The linter this checkout runs, or why there is none (272): the gate has no other lint step, so an install without
// Oxlint (one that predates the lockfile's) fails the typecheck instead of passing it unlinted.
export function linterOf(root, exists = existsSync) {
  const oxlint = resolve(root, 'node_modules/oxlint/bin/oxlint');
  return exists(oxlint) ? { oxlint, missing: null }
    : { oxlint: null, missing: 'typecheck: oxlint is not installed in this node_modules: lint skipped, so typecheck fails (run npm ci)' };
}

// Run as a command, compared by real path: a checkout reached through a symlink must never skip this silently.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
  const linter = linterOf(root);
  const lint = linter.oxlint ? runNode(root, [linter.oxlint, '--format', 'unix']).then((run) => ({ ...run, seconds: elapsed() })) : null;
  const compile = await runNode(root, [resolve(root, 'node_modules/@typescript/native/bin/tsc'), ...COMPILE_ARGS]);
  if (compile.error) throw compile.error;
  const { listed, output } = splitListing(compile.output);
  const verdict = typecheckVerdict({ output, status: compile.status, root });
  const lines = [];
  if (verdict.ok) {
    lines.push(`typecheck: TypeScript 7 clean; the application, network, simulation, UI, vehicle and world owners have no unused symbols (${elapsed()})`);
  } else {
    lines.push(verdict.report.trimEnd(), verdict.kind === 'type' ? `typecheck: ${verdict.count} TypeScript error(s) (${elapsed()})`
      : verdict.kind === 'unused' ? `typecheck: ${verdict.count} unused symbol(s) in the core owners (${elapsed()})`
        : `typecheck: the compiler exited ${compile.status ?? compile.signal} with output that is not a diagnostic list (${elapsed()})`);
  }
  // A compile that did not finish listed only part of its files: its census would name holes that are not there.
  const coverage = verdict.kind === 'compiler' ? null : typecheckCoverage({
    tracked: trackedScripts(root), tscListed: listedSources(root, listed), lintIgnore: lintIgnorePatterns(root),
    source: (file) => readFileSync(join(root, file), 'utf8'),
  });
  if (coverage) lines.push(...(coverage.ok ? [coverageSummary(coverage)] : coverageReport(coverage)));
  let lintState = 'missing';
  if (!lint) lines.push(linter.missing);
  else {
    const linted = await lint;
    if (linted.error) throw linted.error;
    lintState = linted.status === 0 ? 'clean' : 'findings';
    lines.push(linted.status === 0 ? `typecheck: oxlint clean (${linted.seconds})`
      : `${linted.output.trimEnd()}\ntypecheck: oxlint failed (npm run lint shows each finding in full)`);
  }
  const last = finalLine({ verdict, lint: lintState, coverage });
  const passed = last === 'typecheck: PASSED';
  (passed ? process.stdout : process.stderr).write(`${[...lines, last].join('\n')}\n`);
  if (!passed) process.exitCode = 1;
}
