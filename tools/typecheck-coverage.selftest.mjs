// typecheck-coverage-279: every tracked script file is checked by `npm run typecheck` or sits in the one exclusion
// list with a reason (tools/typecheck-coverage.mjs), and the checks catch a name out of scope in every group.
//
// The planted names run in a mirror: an APFS clone (a plain copy elsewhere) of the checkout's tracked top-level
// entries, node_modules and public/ linked. A temporary copy of a representative file from each group, one per
// tsconfig.json include entry and one per JavaScript directory and extension oxlint owns, gains a function that reads
// an undefined name; one compile with the typecheck's own arguments and one oxlint run must name every plant and
// nothing else. The control runs oxlint again under the pre-279 ignore pattern (`src/vehicles/profiles/**`): the
// profiles plant must go unreported there, which is the hole this lane closed.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TYPECHECK_EXCLUDED, coverageReport, lintIgnorePatterns, listedSources, trackedScripts, typecheckCoverage,
} from './typecheck-coverage.mjs';
import { COMPILE_ARGS, finalLine, splitListing, typecheckVerdict } from './typecheck.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- The census's rules, on fixtures.
{
  const source = (texts) => (file) => texts[file] ?? '';
  const census = typecheckCoverage({
    tracked: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.mjs', 'src/p/e.mjs', 'src/f.mjs', 'cf/w.ts'],
    tscListed: new Set(['src/a.ts', 'src/c.ts']),
    lintIgnore: ['src/p/**'],
    source: source({ 'src/c.ts': '// @ts-nocheck\nexport {};\n', 'src/f.mjs': '/* eslint-disable */\nexport {};\n' }),
    excluded: [{ pattern: 'cf/**', reason: 'own package' }, { pattern: 'gone/**', reason: 'stale' }],
  });
  assert.deepEqual(census.owner, { tsc: ['src/a.ts'], oxlint: ['src/d.mjs'] });
  assert.deepEqual(census.unchecked.map(({ file }) => file), ['src/b.ts', 'src/c.ts', 'src/p/e.mjs', 'src/f.mjs'],
    'an unlisted TS file, a @ts-nocheck one, ignored JavaScript and a file-wide lint disable all have no owner');
  assert.match(census.unchecked[2].why, /oxlint's ignore pattern src\/p\/\*\*/);
  assert.deepEqual(census.excluded, [{ pattern: 'cf/**', files: ['cf/w.ts'] }, { pattern: 'gone/**', files: [] }]);
  assert.deepEqual(census.staleExclusions, [{ pattern: 'gone/**', why: 'covers no unchecked tracked file' }]);
  assert.equal(census.ok, false);
  const over = typecheckCoverage({ tracked: ['src/a.ts'], tscListed: new Set(['src/a.ts']), lintIgnore: [], source: () => '',
    excluded: [{ pattern: 'src/**', reason: 'too wide' }] });
  assert.deepEqual(over.staleExclusions.map(({ why }) => why), ['covers no unchecked tracked file', 'covers src/a.ts, which a checker owns']);
  assert.match(coverageReport(census).join('\n'), /^src\/b\.ts: not typechecked: outside the compile/m);
  const ruled = typecheckCoverage({ tracked: ['src/g.mjs'], tscListed: new Set(), lintIgnore: [], source: () => '/* oxlint-disable no-console */' });
  assert.deepEqual(ruled.owner.oxlint, ['src/g.mjs'], 'a file-wide disable of other rules keeps no-undef on');
}

// --- The last line is the whole verdict (dome-detail-275 read "oxlint clean" under `| tail -1` over two TS2304s).
{
  const clean = { ok: true, kind: 'clean', count: 0 }, covered = { ok: true, unchecked: [], staleExclusions: [] };
  const type = { ok: false, kind: 'type', count: 2 };
  assert.equal(finalLine({ verdict: clean, lint: 'clean', coverage: covered }), 'typecheck: PASSED');
  assert.equal(finalLine({ verdict: type, lint: 'clean', coverage: covered }), 'typecheck: FAILED: 2 TypeScript error(s)',
    'type errors beside a clean lint end the run FAILED, never on the lint\'s line');
  assert.equal(finalLine({ verdict: clean, lint: 'missing', coverage: covered }), 'typecheck: FAILED: oxlint is not installed');
  assert.equal(finalLine({ verdict: clean, lint: 'clean', coverage: { ok: false, unchecked: [{}], staleExclusions: [] } }),
    'typecheck: FAILED: 1 coverage gap(s) (tools/typecheck-coverage.mjs)');
  assert.equal(finalLine({ verdict: { ok: false, kind: 'compiler' }, lint: 'findings', coverage: null }),
    'typecheck: FAILED: the compiler did not finish; oxlint findings');
  const split = splitListing('/r/node_modules/x/lib.d.ts\n/r/src/a.ts\nsrc/a.ts(1,2): error TS2304: Cannot find name \'q\'.\n');
  assert.deepEqual(split.listed, ['/r/node_modules/x/lib.d.ts', '/r/src/a.ts']);
  assert.equal(split.output, 'src/a.ts(1,2): error TS2304: Cannot find name \'q\'.\n');
  assert.deepEqual([...listedSources('/r', split.listed)], ['src/a.ts']);
  assert.equal(splitListing('panic: runtime error\n/usr/local/go/src/runtime/panic.go:12 +0x1d\n').listed.length, 0,
    'a crash trace is not a listing (it stays in the verdict, which fails closed)');
}

// --- The real tree, mirrored, with a name out of scope planted in each group.
const tracked = trackedScripts(ROOT);
const lintIgnore = lintIgnorePatterns(ROOT);
const tsconfig = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8'));
const mirror = mkdtempSync(join(tmpdir(), 'cot-typecheck-probe-'));
const cleanUp = () => rmSync(mirror, { recursive: true, force: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanUp(); process.exit(130); });
try {
  const topLevel = [...new Set(execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0').filter(Boolean).map((file) => file.split('/')[0]))].filter((entry) => entry !== 'public');
  const clone = spawnSync('cp', ['-cR', ...topLevel, mirror], { cwd: ROOT });
  if (clone.status !== 0) execFileSync('cp', ['-R', ...topLevel, mirror], { cwd: ROOT }); // no APFS clones here
  symlinkSync(join(ROOT, 'node_modules'), join(mirror, 'node_modules'));
  symlinkSync(join(ROOT, 'public'), join(mirror, 'public'));

  const run = (args) => spawnSync(process.execPath, args, { cwd: mirror, encoding: 'utf8', maxBuffer: 1 << 28 });
  const source = (file) => readFileSync(join(ROOT, file), 'utf8');

  // One representative per group: each include entry of tsconfig.json (props.ts for src, the file of the incident), and
  // each top-level directory and extension of the JavaScript oxlint owns, the vehicle profiles' receipts on their own.
  // (The JavaScript's owner does not depend on the compile, so the census before it picks the same files.)
  const groups = [];
  const tsTracked = tracked.filter((file) => /\.[cm]?tsx?$/.test(file) && !file.endsWith('.d.ts'));
  for (const entry of tsconfig.include) {
    const members = tsTracked.filter((file) => matchesGlob(file, entry)).sort();
    const file = entry === 'src/**/*.ts' ? 'src/world/props.ts' : members[0];
    assert.ok(members.includes(file), `tsconfig include ${entry} reaches a tracked file`);
    groups.push({ group: `tsc ${entry}`, file, checker: 'tsc' });
  }
  const lintOwned = typecheckCoverage({ tracked, tscListed: new Set(), lintIgnore, source, excluded: [] }).owner.oxlint;
  const jsGroups = new Map();
  for (const file of [...lintOwned].sort()) {
    const key = file.startsWith('src/vehicles/profiles/') ? 'src/vehicles/profiles/*' : `${file.split('/')[0]}/*${file.slice(file.lastIndexOf('.'))}`;
    if (!jsGroups.has(key)) jsGroups.set(key, file);
  }
  assert.ok(jsGroups.has('src/vehicles/profiles/*'), 'the profiles\' receipts are linted');
  for (const [key, file] of jsGroups) groups.push({ group: `oxlint ${key}`, file, checker: 'oxlint' });

  groups.forEach((probe, index) => {
    probe.name = `typecheckProbeUndefined${index}`;
    const text = readFileSync(join(mirror, probe.file), 'utf8');
    probe.line = text.split('\n').length + (text.endsWith('\n') ? 0 : 1);
    writeFileSync(join(mirror, probe.file), `${text}${text.endsWith('\n') ? '' : '\n'}${probe.checker === 'tsc'
      ? `export function typecheckProbe${index}(): unknown { return ${probe.name}; }\n`
      : `function typecheckProbe${index}() { return ${probe.name}; } void typecheckProbe${index};\n`}`);
  });

  // One compile with the typecheck's arguments over the planted mirror: its listing is the real tree's census (the
  // plants change no file's membership), its diagnostics must be the plants and nothing else (the unplanted control).
  const planted = run([join(mirror, 'node_modules/@typescript/native/bin/tsc'), ...COMPILE_ARGS]);
  const { listed, output } = splitListing(`${planted.stdout}${planted.stderr}`);
  const verdict = typecheckVerdict({ output, status: planted.status, root: mirror });
  const census = typecheckCoverage({ tracked, tscListed: listedSources(mirror, listed), lintIgnore, source });
  assert.deepEqual(coverageReport(census), [], 'every tracked script file has an owner');
  for (const { pattern, reason } of TYPECHECK_EXCLUDED) assert.ok(reason.length > 40, `${pattern}: the exclusion says why`);
  assert.equal(census.owner.tsc.length + census.owner.oxlint.length
    + census.excluded.reduce((sum, { files }) => sum + files.length, 0), tracked.length, 'each file is counted once');
  for (const { file, checker } of groups) assert.ok(census.owner[checker].includes(file), `${file}: owned by ${checker}`);

  // oxlint reads the mirror's own .oxlintrc.json, as the typecheck does (an explicit -c config resolves its
  // ignorePatterns differently: the control below rewrites the mirror's file instead).
  const oxlint = () => run([join(mirror, 'node_modules/oxlint/bin/oxlint'), '--format', 'unix']);
  const linted = oxlint();
  const lintFindings = linted.stdout.split('\n').filter((line) => /^\S+:\d+:\d+: /.test(line));

  assert.equal(verdict.kind, 'type', 'the planted compile fails on type errors');
  const typeErrors = verdict.report.split('\n').filter((line) => /error TS\d+/.test(line));
  const tscProbes = groups.filter(({ checker }) => checker === 'tsc');
  assert.deepEqual(typeErrors.sort(), tscProbes.map(({ file, line, name }) => {
    const column = `export function typecheckProbe${groups.findIndex((probe) => probe.name === name)}(): unknown { return `.length + 1;
    return `${file}(${line},${column}): error TS2304: Cannot find name '${name}'.`;
  }).sort(), 'the compile names every TypeScript plant, and nothing else');
  const jsProbes = groups.filter(({ checker }) => checker === 'oxlint');
  assert.notEqual(linted.status, 0, 'oxlint fails on the plants');
  assert.deepEqual(lintFindings.map((line) => line.replace(/:\d+: .*\[(.*)\]$/, ' $1')).sort(),
    jsProbes.map(({ file, line }) => `${file}:${line} Error/eslint(no-undef)`).sort(),
    'oxlint names every JavaScript plant as no-undef, and nothing else');
  assert.match(finalLine({ verdict, lint: 'findings', coverage: census }), /^typecheck: FAILED: \d+ TypeScript error\(s\); oxlint findings$/);

  // Control: the pre-279 ignore pattern hides the profiles' plant (and nothing else).
  const configText = readFileSync(join(ROOT, '.oxlintrc.json'), 'utf8');
  assert.ok(configText.includes('"src/vehicles/profiles/**/*.ts",'), 'the profiles ignore names their TypeScript only');
  writeFileSync(join(mirror, '.oxlintrc.json'), configText.replace('"src/vehicles/profiles/**/*.ts",', '"src/vehicles/profiles/**",'));
  const before = oxlint().stdout;
  const profiles = jsProbes.find(({ group }) => group === 'oxlint src/vehicles/profiles/*');
  assert.ok(!before.includes(`${profiles.file}:`), 'under the old ignore the profiles plant goes unreported (the hole)');
  for (const probe of jsProbes.filter((probe) => probe !== profiles)) {
    assert.ok(before.includes(`${probe.file}:${probe.line}:`), `${probe.group}: reported under the old ignore too`);
  }
  const oldCensus = typecheckCoverage({ tracked, tscListed: listedSources(mirror, listed),
    lintIgnore: lintIgnore.map((pattern) => (pattern === 'src/vehicles/profiles/**/*.ts' ? 'src/vehicles/profiles/**' : pattern)),
    source: (file) => readFileSync(join(ROOT, file), 'utf8') });
  assert.ok(oldCensus.unchecked.length > 300 && oldCensus.unchecked.every(({ file }) => file.startsWith('src/vehicles/profiles/')),
    'the census names the old hole');

  console.log(`typecheck-coverage.selftest: ${census.owner.tsc.length} TypeScript files compiled, ${census.owner.oxlint.length} `
    + `JavaScript files under no-undef, ${tracked.length - census.owner.tsc.length - census.owner.oxlint.length} excluded with reasons; `
    + `a name out of scope fails all ${groups.length} groups (${groups.map(({ file }) => file).join(', ')}); the pre-279 ignore hid `
    + `${oldCensus.unchecked.length} profile scripts`);
} finally {
  cleanUp();
}
