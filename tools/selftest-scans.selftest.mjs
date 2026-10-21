// Listing receipts in selection and the result cache (2026-10-20, after 228p). Release 228p ran 125 receipts chosen by
// changed files and shipped a red: src/presentation/mediaLibrary.ts gained a static CSS import, which
// src/ui/runtimeStyles.selftest.mjs forbids outside main.ts, and runtimeStyles reads that file by listing all of src,
// so no closure named it. Here: a synthetic import replays it through the runner (the listing selects runtimeStyles,
// fails it, and a cached PASS never hides it), a root-level listing shows the key gap the declarations close, the
// census's negative controls, and the census of the real registry (tools/selftest-scans.mjs).
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT, createSelftestCache } from './selftest-cache.mjs';
import { selftestCacheLocations } from './selftest-cache-dir.mjs';
import { collectSelftestInputs } from './selftest-inputs.mjs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { runSelftestFile, runSelftestSuite, SELFTEST_DECLARED_INPUTS, SELFTEST_FIXTURE_KEYED_FILES, SELFTEST_FRESH_FILES,
  selftestPlan, selftestReadOf } from './run-selftests.mjs';
import { scanCensus, scanPatternBase, scanPatternRegExp, SELFTEST_SCANS } from './selftest-scans.mjs';

// ---- the parser names listings, and only listings
{
  const listing = collectSelftestInputs("import { readdirSync } from 'node:fs';\nfor (const f of readdirSync(dir)) {}\n", 'a.mjs');
  assert.deepEqual(listing.scans, [{ call: 'readdirSync', line: 2 }], 'a readdir is a listing, at its line');
  const git = collectSelftestInputs("import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['ls-files', '-z']);\n", 'b.mjs');
  assert.deepEqual(git.scans, [{ call: 'git ls-files', line: 2 }], "git's index listing is a listing");
  assert.equal(git.spawns, true, 'a child_process user may spawn the tools it names');
  assert.deepEqual(collectSelftestInputs("const args = ['ls-files'];\n", 'c.mjs').scans, [], 'a git word without git is not a listing');
  assert.deepEqual(collectSelftestInputs("import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['rev-parse', 'HEAD']);\n",
    'd.mjs').scans, [], 'a git query that lists no paths is not a listing');
  assert.equal(collectSelftestInputs("import { readFileSync } from 'node:fs';\nreadFileSync('x');\n", 'e.mjs').spawns, false);
  assert.equal(scanPatternBase('src/**/*.ts'), 'src');
  assert.equal(scanPatternBase('public/icons/thumbs/*_angle.webp'), 'public/icons/thumbs');
  assert.equal(scanPatternBase('*.html'), '');
  assert.equal(scanPatternBase('src/{app,ui}/**/*.ts'), 'src');
  assert.ok(scanPatternRegExp('src/**/*.ts').test('src/presentation/mediaLibrary.ts') && scanPatternRegExp('src/**/*.ts').test('src/main.ts'));
  assert.ok(!scanPatternRegExp('*.html').test('site/docs.html') && scanPatternRegExp('*.html').test('index.html'), 'one level stays one level');
}

const root = mkdtempSync(join(tmpdir(), 'cot-selftest-scans-'));
try {
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const copy = (path) => { mkdirSync(dirname(join(root, path)), { recursive: true }); copyFileSync(join(REPO_ROOT, path), join(root, path)); };

  // ---- 228p, replayed: the real receipt over a fixture holding the files it reads
  const STYLES = 'src/ui/runtimeStyles.selftest.mjs';
  for (const path of [STYLES, 'src/main.ts', 'src/ui/garage.ts', 'src/ui/responsiveSurfaces.css', 'src/ui/garage.css', 'src/ui/motion.css',
    'src/presentation/publicNav.css']) copy(path);
  const cacheDir = join(root, '.proofs');
  const scans = { [STYLES]: SELFTEST_SCANS[STYLES] };
  assert.deepEqual(scans[STYLES], { lists: ['src/**/*.ts'] }, 'runtimeStyles declares the tree it lists');
  // a fresh cache per state: a run starts with no memo of the tree
  const cacheOf = (table = scans) => createSelftestCache({ root, cacheDir, env: {}, argv: [], nodeVersion: 'v-test', scans: table });
  const lines = [];
  let runs = 0;
  const logOf = (run) => join(root, '.logs', `${run}.log`);
  const suite = (cache) => runSelftestSuite('scan-fixture', [STYLES], {
    cache, cpuLease: false, log: (line) => lines.push(line), logError: (line) => lines.push(line),
    lock: { acquire: async () => {}, release: () => {}, refresh: () => {} },
    runFile: (file) => runSelftestFile(join(root, file), { cwd: root, env: { PATH: process.env.PATH }, logFile: logOf(++runs) }),
  });
  assert.equal(await suite(cacheOf()), 0, 'the fixture holds a passing runtimeStyles');
  lines.length = 0;
  assert.equal(await suite(cacheOf()), 0);
  assert.ok(lines.some((line) => line.includes(`SKIP ${STYLES}`)), `unchanged inputs reuse the PASS (${lines.join(' | ')})`);

  // mediaLibrary.ts's change: a static stylesheet import in a module that is not main.ts
  const SHELF = 'src/presentation/mediaShelf.ts';
  write(SHELF, "import './mediaShelf.css';\nexport const shelf = 'library';\n");
  write('src/presentation/mediaShelf.css', '.shelf{display:grid;}\n');
  const [row] = selftestPlan([STYLES], cacheOf(), [SHELF], root);
  assert.equal(row.action, 'run', 'the cached PASS no longer matches');
  assert.deepEqual([row.affectedBy, row.scanBy, row.broadOnly], [[SHELF], [SHELF], false], 'the listing selects runtimeStyles');
  assert.ok(cacheOf().closureOf(join(root, STYLES)).has(join(root, SHELF)),
    'the listed file is in the closure, so a selector that reads closures (the integrator\'s affected.mjs) sees a direct read');
  // without the declaration: still re-run (the fallback keys all of src), but the selection sees only the fallback,
  // which is the match 228p's selection dropped
  const [undeclared] = selftestPlan([STYLES], cacheOf({}), [SHELF], root);
  assert.deepEqual([undeclared.action, undeclared.scanBy, undeclared.broadOnly], ['run', [], true],
    'undeclared, runtimeStyles matches the change only through the broad fallback');
  assert.ok(!cacheOf({}).closureOf(join(root, STYLES)).has(join(root, SHELF)), 'and no closure names the file');
  lines.length = 0;
  assert.equal(await suite(cacheOf()), 1, 'runtimeStyles fails on the synthetic import');
  assert.ok(!lines.some((line) => line.includes('SKIP')), 'a cached PASS never hides it');
  assert.match(readFileSync(logOf(runs), 'utf8'), /only src\/main\.ts imports stylesheets statically/);
  lines.length = 0;
  assert.equal(await suite(cacheOf()), 1, 'and it stays red on the next run: a FAIL records nothing');
  // a deleted file still selects its listers: the pattern, not the tree, decides
  rmSync(join(root, SHELF));
  assert.deepEqual(selftestPlan([STYLES], cacheOf(), [SHELF], root)[0].scanBy, [SHELF], 'a deleted path selects the listing receipt');
  assert.equal(selftestReadOf(cacheOf(), STYLES, 'src/presentation/gone.ts', root), 'scan');

  // ---- the key gap: a listing outside the fallback directories (the checkout's root html pages)
  const PAGES = 'tools/rootPages.selftest.mjs';
  write(PAGES, "import { readdirSync, readFileSync } from 'node:fs';\nconst root = new URL('../', import.meta.url);\n"
    + "for (const name of readdirSync(root).filter((n) => n.endsWith('.html'))) {\n"
    + "  if (!readFileSync(new URL(name, root), 'utf8').includes('<html lang=')) throw new Error(`${name}: no lang`);\n}\n");
  write('index.html', '<!doctype html><html lang="en"></html>\n');
  const pages = { [PAGES]: { lists: ['*.html'] } };
  const keyOf = (table) => cacheOf(table).inputKey(PAGES).key;
  const [bareBefore, declaredBefore] = [keyOf({}), keyOf(pages)];
  write('b.html', '<!doctype html><html></html>\n');
  assert.equal(keyOf({}), bareBefore, 'control: undeclared, a new root page leaves the key alone (a cached PASS would hide its red)');
  assert.notEqual(keyOf(pages), declaredBefore, 'declared, the new page is an input of the key');
  assert.equal(selftestReadOf(cacheOf(pages), PAGES, 'b.html', root), 'scan');
  assert.equal(selftestReadOf(cacheOf({}), PAGES, 'b.html', root), null, 'control: undeclared, nothing reads it');

  // ---- git's index: a tracked listing selects, and keeps the receipt live
  const TRACKED = 'tools/tracked.selftest.mjs';
  write(TRACKED, "import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['ls-files', '-z']);\n");
  const trackedTable = { [TRACKED]: { tracked: ['**'] } };
  assert.equal(cacheOf(trackedTable).lookup(TRACKED).reason, 'browser or Git state must be checked live');
  assert.deepEqual(selftestPlan([TRACKED], cacheOf(trackedTable), ['docs/anything.md'], root)[0].scanBy, ['docs/anything.md']);

  // ---- the census: each problem class
  write('tools/lib.mjs', "import { readdirSync } from 'node:fs';\nexport const list = (dir) => readdirSync(dir);\n");
  write('tools/user.selftest.mjs', "import { list } from './lib.mjs';\nlist('src');\n");
  write('tools/plain.mjs', 'export const plain = 1;\n');
  write('tools/plainUser.selftest.mjs', "import { plain } from './plain.mjs';\n");
  const census = (table, receipts, options = {}) => scanCensus(createSelftestCache({ root, cacheDir, env: {}, argv: [],
    nodeVersion: 'v-test', scans: table, ...options }), receipts, { root, scans: table, declared: options.declaredInputs ?? {} }).problems;
  const all = [STYLES, PAGES, TRACKED, 'tools/user.selftest.mjs', 'tools/plainUser.selftest.mjs'];
  const good = { ...scans, ...pages, ...trackedTable, 'tools/lib.mjs': { caller: 'lists the dir it is given' },
    'tools/user.selftest.mjs': { lists: ['src/**'] } };
  assert.deepEqual(census(good, all), [], 'a complete table has no problem');
  const expect = (table, pattern, message, receipts = all, options) => {
    const problems = census(table, receipts, options);
    assert.ok(problems.some((problem) => pattern.test(problem)), `${message}: ${problems.join(' | ')}`);
  };
  const { [PAGES]: _pages, ...withoutPages } = good;
  expect(withoutPages, /tools\/rootPages\.selftest\.mjs: lists \(readdirSync at line 3\) and has no entry/, 'an undeclared listing fails');
  const { 'tools/user.selftest.mjs': _user, ...withoutUser } = good;
  expect(withoutUser, /tools\/user\.selftest\.mjs: runs tools\/lib\.mjs, which lists what its caller passes, and declares nothing/,
    'a caller-directed lister moves the obligation to its importer');
  expect({ ...good, 'tools/gone.mjs': { outside: 'tmp' } }, /tools\/gone\.mjs: no registered receipt runs it/, 'a stale entry fails');
  expect({ ...good, 'tools/plain.mjs': { identity: 'x' } }, /tools\/plain\.mjs: lists nothing and runs no caller-directed lister/,
    'an entry for a module that lists nothing fails');
  expect({ ...good, [PAGES]: { lists: ['**/*.html'] } }, /walks the checkout from its root/, 'a root-recursive listing fails');
  expect({ ...good, [PAGES]: { lists: ['nowhere/*.html'] } }, /nowhere\/\*\.html': nowhere is gone/, 'a listing of a missing directory fails');
  expect({ ...good, [PAGES]: { lists: ['*.html'], outside: 'tmp' } }, /one of lists, tracked/, 'one kind per entry');
  expect({ ...good, 'tools/lib.mjs': { caller: ' ' } }, /tools\/lib\.mjs: caller needs its reason/, 'a reason is required');
  expect(good, /tools\/tracked\.selftest\.mjs: a keyed receipt inherits tracked listings/, 'git state never keys a proof', all,
    { fixtureKeyed: [TRACKED] });
  assert.deepEqual(census({ ...good, [PAGES]: { lists: ['*.html'] } }, all, { declaredInputs: { [PAGES]: ['tools/lib.mjs'] } })
    .filter((problem) => problem.startsWith(PAGES)), [`${PAGES}: no registered receipt runs it (a stale entry)`],
  'a declared-inputs receipt runs on its fixtures: it is not walked');
} finally {
  rmSync(root, { recursive: true, force: true });
}

// ---- the census of this checkout's registry: every listing module is declared, and the 228p file is a listed input
{
  const cache = createSelftestCache({ cacheDir: selftestCacheLocations(REPO_ROOT, process.env).dir, env: {}, argv: [],
    declaredInputs: SELFTEST_DECLARED_INPUTS, fixtureKeyed: SELFTEST_FIXTURE_KEYED_FILES, alwaysRun: SELFTEST_FRESH_FILES });
  const receipts = [...new Set(Object.values(SELFTEST_SUITES).flat())];
  const { problems, reached, kinds, inheriting } = scanCensus(cache, receipts, { root: REPO_ROOT, declared: SELFTEST_DECLARED_INPUTS });
  cache.persist();
  assert.deepEqual(problems, [], `listing declarations (tools/selftest-scans.mjs):\n  ${problems.join('\n  ')}`);
  const styles = join(REPO_ROOT, 'src/ui/runtimeStyles.selftest.mjs');
  assert.ok(cache.closureOf(styles).has(join(REPO_ROOT, 'src/presentation/mediaLibrary.ts')), 'runtimeStyles keys on mediaLibrary.ts');
  assert.equal(selftestReadOf(cache, 'src/ui/runtimeStyles.selftest.mjs', 'src/presentation/mediaLibrary.ts', REPO_ROOT), 'scan',
    'and a change to it selects runtimeStyles');
  assert.equal(selftestReadOf(cache, 'src/ui/runtimeStyles.selftest.mjs', 'docs/DEPLOYS.md', REPO_ROOT), 'broad',
    'a deployment note stays a fallback match');
  const declared = Object.keys(SELFTEST_SCANS).length;
  console.log(`selftest scans: ${declared} listing modules declared (${Object.entries(kinds).map(([kind, count]) => `${count} ${kind}`).join(', ')}); `
    + `${inheriting.lists} receipts keyed and selected by listings, ${inheriting.tracked} selected by tracked listings; `
    + `${reached.size} modules run by ${receipts.length} receipts: PASS`);
}
