#!/usr/bin/env node
// npm run gen:checks [-- <name>...] — the tank-generation checks: the comparison tools' own checks (the geometry
// comparison, the silhouette fidelity page, the comparison-model pins and registry, source openings and assemblies).
// Owner, 2026-11-12: outside 3D models are comparison bases while a lane builds or fixes a tank, never a test. These
// checks are therefore not receipts: npm test, test:heavy, test:lane, tank:release:check and the release gate never run
// them, and a lane runs them by hand while it uses a comparison tool. Several need a local comparison model and stop
// with the missing path when it is absent.
//   npm run gen:checks                       every tools/*.gencheck.mjs, one at a time
//   npm run gen:checks -- gate-repin oracle-width-audit   only these
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATION_CHECKS } from './generation-checks.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const all = readdirSync(TOOLS).filter((name) => name.endsWith('.gencheck.mjs')).sort();
const listed = GENERATION_CHECKS.map((file) => path.basename(file)).sort();
if (JSON.stringify(all) !== JSON.stringify(listed)) {
  console.error(`[gen:checks] tools/generation-checks.mjs lists ${listed.length} checks, tools/ holds ${all.length}: keep them equal`);
  process.exit(2);
}
const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const unknown = wanted.filter((name) => !all.includes(`${name}.gencheck.mjs`));
if (unknown.length) {
  console.error(`[gen:checks] no such check: ${unknown.join(', ')} (have: ${all.map((n) => n.replace('.gencheck.mjs', '')).join(', ')})`);
  process.exit(2);
}
const files = wanted.length ? wanted.map((name) => `${name}.gencheck.mjs`) : all;
const failed = [];
for (const name of files) {
  const run = spawnSync(process.execPath, [path.join('tools', name)], { cwd: path.dirname(TOOLS), stdio: 'inherit' });
  if (run.status !== 0) failed.push(name);
}
console.log(`[gen:checks] ${files.length - failed.length}/${files.length} pass${failed.length ? `; FAIL: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
