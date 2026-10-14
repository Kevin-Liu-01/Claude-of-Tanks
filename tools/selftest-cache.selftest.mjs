import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, utimesSync, statSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { createSelftestCache, REPO_ROOT, SELFTEST_CACHE_VERSION } from './selftest-cache.mjs';
import { collectSelftestInputs } from './selftest-inputs.mjs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';

// Fast checks (2026-09-15): the result cache skips a receipt only when every input it can
// observe is byte-identical to its last PASS. These fixtures pin the dependency rules on a
// synthetic repository, then check the real repository's rules on the receipts that bit
// during batch 28 (a JSON-listed source, a joined path, a directory listing, a browser page).

const root = mkdtempSync(join(tmpdir(), 'cot-selftest-cache-'));
const write = (rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
write('package-lock.json', '{"name":"fixture"}');
write('tools/run-selftests.mjs', '// runner'); write('tools/selftest-cpu-pool.mjs', '// pool');
write('tools/selftest-suites.mjs', '// suites'); write('tools/selftest-cache.mjs', '// cache');
write('src/a.ts', "import { b } from './b.ts';\nexport const a = b + 1;\n");
write('src/b.ts', "export const b = 1;\n");
write('src/lazy.ts', "export const load = (name) => import(`./profiles/${name}.ts`);\n");
write('src/profiles/one.ts', 'export const one = 1;\n');
write('src/profiles/two.ts', 'export const two = 2;\n');
write('docs/contract.json', JSON.stringify({ sources: { 'src/contract-target.ts': 'sha' } }));
write('src/contract-target.ts', 'export const target = 1;\n');
write('public/icons/x.webp', 'webp');
write('index.html', '<html></html>');
write('src/main.ts', 'export const main = 1;\n');
write('src/simple.selftest.mjs', "import { a } from './a.ts';\nconsole.log(a);\n");
write('src/lazy.selftest.mjs', "import { load } from './lazy.ts';\nawait load('one');\n");
write('src/contract.selftest.mjs', "import { readFileSync } from 'node:fs';\nconst receipt = JSON.parse(readFileSync(new URL('../docs/contract.json', import.meta.url), 'utf8'));\n");
write('src/joined.selftest.mjs', "import { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\nconst here = new URL('.', import.meta.url).pathname;\nreadFileSync(join(here, '..', 'index.html'), 'utf8');\nreadFileSync(join(here, 'main.ts'), 'utf8');\n");
write('src/listing.selftest.mjs', "import { readdirSync } from 'node:fs';\nreaddirSync('public/icons');\n");
write('src/url.selftest.mjs', "const page = `http://127.0.0.1:${1}/tools/page.html`;\n");
write('src/icons.selftest.mjs', "const icon = new URL(`../public/icons/${id}.webp`, import.meta.url);");
write('tools/page.html', '<html>page</html>');

const cacheDir = join(root, 'cache');
const make = (overrides = {}) => createSelftestCache({ root, cacheDir, env: {}, argv: [], nodeVersion: 'v-test', ...overrides });
const rel = (cache, receipt) => [...cache.closureOf(join(root, receipt))].map((p) => p.slice(root.length + 1)).sort();

assert.equal(SELFTEST_CACHE_VERSION, 2);
assert.equal(collectSelftestInputs('// puppeteer keyboard.press\nexport const value = 1;', 'input.ts').broad, false,
  'comments are not browser dependencies');
assert.equal(collectSelftestInputs('const message = "puppeteer";', 'input.ts').browser, false,
  'a literal mention does not execute a browser');
assert.equal(collectSelftestInputs('import browser from "puppeteer";', 'probe.mjs').browser, true);

// Planner precision (2026-10-13): three parser rules each widened hundreds of receipts to the whole tree.
// 1. A computed import() marked `@selftest-external` loads something outside the repository (a built page chunk): it is
//    recorded, not treated as "could be any file". Only the argument's own comments count; unmarked stays opaque.
{
  const marked = collectSelftestInputs('export const load = (url) => import(/* @vite-ignore */ /* @selftest-external: a built page chunk */ url);', 'marked.ts');
  assert.deepEqual([marked.broad, marked.opaqueImport, marked.external], [false, false, ['a built page chunk']], 'a marked computed import is external');
  const nextLine = collectSelftestInputs('void import(\n  // @selftest-external: the page chunk\n  url);', 'next-line.ts');
  assert.deepEqual([nextLine.opaqueImport, nextLine.external], [false, ['the page chunk']], 'a marker on its own line before the argument counts');
  for (const source of ['void import(/* @vite-ignore */ url);', 'void import(url /* @selftest-external: after */);',
    '// @selftest-external: above\nvoid import(url);', 'void import(/* @selftest-externally */ url);']) {
    const unmarked = collectSelftestInputs(source, 'unmarked.ts');
    assert.deepEqual([unmarked.broad, unmarked.opaqueImport, unmarked.external], [true, true, []], `still opaque: ${source}`);
  }
}
// 2. A JSON key or value is a path only as a whole string; prose that links a docs URL names no input. TS keeps the scan.
{
  const json = value => collectSelftestInputs(JSON.stringify(value), 'catalog.json').specifiers;
  assert.deepEqual(json({ 'help.docs': 'Read https://github.com/Kevin-Liu-01/Claude-of-Tanks/blob/main/docs/ARCHITECTURE.md first.' }), [],
    'catalog prose with a GitHub docs URL names no file');
  assert.deepEqual(json({ url: 'https://example.com/src/a.ts', trace: 'at f (file://src/a.ts:3:9)', cmd: 'node src/a.ts --x' }), [],
    'URLs, stack frames and shell commands are not paths');
  assert.deepEqual(json({ sources: { 'src/contract-target.ts': 'sha' }, page: '/tools/page.html', near: '../b.json' }),
    ['src/contract-target.ts', '/tools/page.html', '../b.json'], 'whole-string keys and values that are paths stay inputs');
  assert.ok(collectSelftestInputs("const page = 'http://127.0.0.1:5173/src/a.ts';", 'probe.mjs').specifiers.includes('/src/a.ts'),
    'a dev-server URL in code still names its source');
}
// 3. Only node:path's join/resolve name a path: Array#join('') used to make a module depend on its own directory.
{
  const joined = source => collectSelftestInputs(source, 'probe.mjs').joined;
  assert.deepEqual(joined("const html = parts.join(''); const csv = [a, b].join(','); Promise.resolve('x');"), [],
    'string joins and Promise.resolve are not paths');
  assert.deepEqual(joined("import { join } from './strings.ts'; join(dir, 'a.ts');"), [], 'a join from elsewhere is not path.join');
  assert.deepEqual(joined("import { join as at, resolve } from 'node:path'; at(dir, 'a.ts'); resolve(dir, 'b.ts'); at(dir, '');"),
    [['a.ts'], ['b.ts']], 'node:path join/resolve (aliased too) keep their literal segments; an empty segment list names nothing');
  assert.deepEqual(joined("import * as p from 'path'; import q from 'node:path/posix'; import { posix as x } from 'node:path';\n"
    + "p.join(dir, 'a.ts'); q.resolve('b.ts'); x.join('c.ts'); p.posix.join('d.ts'); path.join(root, 'e.ts');"),
  [['a.ts'], ['b.ts'], ['c.ts'], ['d.ts'], ['e.ts']], 'namespace, default, posix and conventional path bindings');
}
assert.deepEqual(rel(make(), 'src/simple.selftest.mjs'), ['src/a.ts', 'src/b.ts', 'src/simple.selftest.mjs'], 'static imports follow recursively');
assert.ok(rel(make(), 'src/lazy.selftest.mjs').includes('src/profiles'), 'a template dynamic import pulls in its directory');
assert.deepEqual(rel(make(), 'src/contract.selftest.mjs'), ['docs/contract.json', 'src/contract-target.ts', 'src/contract.selftest.mjs'],
  'paths listed inside a JSON contract are inputs (the Chieftain foundation case)');
assert.deepEqual(rel(make(), 'src/joined.selftest.mjs'), ['index.html', 'main.ts', 'src/index.html', 'src/joined.selftest.mjs', 'src/main.ts'],
  'joined paths resolve locally; a bare filename is watched beside its module and at the root, present or not');
assert.ok(rel(make(), 'src/listing.selftest.mjs').includes('public/icons'), 'a listed directory is an input');
assert.ok(rel(make(), 'src/listing.selftest.mjs').includes('src'), 'a directory-listing receipt observes the source tree broadly');
assert.ok(rel(make(), 'src/url.selftest.mjs').includes('tools/page.html'), 'a dev-server URL names its page');
assert.ok(rel(make(), 'src/icons.selftest.mjs').includes('public/icons'), 'templated data URLs observe their actual directory');
write('src/erased.ts', 'import type { A } from "./a.ts"; import { type B } from "./b.ts";');
assert.deepEqual(rel(make(), 'src/erased.ts'), ['src/erased.ts'], 'type-only edges are checked by typecheck, not executed by Node');
write('src/source-read.selftest.mjs', "import { readFileSync } from 'node:fs'; readFileSync(new URL('./a.ts', import.meta.url));");
assert.deepEqual(rel(make(), 'src/source-read.selftest.mjs'), ['src/a.ts', 'src/source-read.selftest.mjs'],
  'reading source text does not execute its imports');

write('src/query.selftest.mjs', "await import('./a.ts?fresh-case'); await import(`./b.ts?case=${1}`);");
assert.ok(rel(make(), 'src/query.selftest.mjs').includes('src/a.ts'), 'query-suffixed imports watch the real source');
assert.ok(rel(make(), 'src/query.selftest.mjs').includes('src/b.ts'), 'an interpolated query also watches its source');
write('src/outside.ts', 'export const helper = 1;');
write('src/profiles/one.ts', "export { helper } from '../outside.ts';");
assert.ok(rel(make(), 'src/lazy.selftest.mjs').includes('src/outside.ts'),
  'dynamic directory modules retain their dependencies outside that directory');
write('src/missing.selftest.mjs', "const optional = new URL('./not-yet.json', import.meta.url);");
const missingKey = make().inputKey('src/missing.selftest.mjs').key;
make().persist();
write('src/not-yet.json', '{}');
assert.notEqual(make().inputKey('src/missing.selftest.mjs').key, missingKey, 'creating a formerly missing input invalidates its proof');
write('src/root-missing.selftest.mjs', "import { existsSync } from 'node:fs'; existsSync('optional.json');");
const rootMissingKey = make().inputKey('src/root-missing.selftest.mjs').key;
write('optional.json', '{}');
assert.notEqual(make().inputKey('src/root-missing.selftest.mjs').key, rootMissingKey,
  'missing bare filenames are tracked before a file exists');

// keys: stable across runs, changed by any input byte, by a directory member, by a salt
const first = make().inputKey('src/simple.selftest.mjs');
assert.equal(make().inputKey('src/simple.selftest.mjs').key, first.key, 'the key is a pure function of the inputs');
assert.equal(first.inputs, 3);
write('src/b.ts', 'export const b = 2;\n');
assert.notEqual(make().inputKey('src/simple.selftest.mjs').key, first.key, 'a dependency byte changes the key');
const lazyKey = make().inputKey('src/lazy.selftest.mjs').key;
write('src/profiles/three.ts', 'export const three = 3;\n');
assert.notEqual(make().inputKey('src/lazy.selftest.mjs').key, lazyKey, 'a new file in a directory input changes the key');
const beforeTouch = make().inputKey('src/lazy.selftest.mjs').key;
const originalTime = statSync(join(root, 'src/profiles/two.ts'));
utimesSync(join(root, 'src/profiles/two.ts'), new Date(), new Date(Date.now() + 20000));
assert.equal(make().inputKey('src/lazy.selftest.mjs').key, beforeTouch, 'checkout timestamp changes do not discard a valid proof');
write('src/profiles/two.ts', 'export const two = 9;\n'); // same length
utimesSync(join(root, 'src/profiles/two.ts'), originalTime.atime, originalTime.mtime);
assert.notEqual(make().inputKey('src/lazy.selftest.mjs').key, beforeTouch,
  'changed bytes with the original size and mtime cannot reuse a PASS');
const outsideKey = make().inputKey('src/lazy.selftest.mjs').key;
write('src/outside.ts', 'export const helper = 2;');
assert.notEqual(make().inputKey('src/lazy.selftest.mjs').key, outsideKey);
const stableRegistry = make().inputKey('src/simple.selftest.mjs').key;
write('tools/selftest-suites.mjs', '// a new unrelated check is registered');
assert.equal(make().inputKey('src/simple.selftest.mjs').key, stableRegistry,
  'adding an unrelated check does not invalidate every existing result');
const salted = make().inputKey('src/simple.selftest.mjs').key;
write('package-lock.json', '{"name":"fixture","v":2}');
assert.notEqual(make().inputKey('src/simple.selftest.mjs').key, salted, 'the lockfile salts every key');
assert.notEqual(make({ nodeVersion: 'v-other' }).inputKey('src/simple.selftest.mjs').key, make().inputKey('src/simple.selftest.mjs').key,
  'the node version salts every key');
write('src/environment.selftest.mjs', 'console.log(process.env.MODE);');
assert.notEqual(make({ env: { MODE: 'one' } }).inputKey('src/environment.selftest.mjs').key,
  make({ env: { MODE: 'two' } }).inputKey('src/environment.selftest.mjs').key, 'observed environment values change the proof');
write('src/opaque.selftest.mjs', 'await import(process.env.MODULE);');
assert.equal(make().lookup('src/opaque.selftest.mjs').key, undefined, 'unresolved imports do not receive reusable proofs');
write('src/chunk.ts', "export const chunk = (url) => import(/* @vite-ignore */ /* @selftest-external: a built page chunk */ url);\n");
write('src/chunk.selftest.mjs', "import { chunk } from './chunk.ts';\nconsole.log(typeof chunk);\n");
assert.deepEqual(rel(make(), 'src/chunk.selftest.mjs'), ['src/chunk.selftest.mjs', 'src/chunk.ts'],
  'an external chunk import neither widens the closure to the tree');
assert.ok(make().lookup('src/chunk.selftest.mjs').key, '...nor forces a fresh run');
write('src/strings.selftest.mjs', "const html = ['<b>', '</b>'].join('');\nconsole.log(html);\n");
assert.deepEqual(rel(make(), 'src/strings.selftest.mjs'), ['src/strings.selftest.mjs'], "Array#join('') is not the module's own directory");
write('src/environment-destructured.selftest.mjs', 'const { MODE: value } = process.env; console.log(value);');
assert.notEqual(make({ env: { MODE: 'one' } }).inputKey('src/environment-destructured.selftest.mjs').key,
  make({ env: { MODE: 'two' } }).inputKey('src/environment-destructured.selftest.mjs').key,
  'destructured environment reads are tracked too');
write('src/environment-object.selftest.mjs', 'configure(process.env);');
assert.equal(make().lookup('src/environment-object.selftest.mjs').key, undefined,
  'passing the whole environment is conservatively checked fresh');

// Read coverage (2026-10-13). Every file a receipt reads at runtime must be in its key. Two classes went missing once
// the i18n import stopped forcing fresh runs: site/*.html (no parser rule named the site/ root) and a bare sibling
// read through `new URL(name, import.meta.url)` (resolved against the root only). The rules are general: any top-level
// directory of the checkout, any module directory.
write('site/home.html', '<html>home</html>'); write('site/docs-ai.html', '<html>ai</html>');
write('zeta/table.json', '{}');
write('src/site.selftest.mjs', "import { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n"
  + "for (const page of ['site/home.html', 'zeta/table.json']) readFileSync(join(ROOT, page), 'utf8');\n");
assert.deepEqual(rel(make(), 'src/site.selftest.mjs'), ['site/home.html', 'src/site.selftest.mjs', 'zeta/table.json'],
  'a literal under any top-level directory is an input, with no list of root names to keep current');
write('src/site-template.selftest.mjs', "existsSync(join(ROOT, `site/docs-${id}.html`)); existsSync(`${ROOT}/zeta/${name}.json`);\n"
  + "const mime = `image/${format}`;\n");
assert.deepEqual(rel(make(), 'src/site-template.selftest.mjs'), ['site', 'src/site-template.selftest.mjs', 'zeta'],
  'a templated page watches its directory, also after an interpolated base; `image/${format}` names no file and widens nothing');
write('src/vehicles/facade.ts', "import './registration.ts';\n"); write('src/vehicles/registration.ts', 'export {};\n');
write('src/vehicles/sibling.selftest.mjs', "import { readFileSync } from 'node:fs';\n"
  + "for (const facade of ['facade.ts']) readFileSync(new URL(facade, import.meta.url), 'utf8');\n");
assert.deepEqual(rel(make(), 'src/vehicles/sibling.selftest.mjs'), ['facade.ts', 'src/vehicles/facade.ts', 'src/vehicles/sibling.selftest.mjs'],
  'a bare filename names its sibling (new URL(name, import.meta.url)) and the root file; text reads do not execute it');
{
  const before = make().inputKey('src/vehicles/sibling.selftest.mjs').key;
  write('src/vehicles/facade.ts', "export {};\n");
  assert.notEqual(make().inputKey('src/vehicles/sibling.selftest.mjs').key, before, 'editing the sibling invalidates the PASS');
}
write('src/relative.selftest.mjs', "readFileSync(new URL('vehicles/facade.ts', import.meta.url)); const doc = 'docs/contract.json';\n");
assert.deepEqual(rel(make(), 'src/relative.selftest.mjs'), ['docs/contract.json', 'src/contract-target.ts', 'src/relative.selftest.mjs', 'src/vehicles/facade.ts'],
  'a relative path without ./ resolves beside its module too, but invents no src/docs/ while that directory is absent');
write('api/telemetry.ts', 'export default () => {};\n');
write('src/routes.selftest.mjs', "import './a';\nconst endpoint = '/api/telemetry';\nconst include = ['src/**/*.ts'];\n");
assert.deepEqual(rel(make(), 'src/routes.selftest.mjs'), ['src', 'src/a.ts', 'src/b.ts', 'src/routes.selftest.mjs'],
  'only an import completes an extension (the /api/telemetry route is not api/telemetry.ts); a glob watches its directory');
write('.gitignore', 'shots/\n.env.*\n!.env.example\n');
write('shots/frame.png', 'png'); write('.env.local', 'SECRET=1'); write('.env.example', 'SECRET='); write('vercel.json', '{}');
{
  const broad = rel(make(), 'src/listing.selftest.mjs');
  for (const entry of ['api', 'site', 'zeta', 'src', 'public', 'docs', 'tools', '.env.example', '.gitignore', 'index.html', 'vercel.json']) {
    assert.ok(broad.includes(entry), `a directory-listing receipt observes the top-level ${entry}`);
  }
  for (const entry of ['shots', '.env.local', 'cache']) {
    assert.ok(!broad.includes(entry), `ignored or cache output (${entry}) is not part of the repository a broad receipt observes`);
  }
}
// A walker that reads modules by names it computes (tools/static-import-closure.mjs reads every module src/main.ts
// reaches) declares what it reads; the traced sweep found boot-static-closure reading 488 src/ modules outside its key.
write('tools/walker.mjs', "// @selftest-reads: src/ — reads each module its entry imports\n"
  + "import { readFileSync } from 'node:fs';\nexport const walk = (file) => readFileSync(file, 'utf8');\n"
  + "export const note = '// @selftest-reads: docs/ inside a string declares nothing';\n");
write('tools/walker.selftest.mjs', "import { walk } from './walker.mjs';\nwalk(entry);\n");
assert.deepEqual(rel(make(), 'tools/walker.selftest.mjs'), ['src', 'tools/walker.mjs', 'tools/walker.selftest.mjs'],
  'a @selftest-reads comment adds its path to every caller; the same text in a string adds nothing');
assert.deepEqual(collectSelftestInputs('/* @selftest-reads: src/ */\nexport {};', 'block.mjs').reads, ['src/'], 'block comments declare too');

// lookup / record round trip, and the two ways to run everything
{
  const cache = make();
  assert.equal(cache.enabled, true);
  const miss = cache.lookup('src/simple.selftest.mjs');
  assert.equal(miss.skip, false); assert.ok(miss.key);
  cache.recordPass('src/simple.selftest.mjs', miss.key);
  const hit = make().lookup('src/simple.selftest.mjs');
  assert.equal(hit.skip, true, 'a recorded pass with unchanged inputs skips');
  assert.equal(hit.key, miss.key); assert.ok(hit.passedAt);
  write('src/a.ts', "import { b } from './b.ts';\nexport const a = b + 2;\n");
  assert.equal(make().lookup('src/simple.selftest.mjs').skip, false, 'a changed input runs again');
  assert.equal(make({ env: { COT_SELFTEST_CACHE: '0' } }).enabled, false, 'COT_SELFTEST_CACHE=0 disables the cache');
  assert.equal(make({ env: { COT_SELFTEST_CACHE: '0' } }).lookup('src/simple.selftest.mjs').skip, false);
  assert.equal(make({ argv: ['node', 'x', '--all'] }).enabled, false, '--all disables the cache');
  const disabled = make({ env: { COT_SELFTEST_CACHE: '0' } });
  disabled.recordPass('src/simple.selftest.mjs', 'ignored');
  assert.equal(make().lookup('src/simple.selftest.mjs').skip, false, 'a disabled cache records nothing');
}
{
  const cache = make();
  const miss = cache.lookup('src/simple.selftest.mjs');
  cache.recordPass('src/simple.selftest.mjs', miss.key);
  const clone = mkdtempSync(join(tmpdir(), 'cot-selftest-clone-'));
  try {
    cpSync(root, clone, { recursive: true });
    const cloned = createSelftestCache({ root: clone, cacheDir, env: {}, argv: [], nodeVersion: 'v-test' });
    assert.equal(cloned.lookup('src/simple.selftest.mjs').skip, true, 'an identical clean checkout can reuse the content-addressed proof');
    writeFileSync(join(clone, 'src/b.ts'), 'export const b = 9;\n');
    assert.equal(createSelftestCache({ root: clone, cacheDir, env: {}, argv: [], nodeVersion: 'v-test' })
      .lookup('src/simple.selftest.mjs').skip, false, 'a changed checkout never borrows another branch\'s PASS');
  } finally { rmSync(clone, { recursive: true, force: true }); }
  assert.equal(make({ alwaysRun: ['src/simple.selftest.mjs'] }).lookup('src/simple.selftest.mjs').skip, false,
    'timing/environment contracts always execute even with an old PASS');
  write('src/browser.selftest.mjs', 'import browser from "puppeteer";');
  const browser = make(), key = browser.inputKey('src/browser.selftest.mjs').key;
  browser.recordPass('src/browser.selftest.mjs', key);
  assert.equal(make().lookup('src/browser.selftest.mjs').skip, false, 'real browser checks cannot be certified by a stale source-only PASS');
}

rmSync(root, { recursive: true, force: true });

// the real repository: the receipts that moved during batch 28 see their inputs
{
  const cache = createSelftestCache({ env: {}, argv: [] });
  const has = (receipt, needle) => [...cache.closureOf(join(REPO_ROOT, receipt))].some((p) => p.endsWith(needle));
  assert.ok(has('src/vehicles/profiles/chieftain10XServiceFrame.selftest.mjs', 'profiles/chieftainXFoundation.ts'),
    'the Chieftain contract receipt observes the sources its JSON lists');
  assert.ok(has('src/game/loadingIntent.selftest.mjs', 'src/main.ts'), 'the loading-intent receipt observes main.ts');
  assert.ok(has('src/engine/quality.selftest.mjs', 'src/engine/quality.ts'), 'the actual quality contract observes its query-suffixed production import');
  assert.equal(cache.dependenciesOf(join(REPO_ROOT, 'src/game/input.ts')).has(join(REPO_ROOT, 'docs')), false,
    'the real Puppeteer comment does not make input handling depend on deployment notes');
  assert.ok(has('src/ui/minimapObjectives.selftest.mjs', 'src/ui/hud.ts'), 'the minimap receipt observes hud.ts');
  assert.ok(has('src/vehicles/tankFactoryStaging.selftest.mjs', 'src/vehicles/tankFactory.ts'), 'staging observes the factory');
  // 2026-10-02: the icon audit is a fleet audit (tankAssetsAudit.test-support.mjs) of the default-build fleet pass; its
  // file reads stay in the receipt's closure through the support module.
  assert.ok([...cache.closureOf(join(REPO_ROOT, 'src/vehicles/fleetPassDefault.selftest.mjs'))].some((p) => p === join(REPO_ROOT, 'public/icons')),
    'the icon audit observes its templated icon files without pulling in unrelated maps');
  assert.ok(!cache.lookup('tools/selftest-cache.selftest.mjs').skip || cache.lookup('tools/selftest-cache.selftest.mjs').key,
    'lookup returns a key for the running receipt');
  // Planner precision (2026-10-13): the three rules above, on the modules that put most receipts in every landing.
  assert.notEqual(cache.lookup('server/battlePacing.selftest.mjs').reason, 'computed import/environment needs a fresh run',
    'battle pacing (2035 s in the deploy-222 closure) reuses a PASS: the i18n chunk imports are external, not opaque');
  assert.ok(![...cache.dependenciesOf(join(REPO_ROOT, 'src/ui/i18nCatalog.en-US.json'))]
    .some((p) => p.startsWith(join(REPO_ROOT, 'docs') + sep) && p.endsWith('.md')), "the catalog's docs links are prose, not inputs");
  assert.equal(cache.dependenciesOf(join(REPO_ROOT, 'src/vehicles/materials.ts')).has(join(REPO_ROOT, 'src/vehicles')), false,
    "materials.ts's join('') is a string join, not the whole vehicles directory");
  // Read coverage (2026-10-13): the receipts that skipped as "identical inputs passed" on the planner-precision branch
  // and failed when run. Each reads these files at runtime (a traced sweep pins every receipt's reads inside its key).
  // The files each receipt reads come from its own text, so a page or facade renamed on main moves with the receipt.
  const closure = (receipt) => cache.closureOf(join(REPO_ROOT, receipt));
  const named = (receipt, pattern) => collectSelftestInputs(readFileSync(join(REPO_ROOT, receipt), 'utf8'), receipt)
    .specifiers.filter((value) => pattern.test(value));
  for (const receipt of ['src/presentation/publicNav.selftest.mjs', 'src/productStats.selftest.mjs']) {
    const pages = named(receipt, /^site\/[\w.-]+\.html$/), observed = closure(receipt);
    assert.ok(pages.length, `${receipt} names the site pages it reads`);
    for (const page of pages) assert.ok(observed.has(join(REPO_ROOT, page)), `${receipt} observes ${page}`);
  }
  assert.ok(closure('src/ui/localeRouting.selftest.mjs').has(join(REPO_ROOT, 'site')), 'locale routing observes every site page it localizes');
  assert.ok(closure('src/docs/topics.selftest.mjs').has(join(REPO_ROOT, 'site')), 'topics watches site/docs-${id}.html (deleting a page)');
  {
    const receipt = 'src/vehicles/arieteModernSpecs.selftest.mjs', observed = closure(receipt);
    const facades = named(receipt, /^[\w.-]+\.ts$/).filter((name) => statSync(join(REPO_ROOT, 'src/vehicles', name), { throwIfNoEntry: false }));
    assert.ok(facades.length, 'arieteModernSpecs names the facades it reads by bare name');
    for (const facade of facades) {
      assert.ok(observed.has(join(REPO_ROOT, 'src/vehicles', facade)), `arieteModernSpecs observes the sibling it reads by bare name (${facade})`);
    }
  }
  const broad = cache.dependenciesOf(join(REPO_ROOT, 'src/vehicles/combatAnatomyAudit.test-support.mjs'));
  for (const entry of ['site', 'api', 'src', 'vercel.json', 'package.json']) {
    assert.ok(broad.has(join(REPO_ROOT, entry)), `a directory-listing module observes the top-level ${entry}`);
  }
  // (not join(REPO_ROOT, 'node_modules'): that call would itself make this receipt hash the dependency tree)
  assert.ok(![...broad].some((path) => relative(REPO_ROOT, path) === 'node_modules'), 'dependencies are salted by the lockfile, not walked');
  assert.ok(closure('tools/boot-static-closure.selftest.mjs').has(join(REPO_ROOT, 'src')),
    "the boot closure receipt watches src/: it reads every module src/main.ts reaches (tools/static-import-closure.mjs's @selftest-reads)");
}

// The opaque-import guard. An unmarked computed import() (`import(url)`) cannot be followed, so every receipt that executes
// its module runs fresh every time with the whole tree as its inputs. What that costs depends on who executes the module:
// - a module that more than one receipt executes spreads the cost to receipts that never chose it (src/ui/i18nDictionaries.ts
//   alone did that to 305 of the 439 always-run receipts on 9a9ab2a7e). It needs a literal or template specifier, an
//   `/* @selftest-external: <what it loads> */` marker when it loads something outside the repository, or an OPAQUE_IMPORTS row;
// - a module at most one receipt executes (a receipt's own ?query variant, a tool's CLI that only its own receipt imports)
//   costs only that receipt, which ran fresh before 2026-10-13 too. It is reported, never failed.
// So the guard holds on any tree it lands on. As an exact list of every opaque module it went red on origin/main 9d5f98d81,
// which gained tools/media-r5/fleet-rekey.mjs (`await import(join(ROOT, 'src/vehicles/tankFactory.ts'))` in its CLI block,
// executed only by fleet-rekey.selftest.mjs) while the guard was in review. Rows whose module lost its opaque import
// (deleted, renamed or made literal elsewhere) are reported for removal, not failed, for the same reason.
const MODULE_FILE = /\.(?:[mc]?[jt]s|[jt]sx|html)$/;
function auditOpaqueImports({ root, cache, rows, receipts, limit = 256 }) {
  const texts = new Map(), found = new Map(), external = [], declared = [];
  const visit = (file, entry) => {
    // the tracked tree: dot directories, dependencies, builds and tools/tmp-* scratch are ignored by Git
    if (entry.name.startsWith('.') || ['node_modules', 'dist', '__pycache__'].includes(entry.name) || entry.name.startsWith('tmp-')) return;
    if (entry.isDirectory()) {
      for (const child of readdirSync(file, { withFileTypes: true })) visit(join(file, child.name), child);
      return;
    }
    if (!entry.isFile() || !MODULE_FILE.test(entry.name)) return;
    const text = readFileSync(file, 'utf8'), name = relative(root, file);
    texts.set(file, text);
    if (text.includes('@selftest-reads')) for (const path of collectSelftestInputs(text, file).reads) declared.push([name, path]);
    if (!/\bimport\s*\(\s*[^'"`\s)]/.test(text)) return; // only a non-literal first token can be opaque
    const info = collectSelftestInputs(text, file);
    if (info.opaqueImport) found.set(name, info);
    for (const reason of info.external) external.push([name, reason]);
  };
  // The whole repository as the planner sees it (each top-level entry Git does not ignore), so an importer in api/,
  // cloudflare/ or middleware.ts is followed too.
  const entries = new Set(cache.repositoryEntries);
  for (const entry of readdirSync(root, { withFileTypes: true })) if (entries.has(join(root, entry.name))) visit(join(root, entry.name), entry);
  // Who executes a module, by the planner's own edges (cache.modulesOf): a module whose import names it, so its text holds
  // the file's stem, or one whose template import() can reach it.
  const templated = new Set([...texts].filter(([, text]) => /\bimport\s*\(\s*`/.test(text)).map(([file]) => file));
  const importersOf = (file) => {
    const stem = basename(file).replace(/\.[^.]+$/, '');
    return [...texts].filter(([other, text]) => other !== file && (templated.has(other) || text.includes(stem))
      && cache.modulesOf(other).has(file)).map(([other]) => other);
  };
  // The registered receipts that execute a module, itself or through any chain of importers; it stops at two. A module
  // that more than `limit` modules execute is shared whatever the count.
  const executedBy = (name) => {
    const start = join(root, name), seen = new Set([start]), queue = [start], hits = new Set();
    while (queue.length && hits.size < 2 && seen.size <= limit) {
      const file = queue.shift();
      if (receipts.has(relative(root, file))) hits.add(relative(root, file));
      for (const importer of importersOf(file)) if (!seen.has(importer)) { seen.add(importer); queue.push(importer); }
    }
    return { receipts: [...hits].sort(), shared: hits.size > 1 || seen.size > limit };
  };
  const unlisted = [...found.keys()].filter((name) => !rows.has(name)).sort().map((name) => ({ name, ...executedBy(name) }));
  return { found, external, declared, executedBy, shared: unlisted.filter((row) => row.shared),
    confined: unlisted.filter((row) => !row.shared), stale: [...rows.keys()].filter((name) => !found.has(name)).sort() };
}
// The rules on a synthetic tree. It has what main can land beside this receipt: a tool whose CLI imports by a rooted path
// and that only its own receipt imports (the fleet-rekey shape), a receipt's own variant import, a CLI no receipt runs, a
// listed module that was deleted, and the shared cases that must still fail: a library two receipts reach through
// another module, a template import()'s directory member, a helper two receipts import directly, and a module reached
// only through a root file (middleware.ts) outside src/, server/ and tools/.
{
  const tree = mkdtempSync(join(tmpdir(), 'cot-selftest-opaque-'));
  const put = (rel, text) => { mkdirSync(join(tree, rel, '..'), { recursive: true }); writeFileSync(join(tree, rel), text); };
  try {
    put('src/factory.ts', 'export const factory = 1;\n');
    put('tools/rekey.mjs', "import { dirname, join } from 'node:path';\nimport { fileURLToPath, pathToFileURL } from 'node:url';\n"
      + 'export const step = (id) => id;\nif (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {\n'
      + "  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');\n  await import(join(ROOT, 'src/factory.ts'));\n}\n");
    put('tools/rekey.selftest.mjs', "import { step } from './rekey.mjs';\nconsole.log(step('a'));\n");
    put('src/variant.selftest.mjs', "const url = new URL('./factory.ts', import.meta.url);\nawait import(url.href + '?before');\n");
    put('tools/cli-only.mjs', 'await import(process.argv[2]);\n');
    put('src/hub.ts', 'export const load = (url) => import(url);\n'); put('src/panel.ts', "export { load } from './hub.ts';\n");
    put('src/one.selftest.mjs', "import { load } from './panel.ts';\n"); put('src/two.selftest.mjs', "import './panel.ts';\n");
    put('src/plugins/alpha.ts', 'export const fetchPlugin = (url) => import(url);\n');
    put('src/registry.ts', 'export const plugin = (name) => import(`./plugins/${name}.ts`);\n');
    put('src/three.selftest.mjs', "import { plugin } from './registry.ts';\n"); put('src/four.selftest.mjs', "import './registry.ts';\n");
    put('src/lib/index.ts', 'export const any = (url) => import(url);\n');
    put('src/five.selftest.mjs', "import './lib/index.ts';\n"); put('src/six.selftest.mjs', "import { any } from './lib/index.ts';\n");
    put('src/edge.ts', 'export const edge = (url) => import(url);\n'); put('middleware.ts', "export { edge } from './src/edge.ts';\n");
    put('src/seven.selftest.mjs', "import '../middleware.ts';\n"); put('tools/eight.selftest.mjs', "import { edge } from '../middleware.ts';\n");
    const receipts = new Set(['tools/rekey.selftest.mjs', 'src/variant.selftest.mjs', 'src/one.selftest.mjs', 'src/two.selftest.mjs',
      'src/three.selftest.mjs', 'src/four.selftest.mjs', 'src/five.selftest.mjs', 'src/six.selftest.mjs', 'src/seven.selftest.mjs',
      'tools/eight.selftest.mjs']);
    const shared = ['src/edge.ts', 'src/hub.ts', 'src/lib/index.ts', 'src/plugins/alpha.ts'];
    const audit = (rows, options = {}) => auditOpaqueImports({ root: tree, rows: new Map(rows.map((row) => [row, 'fixture'])), receipts,
      cache: createSelftestCache({ root: tree, cacheDir: join(tree, '.cache'), env: {}, argv: [], nodeVersion: 'v-test' }), ...options });
    const open = audit([]);
    assert.deepEqual([...open.found.keys()].sort(), [...shared, 'src/variant.selftest.mjs', 'tools/cli-only.mjs', 'tools/rekey.mjs'],
      'every unmarked computed import() is found, the CLI-block one included');
    assert.deepEqual(open.confined.map(({ name, receipts: by }) => [name, by]), [['src/variant.selftest.mjs', ['src/variant.selftest.mjs']],
      ['tools/cli-only.mjs', []], ['tools/rekey.mjs', ['tools/rekey.selftest.mjs']]],
    "a module at most one receipt executes needs no row: a receipt's own variant, a CLI no receipt runs, a tool only its own receipt imports");
    assert.deepEqual(open.shared.map(({ name, receipts: by }) => [name, by]), [['src/edge.ts', ['src/seven.selftest.mjs', 'tools/eight.selftest.mjs']],
      ['src/hub.ts', ['src/one.selftest.mjs', 'src/two.selftest.mjs']], ['src/lib/index.ts', ['src/five.selftest.mjs', 'src/six.selftest.mjs']],
      ['src/plugins/alpha.ts', ['src/four.selftest.mjs', 'src/three.selftest.mjs']]],
    'a module two receipts execute is shared: through a root file, a re-exporting module or a template import(), or directly');
    const listed = audit([...shared, 'tools/retired.mjs']);
    assert.deepEqual([listed.shared, listed.stale], [[], ['tools/retired.mjs']], 'rows admit shared modules; a deleted row is only reported');
    assert.deepEqual(audit(shared, { limit: 1 }).shared.map(({ name }) => name), ['tools/rekey.mjs'],
      'a module more than `limit` modules execute counts as shared');
  } finally { rmSync(tree, { recursive: true, force: true }); }
}
// Known opaque modules and why. A row is required for a shared one (above); the confined ones are recorded here as well.
const PLAYWRIGHT = 'browser tool: the Playwright/Puppeteer driver comes from --playwright-module or require.resolve';
const IN_PAGE = 'browser census: the import runs inside the page, with the module URL its caller passes';
const CANVAS = 'loads the native @napi-rs/canvas module from --canvas-module or require.resolve';
const VARIANT = 'loads a source module again through a loader hook or a ?query instance (a before/after variant, exposed internals)';
const ROOTED = 'imports repository modules by a path joined from the checkout root (or a --root/--out-dir flag), a table or a source scan';
const ELSEWHERE = 'imports a module outside this checkout: a prior-revision snapshot, a baseline or source root flag, or a temp file';
const OPAQUE_IMPORTS = new Map(Object.entries({
  [PLAYWRIGHT]: ['battle-hud-layout.browser', 'battle-load-layout.browser', 'battle-reports.browser', 'crew-voice.browser',
    'custom-select.browser', 'end-screen-presentation.browser', 'environment-motion-probe', 'field-guide.browser',
    'gallery-damage.browser', 'garage-mobile.browser', 'hud-editor.browser', 'manual-reference.browser',
    'minimap-contacts.browser', 'mobile-multiplayer-layout.browser', 'mobile-surfaces.browser', 'objective-banner.browser',
    'penetration-dock.browser', 'rapid-fire-feedback.browser', 'service-record-layout.browser', 'service-record.browser',
    'sourced-image-composition-probe', 'vehicle-status.browser', 'weapon-readout.browser'].map((name) => `tools/${name}.mjs`),
  [IN_PAGE]: ['tools/night-fixture-census.mjs', 'tools/night-window-census.mjs', 'tools/tank-energy.browser.mjs'],
  [CANVAS]: ['src/world/iceSurfaceDetail.selftest.mjs', 'src/world/mangroveWaterPalette.selftest.mjs',
    'src/world/plasterSurfaceSharing.selftest.mjs', 'src/world/propsTextureRows.selftest.mjs', 'tools/horizon-construction-bench.mjs'],
  [VARIANT]: ['src/vehicles/tankFactoryStaging.selftest.mjs', ...['autumnHeadlands', 'autumnLeafSprays', 'autumnSeasonalPalette',
    'badlandsRelief', 'birchCrownForm', 'borderLandform', 'broadleafBranchlets', 'bushOverlappingSprays', 'canals',
    'cropBiomeIdentity', 'environmentSurfaceColor', 'foundryMasonry', 'foundryServiceCourt', 'grassBladeShape',
    'horizonMesaTexture', 'maps/beachedBoat', 'maps/railCoalStockpiles', 'maps/regional/choufEarthRoof',
    'maps/riverReedContact', 'palmStemDirection', 'playableRelief', 'roadBorderCorridor', 'roadContinuity', 'roadCrownLift',
    'roadCutRecovery', 'roadInheritedGrades', 'roadLookupGrid', 'shrubGrowthPlacement', 'sourcedImageCache',
    'sourcedTerrainPreparation', 'sourcedTextureCompositionAdoption', 'sourcedTextures', 'terraceBenches', 'treeAttachments',
    'woodyRootOrientation', 'wreckEraReceipt'].map((name) => `src/world/${name}.selftest.mjs`),
  'src/world/roadHistoryTestOracle.mjs', 'src/world/shorelineContinuity.test-support.mjs'],
  [ROOTED]: ['src/engine/hazeLaw.selftest.mjs', 'src/game/garageSkyPresets.selftest.mjs',
    'src/vehicles/suppliedSourceArmorInitialization.test-support.mjs', ...['base-shell-surface-audit', 'battle-entry-sweep',
      'gen-interior-fills', 'i18n-page-catalogs', 'i18n-page-catalogs.selftest', 'map-environment-audit', 'media-r5/lab',
      'media-r5/studio-ui', 'mission-dock-seats', 'native-playables-audit', 'record-town-plan', 'strip-nc-registry-probe',
      'visual-census', 'wreck-build-profile', 'wreck-paint-bench'].map((name) => `tools/${name}.mjs`)],
  [ELSEWHERE]: ['tools/export-first-party-preservation.mjs', 'tools/physical-bore-air.selftest.mjs', 'tools/props-build-profile.mjs',
    'tools/road-border-corridor-pilot.mjs'],
}).flatMap(([reason, files]) => files.map((file) => [file, reason])));
{
  const audit = auditOpaqueImports({ root: REPO_ROOT, cache: createSelftestCache({ env: {}, argv: [] }), rows: OPAQUE_IMPORTS,
    receipts: new Set(Object.values(SELFTEST_SUITES).flat()) });
  // A @selftest-reads path that names nothing would add no input and hide the read it was written for.
  assert.ok(audit.declared.some(([file]) => file === 'tools/static-import-closure.mjs'), 'the source walker declares what it reads');
  for (const [file, path] of audit.declared) {
    assert.ok(statSync(join(REPO_ROOT, path), { throwIfNoEntry: false }), `${file}: @selftest-reads names an existing path (${path})`);
  }
  assert.deepEqual(audit.shared.map(({ name, receipts }) => `${name} (executed by ${receipts.join(', ')})`), [],
    'a computed import() that more than one receipt executes: give it a literal specifier, a @selftest-external marker, or an OPAQUE_IMPORTS row');
  for (const { name, receipts } of audit.confined) {
    console.log(`selftest-cache: note: ${name} has a computed import() with no OPAQUE_IMPORTS row; it keeps ${receipts[0] ?? 'no receipt'} running fresh`);
  }
  if (audit.stale.length) console.log(`selftest-cache: note: OPAQUE_IMPORTS rows with no opaque import left (remove them): ${audit.stale.join(', ')}`);
  assert.ok(!audit.found.has('src/ui/i18nDictionaries.ts'), 'the i18n runtime stays followable (305 receipts ran fresh every time through it)');
  // The guard is not vacuous on this tree: the module that started it counts as shared, so an unmarked import() there fails.
  assert.equal(audit.executedBy('src/ui/i18nDictionaries.ts').shared, true, 'the i18n runtime is shared: an opaque import there would fail');
  assert.deepEqual(audit.executedBy('tools/selftest-cache.selftest.mjs'), { receipts: ['tools/selftest-cache.selftest.mjs'], shared: false },
    'a receipt nothing imports is confined to itself');
  assert.ok(audit.external.some(([file]) => file === 'src/ui/i18nDictionaries.ts'), 'its page catalog chunks are the external imports');
  for (const [file, reason] of audit.external) assert.ok(reason.length >= 12, `${file}: a @selftest-external marker says what it loads`);
}
console.log('selftest-cache: dependency closure rules, keys, lookup/record round trip and the batch-28 receipts pass');
