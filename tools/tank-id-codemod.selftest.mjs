// Receipt: tools/tank-id-codemod.mjs is the lanes' merge helper for a tank id rename (SSOT 2.19, ID.04/05).
// In a scratch git repository with a swap-bearing rename map (leo2a6m_x -> leo2a6m while leo2a6m -> leo2a4_otco):
//   - --initial renames the tree once and refuses a second run;
//   - on a branch that already holds the renamed ids the helper changes nothing;
//   - a lane that merges the rename gets its id-only conflict resolved and its own old-id lines converted, main's lines
//     are never renamed twice, and a second run (during the merge and after it is committed) changes nothing;
//   - a lane whose merge was clean and committed is converted afterwards, again idempotently;
//   - a branch without the rename is refused untouched.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), 'tank-id-codemod.mjs');
const repo = mkdtempSync(join(tmpdir(), 'tank-id-codemod-receipt-'));
const table = join(repo, '..', `${repo.split('/').pop()}-table.json`);
writeFileSync(table, JSON.stringify({ renames: { leo2a6m_x: 'leo2a6m', leo2a6m: 'leo2a4_otco', t90sm_x: 't90sm' } }));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', NODE_OPTIONS: '--max-old-space-size=1024' };
const git = (...argv) => execFileSync('git', ['-c', 'user.name=receipt', '-c', 'user.email=receipt@example.invalid',
  '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...argv], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const gitTry = (...argv) => { try { git(...argv); return 0; } catch (error) { return error.status ?? 1; } };
const codemod = (...argv) => spawnSync(process.execPath, [TOOL, `--table=${table}`, '--schema=3', ...argv],
  { cwd: repo, env, encoding: 'utf8', timeout: 60_000 });
const write = (rel, text) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const read = (rel) => readFileSync(join(repo, rel), 'utf8');
// Every tracked and staged byte, so "changes nothing" is checked on the index and the work tree.
const snapshot = () => `${git('status', '--porcelain')}\n${git('diff')}\n${git('diff', '--cached')}`;

// ---- base (schema 2)
git('init', '-q');
write('src/a.ts', [
  "export const LIST = ['leo2a6m', 'leo2a6m_x', 't90sm_x'];",
  "export const LABEL = 'leo2a6m-front-mudguard'; // a slug, never an id",
  "export const OLD = 'leo2a6m'; // a schema-2 fixture, tank-ids:keep",
  '// spacer one', '// spacer two', '// spacer three', '',
].join('\n'));
write('src/b.ts', "export const PICK = 'leo2a6m';\n");
write('src/seats.generated.ts', 'export const SEATS = {"leo2a6m":{"x":1},"leo2a6m_x":{"x":2}};\n');
git('add', '-A'); git('commit', '-q', '-m', 'base');

// ---- main: the rename commit
git('checkout', '-q', '-b', 'lane');
git('checkout', '-q', 'main');
let run = codemod('--apply', '--initial');
assert.equal(run.status, 0, run.stderr);
assert.equal(read('src/a.ts').split('\n')[0], "export const LIST = ['leo2a4_otco', 'leo2a6m', 't90sm'];", 'swaps rename once');
assert.match(read('src/a.ts'), /'leo2a6m-front-mudguard'/, 'a hyphenated slug keeps its spelling');
assert.match(read('src/a.ts'), /OLD = 'leo2a6m'; \/\/ a schema-2 fixture/, 'a line marked tank-ids:keep keeps its ids');
assert.equal(read('src/b.ts'), "export const PICK = 'leo2a4_otco';\n");
assert.equal(read('src/seats.generated.ts'), 'export const SEATS = {"leo2a4_otco":{"x":1},"leo2a6m":{"x":2}};\n',
  'the initial pass re-keys generated records once, swaps included');
let before = snapshot();
run = codemod('--apply', '--initial');
assert.notEqual(run.status, 0, '--initial refuses a dirty tree');
assert.equal(snapshot(), before, 'a second --initial run changes nothing');
git('commit', '-q', '-am', 'rename tank ids\n\nTank-Id-Schema: 3');
const mainTree = snapshot();
const mainA = read('src/a.ts');
run = codemod('--apply');
assert.equal(run.status, 0, run.stderr);
assert.equal(snapshot(), mainTree, 'a branch that already holds the renamed ids is left alone');
assert.equal(read('src/a.ts'), mainA);
assert.notEqual(codemod('--apply', '--initial').status, 0, '--initial refuses once the rename is in HEAD');

// ---- lane: written in schema 2, conflicts with the rename on src/b.ts
git('checkout', '-q', 'lane');
before = snapshot();
assert.equal(codemod('--apply').status, 3, 'a branch without the rename is refused');
assert.equal(snapshot(), before, 'and left untouched');
write('src/b.ts', "export const PICK = 'leo2a6m_x'; // the lane's pick\n");
write('src/c.ts', "export const LANE = ['leo2a6m', 't90sm_x'];\n");
write('src/a.ts', `${read('src/a.ts')}export const MORE = 'leo2a6m_x';\n`);
git('add', '-A'); git('commit', '-q', '-m', 'lane work');
assert.notEqual(gitTry('merge', '-q', '--no-edit', 'main'), 0, 'the lane conflicts with the rename');
run = codemod('--apply');
assert.equal(run.status, 0, run.stderr);
assert.equal(read('src/b.ts'), "export const PICK = 'leo2a6m'; // the lane's pick\n", 'an id-only conflict resolves to the converted lane line');
assert.equal(git('diff', '--name-only', '--diff-filter=U'), '', 'and is staged');
assert.equal(read('src/c.ts'), "export const LANE = ['leo2a4_otco', 't90sm'];\n", "the lane's new file is converted");
const a = read('src/a.ts').split('\n');
assert.equal(a[0], "export const LIST = ['leo2a4_otco', 'leo2a6m', 't90sm'];", "main's renamed line is not renamed twice");
assert.equal(a.at(-2), "export const MORE = 'leo2a6m';", "the lane's added line is converted");
before = snapshot();
assert.equal(codemod('--apply').status, 0);
assert.equal(snapshot(), before, 'a second run during the merge changes nothing');
git('add', '-A'); git('commit', '-q', '--no-edit');
before = snapshot();
assert.equal(codemod('--apply').status, 0);
assert.equal(snapshot(), before, 'a run after the merge is committed changes nothing');

// ---- lane2: a clean merge committed before the helper ran
git('checkout', '-q', '-b', 'lane2', 'main~1');
write('src/d.ts', "export const LATE = 'leo2a6m'; // schema 2: the Leopard 2A4 OTCO\n");
git('add', '-A'); git('commit', '-q', '-m', 'lane2 work');
git('merge', '-q', '--no-edit', 'main');
run = codemod('--apply');
assert.equal(run.status, 0, run.stderr);
assert.equal(read('src/d.ts'), "export const LATE = 'leo2a4_otco'; // schema 2: the Leopard 2A4 OTCO\n");
assert.equal(read('src/a.ts'), mainA, "main's lines stay as main wrote them");
before = snapshot();
assert.equal(codemod('--apply').status, 0);
assert.equal(snapshot(), before, 'and a second run changes nothing');

console.log('tank-id-codemod selftest: initial rename once, merge helper idempotent on main, on a conflicted lane and on a clean lane');
