import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync, statSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSelftestCache, REPO_ROOT, SELFTEST_CACHE_VERSION } from './selftest-cache.mjs';
import { collectSelftestInputs } from './selftest-inputs.mjs';

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
assert.deepEqual(rel(make(), 'src/simple.selftest.mjs'), ['src/a.ts', 'src/b.ts', 'src/simple.selftest.mjs'], 'static imports follow recursively');
assert.ok(rel(make(), 'src/lazy.selftest.mjs').includes('src/profiles'), 'a template dynamic import pulls in its directory');
assert.deepEqual(rel(make(), 'src/contract.selftest.mjs'), ['docs/contract.json', 'src/contract-target.ts', 'src/contract.selftest.mjs'],
  'paths listed inside a JSON contract are inputs (the Chieftain foundation case)');
assert.deepEqual(rel(make(), 'src/joined.selftest.mjs'), ['index.html', 'main.ts', 'src/joined.selftest.mjs', 'src/main.ts'],
  'joined paths resolve locally; ambiguous bare filenames conservatively watch the root too');
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
write('src/environment-destructured.selftest.mjs', 'const { MODE: value } = process.env; console.log(value);');
assert.notEqual(make({ env: { MODE: 'one' } }).inputKey('src/environment-destructured.selftest.mjs').key,
  make({ env: { MODE: 'two' } }).inputKey('src/environment-destructured.selftest.mjs').key,
  'destructured environment reads are tracked too');
write('src/environment-object.selftest.mjs', 'configure(process.env);');
assert.equal(make().lookup('src/environment-object.selftest.mjs').key, undefined,
  'passing the whole environment is conservatively checked fresh');

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
}
console.log('selftest-cache: dependency closure rules, keys, lookup/record round trip and the batch-28 receipts pass');
