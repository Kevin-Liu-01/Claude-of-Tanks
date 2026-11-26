// tools/size-ratchet.mjs: a source file over 1,500 lines may not grow unless the same commit records a bump with its
// reason (practice audit 2026-11-26, mechanism 10). This checkout passes; one unrecorded line fails; a bump with a reason
// passes; a bump without one, a new big file and a quietly raised start fail; shrinking is a notice that --tighten records.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpRatchet, checkRatchet, formatRatchet, initRatchet, limitOf, lineCount, measureSources, RATCHET_FILE,
  tightenRatchet } from './size-ratchet.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = (result) => result.failures.map((row) => `${row.file} ${row.rule}`);
const noticed = (result) => result.notices.map((row) => `${row.file} ${row.rule}`);

// this checkout: recorded, sorted one row per file, and within every limit
const text = readFileSync(join(REPO_ROOT, RATCHET_FILE), 'utf8');
const ratchet = JSON.parse(text);
assert.equal(ratchet.threshold, 1500);
assert.equal(formatRatchet(ratchet), text, 'the file is in the one-row-per-file form --bump and --tighten write');
const sizes = measureSources(REPO_ROOT);
assert.deepEqual(rules(checkRatchet(ratchet, sizes)), [], 'no file over 1,500 lines grew past its record');
assert.ok(ratchet.files['src/vehicles/tankFactoryCore.ts'], 'the hero-tank owners are recorded, not exempt');
assert.ok(!Object.keys(ratchet.files).some((file) => file.endsWith('.generated.ts')), 'generated files are not recorded');

// the control the audit named: one unrecorded line in src/world/props.ts fails
const grown = { ...sizes, 'src/world/props.ts': limitOf(ratchet.files['src/world/props.ts']) + 1 };
assert.deepEqual(rules(checkRatchet(ratchet, grown)), ['src/world/props.ts growth'], 'an unrecorded growth fails');
// the escape hatch: the same commit records a bump with its reason
const bumped = bumpRatchet(ratchet, 'src/world/props.ts', grown['src/world/props.ts'], 'hero tank: a fixture bump with its reason');
assert.deepEqual(rules(checkRatchet(bumped, grown)), [], 'a recorded bump with a reason passes');
assert.throws(() => bumpRatchet(ratchet, 'src/world/props.ts', grown['src/world/props.ts'], 'tiny'), /reason/, '--bump needs a reason');
assert.throws(() => bumpRatchet(ratchet, 'src/world/props.ts', sizes['src/world/props.ts'], 'no growth to record here'), /no bump needed/);

// fixtures: every rule
const base = { threshold: 10, files: { 'a.ts': { start: 20 }, 'b.ts': { start: 30, bumps: [{ to: 35, why: 'hero turret, owner asked' }] },
  'gone.ts': { start: 12 } } };
assert.deepEqual([limitOf(base.files['a.ts']), limitOf(base.files['b.ts'])], [20, 35]);
assert.deepEqual(rules(checkRatchet(base, { 'a.ts': 20, 'b.ts': 35, 'gone.ts': 12 })), []);
assert.deepEqual(rules(checkRatchet(base, { 'a.ts': 21, 'b.ts': 36, 'gone.ts': 12 })), ['a.ts growth', 'b.ts growth']);
assert.deepEqual(rules(checkRatchet(base, { 'a.ts': 20, 'b.ts': 35, 'gone.ts': 12, 'new.ts': 11, 'small.ts': 10 })), ['new.ts unrecorded'],
  'a new file over the threshold must be recorded; one at it need not');
const noReason = { ...base, files: { ...base.files, 'b.ts': { start: 30, bumps: [{ to: 35, why: '' }, { to: 34, why: 'went down, oddly' }] } } };
assert.deepEqual(rules(checkRatchet(noReason, { 'a.ts': 20, 'b.ts': 34, 'gone.ts': 12 })), ['b.ts bad-bump', 'b.ts bad-bump'],
  'a bump needs a reason and must rise');
const raised = { ...base, files: { ...base.files, 'a.ts': { start: 25 } } };
assert.deepEqual(rules(checkRatchet(raised, { 'a.ts': 25, 'b.ts': 35, 'gone.ts': 12 }, { base })), ['a.ts raised'],
  'a start raised over the base without a bump fails');
assert.deepEqual(rules(checkRatchet(raised, { 'a.ts': 25, 'b.ts': 35, 'gone.ts': 12 })), [], 'no base (no git history): the rule is skipped');
const shrunk = { 'a.ts': 18, 'b.ts': 9 };
const shrinkCheck = checkRatchet(base, shrunk);
assert.deepEqual([rules(shrinkCheck), noticed(shrinkCheck)], [[], ['a.ts shrank', 'b.ts under', 'gone.ts stale']], 'shrinking never fails a lane');
const tightened = tightenRatchet(base, shrunk);
assert.deepEqual(tightened.files, { 'a.ts': { start: 18 } }, '--tighten lowers limits and drops rows; it never raises');
assert.deepEqual(rules(checkRatchet(tightened, { 'a.ts': 19 })), ['a.ts growth'], 'after --tighten the freed lines need a bump');
assert.deepEqual(bumpRatchet(base, 'c.ts', 40, 'a new big file, on purpose').files['c.ts'], { start: 40, why: 'a new big file, on purpose' });
// exemptions: an append-only registry grows freely, but only with a reason, and never while also recorded
const withExempt = { ...base, exempt: { 'registry.mjs': 'every lane appends a row here' } };
assert.deepEqual(rules(checkRatchet(withExempt, { 'a.ts': 20, 'b.ts': 35, 'gone.ts': 12, 'registry.mjs': 900 })), [], 'an exempt registry may grow');
assert.deepEqual(rules(checkRatchet({ ...base, exempt: { 'registry.mjs': '' } }, { 'a.ts': 20, 'b.ts': 35, 'gone.ts': 12, 'registry.mjs': 9 })),
  ['registry.mjs bad-exempt'], 'an exemption needs a reason');
assert.deepEqual(rules(checkRatchet({ ...base, exempt: { 'a.ts': 'both at once, on purpose' } }, { 'a.ts': 20, 'b.ts': 35, 'gone.ts': 12 })),
  ['a.ts bad-exempt'], 'a file is exempt or recorded, never both');
assert.ok(ratchet.exempt['tools/selftest-suites.mjs'] && Object.keys(ratchet.exempt).length <= 3, 'the exemptions stay few');
assert.deepEqual(initRatchet({ 'a.ts': 11, 'b.ts': 10, 'registry.mjs': 50 }, 10, { 'registry.mjs': 'every lane appends a row here' }),
  { threshold: 10, exempt: { 'registry.mjs': 'every lane appends a row here' }, files: { 'a.ts': { start: 11 } } }, '--init keeps the exemptions');
assert.equal(formatRatchet(base).split('\n').filter((line) => line.startsWith('    "')).length, 3, 'one row per file');
assert.deepEqual([lineCount(''), lineCount('a'), lineCount('a\n'), lineCount('a\nb\n')], [0, 0, 1, 2], 'lines as wc -l counts them');

// measureSources reads git's index and skips generated files
const repo = mkdtempSync(join(tmpdir(), 'cot-size-ratchet-'));
try {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: repo });
  git('init', '-q');
  writeFileSync(join(repo, 'big.ts'), 'x\n'.repeat(12));
  writeFileSync(join(repo, 'table.generated.ts'), 'x\n'.repeat(50));
  writeFileSync(join(repo, 'notes.md'), 'x\n'.repeat(50));
  writeFileSync(join(repo, 'untracked.ts'), 'x\n'.repeat(50));
  git('add', 'big.ts', 'table.generated.ts', 'notes.md');
  assert.deepEqual(measureSources(repo), { 'big.ts': 12 }, 'tracked hand-written sources only');
} finally {
  rmSync(repo, { recursive: true, force: true });
}
console.log(`size-ratchet: ${Object.keys(ratchet.files).length} files over 1,500 lines within their records; an unrecorded line fails, a bump with a reason passes, bad bumps and raised starts fail, shrinking is a notice`);
