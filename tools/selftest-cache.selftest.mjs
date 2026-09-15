import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSelftestCache, REPO_ROOT, SELFTEST_CACHE_VERSION } from './selftest-cache.mjs';

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
write('tools/page.html', '<html>page</html>');

const cacheDir = join(root, 'cache');
const make = (overrides = {}) => createSelftestCache({ root, cacheDir, env: {}, argv: [], nodeVersion: 'v-test', ...overrides });
const rel = (cache, receipt) => [...cache.closureOf(join(root, receipt))].map((p) => p.slice(root.length + 1)).sort();

assert.equal(SELFTEST_CACHE_VERSION, 1);
assert.deepEqual(rel(make(), 'src/simple.selftest.mjs'), ['src/a.ts', 'src/b.ts', 'src/simple.selftest.mjs'], 'static imports follow recursively');
assert.ok(rel(make(), 'src/lazy.selftest.mjs').includes('src/profiles'), 'a template dynamic import pulls in its directory');
assert.deepEqual(rel(make(), 'src/contract.selftest.mjs'), ['docs/contract.json', 'src/contract-target.ts', 'src/contract.selftest.mjs'],
  'paths listed inside a JSON contract are inputs (the Chieftain foundation case)');
assert.deepEqual(rel(make(), 'src/joined.selftest.mjs'), ['index.html', 'src/joined.selftest.mjs', 'src/main.ts'],
  'join(here, "..", file) literals resolve against the receipt directory (the loading-intent case)');
assert.ok(rel(make(), 'src/listing.selftest.mjs').includes('public/icons'), 'a listed directory is an input');
assert.ok(rel(make(), 'src/listing.selftest.mjs').includes('src'), 'a directory-listing receipt observes the source tree broadly');
assert.ok(rel(make(), 'src/url.selftest.mjs').includes('tools/page.html'), 'a dev-server URL names its page');

// keys: stable across runs, changed by any input byte, by a directory member, by a salt
const first = make().inputKey('src/simple.selftest.mjs');
assert.equal(make().inputKey('src/simple.selftest.mjs').key, first.key, 'the key is a pure function of the inputs');
assert.equal(first.inputs, 3);
write('src/b.ts', 'export const b = 2;\n');
assert.notEqual(make().inputKey('src/simple.selftest.mjs').key, first.key, 'a dependency byte changes the key');
const lazyKey = make().inputKey('src/lazy.selftest.mjs').key;
write('src/profiles/three.ts', 'export const three = 3;\n');
assert.notEqual(make().inputKey('src/lazy.selftest.mjs').key, lazyKey, 'a new file in a directory input changes the key');
const salted = make().inputKey('src/simple.selftest.mjs').key;
write('package-lock.json', '{"name":"fixture","v":2}');
assert.notEqual(make().inputKey('src/simple.selftest.mjs').key, salted, 'the lockfile salts every key');
assert.notEqual(make({ nodeVersion: 'v-other' }).inputKey('src/simple.selftest.mjs').key, make().inputKey('src/simple.selftest.mjs').key,
  'the node version salts every key');

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
rmSync(root, { recursive: true, force: true });

// the real repository: the receipts that moved during batch 28 see their inputs
{
  const cache = createSelftestCache({ env: {}, argv: [] });
  const has = (receipt, needle) => [...cache.closureOf(join(REPO_ROOT, receipt))].some((p) => p.endsWith(needle));
  assert.ok(has('src/vehicles/profiles/chieftain10XServiceFrame.selftest.mjs', 'profiles/chieftainXFoundation.ts'),
    'the Chieftain contract receipt observes the sources its JSON lists');
  assert.ok(has('src/game/loadingIntent.selftest.mjs', 'src/main.ts'), 'the loading-intent receipt observes main.ts');
  assert.ok(has('src/ui/minimapObjectives.selftest.mjs', 'src/ui/hud.ts'), 'the minimap receipt observes hud.ts');
  assert.ok(has('src/vehicles/tankFactoryStaging.selftest.mjs', 'src/vehicles/tankFactory.ts'), 'staging observes the factory');
  assert.ok([...cache.closureOf(join(REPO_ROOT, 'src/vehicles/tankAssets.selftest.mjs'))].some((p) => p === join(REPO_ROOT, 'public')),
    'the icon audit observes the public tree');
  assert.ok(!cache.lookup('tools/selftest-cache.selftest.mjs').skip || cache.lookup('tools/selftest-cache.selftest.mjs').key,
    'lookup returns a key for the running receipt');
}
console.log('selftest-cache: dependency closure rules, keys, lookup/record round trip and the batch-28 receipts pass');
