// bundle-budget.selftest.mjs — the static bundle budget's computation on a fixture dist (never a real build).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import {
  BUNDLE_PAGES, budgetMetrics, budgetViolations, budgetsFrom, htmlResources, measureDist, measurePage,
  staticImportSpecifiers,
} from './bundle-budget.mjs';

assert.deepEqual(Object.keys(BUNDLE_PAGES), ['game', 'home', 'docs', 'gallery', 'notFound', 'cn']);
assert.deepEqual(budgetMetrics('game'), ['requests', 'raw', 'gzip', 'brotli', 'entryRaw', 'entryBrotli']);
assert.deepEqual(budgetMetrics('home'), ['requests', 'raw', 'gzip', 'brotli'],
  'public pages budget their totals; their first module script is an arbitrary shared chunk');

assert.deepEqual(htmlResources(`
  <link rel="preload" as="font" href="/fonts/a.woff2" crossorigin>
  <script type="module" crossorigin src="/assets/main-aaaa1111.js"></script>
  <script type="module" src="/src/dev-only.ts"></script>
  <script>window.inline = 1;</script>
  <!-- <script type="module" src="/assets/commented-out.js"></script> -->
  <link rel="modulepreload" crossorigin href="/assets/dep-bbbb2222.js">
  <link crossorigin rel="stylesheet" href="/assets/main-cccc3333.css?v=1">
  <link rel="icon" href="/assets/icon.svg">
`), {
  entries: ['assets/main-aaaa1111.js'],
  preloads: ['assets/dep-bbbb2222.js'],
  stylesheets: ['assets/main-cccc3333.css'],
}, 'only bundle files (/assets/) the document requests up front are counted; fonts, icons and comments are not');

assert.deepEqual(staticImportSpecifiers(
  'import{a as e}from"./dep.js";export{x}from"./re.js";export*from"./star.js";import"./side.js";'
  + 'const l=()=>import("./lazy.js");const s=`import"./inString.js"`;new URL("./asset.bin",import.meta.url);',
), ['./dep.js', './re.js', './star.js', './side.js'], 'import() targets, strings and asset URLs are not static edges');

const dist = mkdtempSync(join(tmpdir(), 'cot-bundle-budget-'));
try {
  const write = (file, text) => {
    mkdirSync(dirname(join(dist, file)), { recursive: true });
    writeFileSync(join(dist, file), text);
  };
  write('index.html', '<script type="module" crossorigin src="/assets/main-aaaa1111.js"></script>'
    + '<link rel="modulepreload" crossorigin href="/assets/dep-bbbb2222.js">'
    + '<link rel="stylesheet" crossorigin href="/assets/main-cccc3333.css">');
  write('cn/index.html', '<script type="module" crossorigin src="/assets/main-aaaa1111.js"></script>'
    + '<link rel="modulepreload" crossorigin href="/assets/lazy-ffff6666.js">');
  write('assets/main-aaaa1111.js', 'import{d as e}from"./dep-bbbb2222.js";export{r}from"./reexp-dddd4444.js";'
    + 'const l=()=>import("./lazy-ffff6666.js");console.log(e,l,"' + 'x'.repeat(400) + '");');
  write('assets/dep-bbbb2222.js', 'import"./main-aaaa1111.js";export const d=1;');
  write('assets/reexp-dddd4444.js', 'export const r=2;');
  write('assets/lazy-ffff6666.js', 'import"./lazyonly-gggg7777.js";export default 3;');
  write('assets/lazyonly-gggg7777.js', 'export const z=4;');
  write('assets/main-cccc3333.css', `body{color:red}${'.a{margin:0}'.repeat(40)}`);

  const game = measurePage(dist, 'index.html');
  assert.deepEqual(game.scripts, ['assets/dep-bbbb2222.js', 'assets/main-aaaa1111.js', 'assets/reexp-dddd4444.js'],
    'static closure follows imports and re-exports through a cycle and stops at import()');
  assert.deepEqual(game.stylesheets, ['assets/main-cccc3333.css']);
  assert.equal(game.requests, 4);
  const files = [...game.scripts, ...game.stylesheets].map((file) => readFileSync(join(dist, file)));
  assert.equal(game.raw, files.reduce((sum, bytes) => sum + bytes.length, 0));
  assert.equal(game.gzip, files.reduce((sum, bytes) => sum + gzipSync(bytes, { level: 6 }).length, 0));
  assert.equal(game.brotli, files.reduce((sum, bytes) => sum + brotliCompressSync(bytes, { params: {
    [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
  } }).length, 0));
  assert.equal(game.entry, 'assets/main-aaaa1111.js');
  assert.equal(game.entryRaw, readFileSync(join(dist, 'assets/main-aaaa1111.js')).length);

  const cn = measurePage(dist, 'cn/index.html');
  assert.ok(cn.scripts.includes('assets/lazy-ffff6666.js') && cn.scripts.includes('assets/lazyonly-gggg7777.js'),
    'an explicit modulepreload (the zh-CN catalog on /cn/) is an up-front request with its own closure');
  assert.equal(cn.requests, 5);

  const both = measureDist(dist, { game: 'index.html', cn: 'cn/index.html' });
  assert.deepEqual(both.game, game, 'the shared per-file cache does not change a page result');

  const budgets = budgetsFrom(both);
  assert.equal(budgets.game.requests, Math.ceil(4 * 1.03));
  assert.equal(budgets.game.raw, Math.ceil(game.raw * 1.03));
  assert.deepEqual(budgetViolations(both, budgets), [], 'a build at its own budget passes');
  const grown = { ...both, game: { ...game, brotli: budgets.game.brotli + 1 } };
  assert.deepEqual(budgetViolations(grown, budgets), [`game.brotli: ${budgets.game.brotli + 1} exceeds the budget ${budgets.game.brotli} by 1`]);
  assert.match(budgetViolations(both, { game: budgets.game }).join('\n'), /cn: no budget recorded/,
    'a measured page without a budget fails instead of passing silently');
  assert.match(budgetViolations(both, { game: { ...budgets.game, gzip: undefined }, cn: budgets.cn }).join('\n'),
    /game\.gzip: budget missing/);

  write('broken.html', '<script type="module" src="/assets/missing-hhhh8888.js"></script>');
  assert.throws(() => measurePage(dist, 'broken.html'), /missing-hhhh8888\.js is referenced but missing/);
  assert.throws(() => measurePage(dist, 'absent.html'), /absent\.html is missing .*npm run build/);
} finally {
  rmSync(dist, { recursive: true, force: true });
}

const committed = JSON.parse(readFileSync(new URL('./bundle-budget.json', import.meta.url), 'utf8'));
assert.deepEqual(Object.keys(committed.pages).sort(), Object.keys(BUNDLE_PAGES).sort(),
  'tools/bundle-budget.json budgets exactly the measured pages');
for (const [name, budget] of Object.entries(committed.pages)) {
  assert.deepEqual(Object.keys(budget), budgetMetrics(name), `${name}: budgeted metrics`);
  for (const metric of budgetMetrics(name)) {
    assert.ok(Number.isInteger(budget[metric]) && budget[metric] > 0, `${name}.${metric} budget must be a positive integer`);
  }
}

console.log('bundle-budget.selftest: closure, byte totals, budgets and violations verified on a fixture dist');
