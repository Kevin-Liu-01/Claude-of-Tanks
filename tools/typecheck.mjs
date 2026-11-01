#!/usr/bin/env node
// `npm run typecheck`: ONE TypeScript 7 (native) compile of tsconfig.json with the unused-symbol flags on,
// and Oxlint (`npm run lint`, .oxlintrc.json) beside it.
// - Every diagnostic that is not an unused symbol fails the check, exactly as a plain `tsc --noEmit` would:
//   the unused flags only add diagnostics, so the plain compile's errors are this compile's other ones.
// - Unused symbols fail only in the core runtime owners (isCoreRuntime below).
// - A compiler that is killed or prints anything but diagnostics fails the check too.
// - Oxlint runs while the compiler does (it takes seconds, the compiler minutes under load) and fails the check on
//   any finding. A checkout whose node_modules predates it skips it with a notice; `npm ci` installs it.
// Until 2026-10-22 typecheck ran two full compiles: plain tsc, then this file (then core-unused-check.mjs)
// with the unused flags. One compile gives the same verdicts in half the time.
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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

// Run as a command, compared by real path: a checkout reached through a symlink must never skip this silently.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
  const oxlint = resolve(root, 'node_modules/oxlint/bin/oxlint');
  const lint = existsSync(oxlint) ? runNode(root, [oxlint, '--format', 'unix']).then((run) => ({ ...run, seconds: elapsed() })) : null;
  const compile = await runNode(root, [resolve(root, 'node_modules/@typescript/native/bin/tsc'),
    '-p', 'tsconfig.json', '--noEmit', '--pretty', 'false', '--noUnusedLocals', '--noUnusedParameters']);
  if (compile.error) throw compile.error;
  const verdict = typecheckVerdict({ output: compile.output, status: compile.status, root });
  if (verdict.ok) {
    console.log(`typecheck: TypeScript 7 clean; the application, network, simulation, UI, vehicle and world owners have no unused symbols (${elapsed()})`);
  } else {
    process.stderr.write(`${verdict.report.trimEnd()}\n`);
    process.stderr.write(verdict.kind === 'type' ? `typecheck: ${verdict.count} TypeScript error(s) (${elapsed()})\n`
      : verdict.kind === 'unused' ? `typecheck: ${verdict.count} unused symbol(s) in the core owners (${elapsed()})\n`
        : `typecheck: the compiler exited ${compile.status ?? compile.signal} with output that is not a diagnostic list (${elapsed()})\n`);
    process.exitCode = 1;
  }
  if (!lint) {
    console.log('typecheck: oxlint is not installed in this node_modules (npm ci installs it): lint skipped');
  } else {
    const linted = await lint;
    if (linted.error) throw linted.error;
    if (linted.status === 0) console.log(`typecheck: oxlint clean (${linted.seconds})`);
    else {
      process.stderr.write(`${linted.output.trimEnd()}\ntypecheck: oxlint failed (npm run lint shows each finding in full)\n`);
      process.exitCode = 1;
    }
  }
}
