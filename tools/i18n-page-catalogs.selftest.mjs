// i18n-page-catalogs.selftest.mjs — every public page loads a catalog holding the keys it can show, and no more: at boot
// the keys of its boot graph, and with each module it reaches only through import() the keys that module can show.
//
// The scan (tools/i18n-page-catalogs.mjs) on fixtures and on the real tree, the runtime's catalog meta contract
// (src/ui/i18nDictionaries.ts), and the build plugin's helpers (tools/viteI18nPageCatalogs.ts). A key a public page
// could show raw is an issue here and in the build.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  analyzeModuleSource, catalogSubset, documentCatalog, FULL_CATALOG, htmlInputs, htmlModuleScripts, markupKeys,
  PAGE_CATALOG_META, scanPageCatalogs,
} from './i18n-page-catalogs.mjs';
import {
  bootChunkProblems, BOOT_RUNTIME_MODULES, catalogChunkFiles, i18nPageCatalogs, insertModulePreload, nameCatalogChunks,
  pageCatalogModuleUrl, rewriteLazyImports, VITE_PRELOAD_HELPER,
} from './viteI18nPageCatalogs.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

// --- markup helpers ---------------------------------------------------------------------------
assert.equal(documentCatalog('<meta charset="utf-8"><meta content="home" name="cot-i18n-catalog">'), 'home');
assert.equal(documentCatalog('<!-- <meta name="cot-i18n-catalog" content="x"> --><title>t</title>'), null,
  'a commented-out meta declares nothing');
assert.deepEqual(htmlModuleScripts('<script type="module" src="/src/a.ts"></script><script src="/src/classic.js"></script>'
  + '<script type="module" src="https://cdn.test/x.js"></script><!-- <script type="module" src="/src/b.ts"></script> -->'
  + '<script type="module" src="/src/c.ts?v=1"></script>'), ['src/a.ts', 'src/c.ts'],
'only local module scripts count, queries dropped, comments ignored');
assert.deepEqual(markupKeys('<b data-i18n="a.b">x</b><i data-i18n-aria-label=\'c.d\'></i><s data-i18n="${key}"></s>'),
  ['a.b', 'c.d'], 'interpolated data-i18n values are not keys');

// --- module analysis --------------------------------------------------------------------------
const KEYS = ['nav.home', 'nav.docs', 'topic.build.title', 'topic.ai.title', 'guide.ai.1.t', 'guide.ai.2.t',
  'help.camera', 'help.layers', 'reference.search', 'reference.hint', 'era.modern.long'];
const analyze = (source, file = 'src/fixture/page.ts') => analyzeModuleSource(source, file, { root: ROOT, keys: KEYS });
const I18N = "import { t } from '../ui/i18n.ts';\n";
const issueOf = (source) => analyze(source).issues.join('\n');

let scan = analyze(`${I18N}t('nav.home'); const TABLE = { a: 'help.camera' }; t(TABLE.a);`);
assert.deepEqual([...scan.exact].sort(), ['help.camera', 'nav.home'], 'literal keys, including key tables, are uses');
assert.deepEqual(scan.issues, [], 'a key handed over as a value is spelled as a literal somewhere');
assert.match(issueOf(`${I18N}t('nav.gone');`), /names "nav\.gone", which the catalog does not hold/);
scan = analyze(`${I18N}const slug = location.hash; t(\`topic.\${slug}.title\`);`);
assert.deepEqual(scan.issues, []);
assert.deepEqual(KEYS.filter((key) => scan.patterns.some((regex) => regex.test(key))), ['topic.build.title', 'topic.ai.title'],
  'a template with a leading namespace keeps every key it can build');
assert.match(issueOf(`${I18N}const p = 'x'; t(\`\${p}.title\`);`), /without a leading namespace/,
  'a template whose namespace is computed could build any key');
scan = analyze(`${I18N}const n = 1; t('guide.ai.' + n + '.t');`);
assert.deepEqual(KEYS.filter((key) => scan.patterns.some((regex) => regex.test(key))), ['guide.ai.1.t', 'guide.ai.2.t']);
assert.match(issueOf(`${I18N}const name = 'nav'; t(name + '.home');`), /without a leading namespace/);
assert.match(issueOf(`${I18N}t(\`topic.\${1}.nothing\`);`), /matches no catalog key/);
scan = analyze(`${I18N}const f = Math.random() > 0.5; t(f ? 'help.camera' : 'help.layers'); t(f && 'nav.docs' || 'nav.home');`);
assert.deepEqual([...scan.exact].sort(), ['help.camera', 'help.layers', 'nav.docs', 'nav.home']);
scan = analyze('const node = document.body; node.innerHTML = `<span data-i18n="nav.docs">x</span>${node.id}`;');
assert.ok(scan.exact.has('nav.docs'), 'data-i18n markup built in code is a use');
assert.match(issueOf('const html = \'<b data-i18n="nav.gone">\';'), /data-i18n="nav\.gone", which the catalog does not hold/);
scan = analyze(`${I18N}const prefix = 'reference.'; const k = prefix + location.hash; t(k);`);
assert.deepEqual([...scan.prefixes], ['reference.'], 'a literal ending in a dot keeps the keys it prefixes');
assert.match(issueOf("import { t as tr } from '../ui/i18n.ts';\nconst k = 'x'; tr(`${k}`);"), /without a leading namespace/,
  'an aliased t is still t');
assert.match(issueOf("import * as i18n from '../ui/i18n.ts';\ni18n.t('nav.gone');"), /nav\.gone/, 'a namespace import is audited');
assert.match(issueOf("import { catalogText } from '../ui/i18nDictionaries.ts';\ncatalogText('zh-CN', 'nav.gone');"),
  /nav\.gone/, 'catalogText takes its key second');
assert.deepEqual(analyze(`${I18N}const curve = [0, 1].map((t) => t('local.call'));`).issues, [],
  'a parameter named t shadows the import');
assert.deepEqual(analyze("import { t } from './elsewhere.ts';\nt('nav.gone');").issues, [], 'another module\'s t is not the runtime');
assert.deepEqual(analyze("import type { SupportedLocale } from '../ui/i18n.ts';\nconst t = (x: string) => x; t('nav.gone');").issues, []);
assert.match(issueOf("export { t } from '../ui/i18n.ts';"), /re-exports the i18n runtime/);
assert.match(issueOf("const name = 'x'; void import(`./parts/${name}.ts`);"), /computed specifier/);
assert.match(issueOf("const all = import.meta.glob('./parts/*.ts');"), /import\.meta\.glob/);
assert.deepEqual(analyze("import a from './a.ts';\nexport * from './b.ts';\nvoid import('./c.ts');\nimport type { D } from './d.ts';").imports,
  ['./a.ts', './b.ts', './c.ts'], 'static, re-export and literal import() edges; type-only imports are not edges');
assert.deepEqual(analyze("import a from './a.ts';\nvoid import('./c.ts');\nconst d = import(`./d.ts`);\nvoid import('pkg');\n"
  + "void import('./a.ts');").dynamicImports, ['./c.ts', './d.ts', './a.ts'],
'the literal relative import() specifiers (a package is not followed; ./a.ts, imported both ways, is still listed)');

// --- page catalogs on a fixture project -------------------------------------------------------
const fixture = mkdtempSync(join(tmpdir(), 'cot-i18n-page-catalogs-'));
try {
  const write = (file, text) => {
    mkdirSync(dirname(join(fixture, file)), { recursive: true });
    writeFileSync(join(fixture, file), text);
  };
  const english = Object.fromEntries(KEYS.map((key) => [key, `EN ${key}`]));
  const page = (name, scripts, body = '') => `<!doctype html><html><head>${name === null ? ''
    : `<meta name="cot-i18n-catalog" content="${name}">`}</head><body>${body}${scripts.map((src) =>
    `<script type="module" src="/${src}"></script>`).join('')}</body></html>`;
  write('index.html', page('game', ['src/main.ts']));
  write('site/home.html', page('home', ['src/home.ts'], '<a data-i18n="nav.home">Home</a>'));
  write('site/topic-a.html', page('topic', ['src/topic.ts']));
  write('site/topic-b.html', page('topic', ['src/topic.ts']));
  write('site/bare.html', page(null, ['src/home.ts']));
  write('site/fake.html', page('game', ['src/home.ts']));
  write('src/ui/i18n.ts', 'export const t = (key: string): string => key;\n');
  write('src/ui/i18nCatalogEnUS.ts', "export default { 'era.modern.long': 'x' };\n");
  write('src/main.ts', "import { t } from './ui/i18n.ts';\nt('era.modern.long');\n");
  // home's boot graph is home -> shared -> boot; its lazy graphs are lazy (-> deeper, plain) and keysInBoot. A specifier a
  // module imports both ways is a static edge, and an import() of a module the boot graph holds is no boundary.
  write('src/home.ts', "import { t } from './ui/i18n.ts';\nimport './shared.ts';\nt('nav.docs');\nvoid import('./lazy.ts');\n"
    + "void import('./shared.ts');\nvoid import('./boot.ts');\nvoid import('./keysInBoot.ts');\n"
    + "void import('./ui/i18nCatalogEnUS.ts');\n");
  write('src/shared.ts', "import './boot.ts';\nexport const shared = 1;\n");
  write('src/boot.ts', "import { t } from './ui/i18n.ts';\nexport const hint = t('reference.hint');\n");
  const lazySource = (key) => `import { t } from './ui/i18n.ts';\nexport const label = t('${key}');\n`
    + "void import('./deeper.ts');\nvoid import('./plain.ts');\n";
  write('src/lazy.ts', lazySource('help.camera'));
  write('src/deeper.ts', "import { t } from './ui/i18n.ts';\nexport const both = [t('reference.search'), t('nav.docs')];\n");
  write('src/plain.ts', 'export const plain = 1;\n');
  write('src/keysInBoot.ts', "import { t } from './ui/i18n.ts';\nexport const docs = t('nav.docs');\n");
  write('src/topic.ts', "import { t } from './ui/i18n.ts';\nimport rows from './rows.json' with { type: 'json' };\n"
    + "const slug = String(rows.length);\nexport const title = t(`topic.${slug}.title`);\n");
  write('src/rows.json', JSON.stringify([{ label: 'guide.ai.1.t' }, { label: 'not a key' }]));
  const pages = ['index.html', 'site/home.html', 'site/topic-a.html', 'site/topic-b.html', 'site/bare.html', 'site/fake.html'];
  const cache = new Map();
  const result = scanPageCatalogs({ root: fixture, pages, english, cache });
  assert.deepEqual(Object.keys(result.catalogs), ['game', 'home', 'topic']);
  assert.deepEqual(result.catalogs.home.keys, ['nav.home', 'nav.docs', 'reference.hint'],
    'markup and the boot graph\'s uses, in catalog order; the catalogs themselves are not scanned');
  assert.deepEqual(result.catalogs.home.lazyKeys, ['help.camera', 'reference.search'],
    'the further keys only the lazy graphs reach (nav.docs, a boot key, is not repeated)');
  assert.deepEqual(result.catalogs.home.lazy, ['src/deeper.ts', 'src/keysInBoot.ts', 'src/lazy.ts', 'src/plain.ts'],
    'the import() targets outside the boot graph, and theirs in turn');
  assert.deepEqual(result.catalogs.home.modules, ['src/boot.ts', 'src/deeper.ts', 'src/home.ts', 'src/keysInBoot.ts',
    'src/lazy.ts', 'src/plain.ts', 'src/shared.ts', 'src/ui/i18n.ts'], 'every module the page reaches');
  assert.deepEqual(result.lazySites, { 'src/home.ts': ['./lazy.ts'], 'src/lazy.ts': ['./deeper.ts'] },
    'the import() sites whose target can show a lazy key: not plain.ts (no key) nor keysInBoot.ts (boot keys only)');
  assert.deepEqual([result.catalogs.topic.lazyKeys, result.catalogs.topic.lazy], [[], []], 'a page without import()');
  assert.deepEqual([result.catalogs.game.lazyKeys, result.catalogs.game.lazy], [[], []], 'the game loads everything at boot');
  assert.ok(!result.catalogs.home.modules.includes('src/ui/i18nCatalogEnUS.ts'), 'the scan does not follow a catalog');
  assert.deepEqual(result.catalogs.topic.pages, ['site/topic-a.html', 'site/topic-b.html'], 'pages declaring one catalog share it');
  assert.deepEqual(result.catalogs.topic.keys, ['topic.build.title', 'topic.ai.title', 'guide.ai.1.t'],
    'template patterns and JSON values that name keys');
  assert.equal(result.catalogs.game.keys.length, KEYS.length, 'the game loads the full catalog');
  assert.equal(result.issues.length, 2, result.issues.join('\n'));
  assert.match(result.issues[0], /site\/bare\.html: declares no catalog/);
  assert.match(result.issues[1], /site\/fake\.html: only the game \(index\.html\) loads the full catalogs/);
  write('src/lazy.ts', lazySource('help.layers'));
  const again = scanPageCatalogs({ root: fixture, pages, english, cache });
  assert.deepEqual(again.catalogs.home.lazyKeys, ['help.layers', 'reference.search'], 'an edited module is analysed again');
  const homeAnalysis = cache.get('src/home.ts').result;
  scanPageCatalogs({ root: fixture, pages, english, cache });
  assert.equal(cache.get('src/home.ts').result, homeAnalysis, 'an unchanged module keeps its analysis');
  assert.deepEqual(catalogSubset({ 'nav.home': '首页', other: 'x' }, ['nav.home', 'nav.docs']), { 'nav.home': '首页' },
    'a subset holds the locale\'s own strings; a missing one falls back to English at lookup');

  // The plugin on the fixture: the build serves the boot and the lazy keys apart and rewrites the lazy import() sites;
  // the dev server serves them together and rewrites nothing.
  write('src/ui/i18nCatalog.en-US.json', JSON.stringify(english));
  write('src/ui/i18nCatalog.zh-CN.json', JSON.stringify({ 'help.layers': '图层' }));
  const fixturePlugin = (command) => {
    const plugin = i18nPageCatalogs();
    plugin.configResolved({ root: fixture, command, build: { rollupOptions: { input: {
      index: 'index.html', home: 'site/home.html', a: 'site/topic-a.html', b: 'site/topic-b.html' } } } });
    return plugin;
  };
  const exported = (code) => JSON.parse(code.replace(/^export default /, '').replace(/;\n$/, ''));
  const built = fixturePlugin('build');
  assert.deepEqual(exported(built.load('\0cot-i18n:home.en-US')), catalogSubset(english, ['nav.home', 'nav.docs', 'reference.hint']));
  assert.deepEqual(exported(built.load('\0cot-i18n:home~lazy.en-US')), catalogSubset(english, ['help.layers', 'reference.search']));
  assert.deepEqual(exported(built.load('\0cot-i18n:home~lazy.zh-CN')), { 'help.layers': '图层' }, 'the lazy chunk in the locale\'s strings');
  const transformed = (plugin, file) => plugin.transform.handler(readFileSync(join(fixture, file), 'utf8'), join(fixture, file));
  const homeOut = transformed(built, 'src/home.ts')?.code ?? '';
  const loadFirst = homeOut.slice(homeOut.indexOf('void ') + 5, homeOut.indexOf(".then(() => import('./lazy.ts'))"));
  assert.equal(homeOut, readFileSync(join(fixture, 'src/home.ts'), 'utf8')
    .replace("import('./lazy.ts')", `${loadFirst}.then(() => import('./lazy.ts'))`), 'only the lazy site is rewritten');
  assert.match(loadFirst, /globalThis\.__cotI18nLazy/, 'the site loads the lazy chunk through the runtime\'s global');
  assert.match(transformed(built, 'src/lazy.ts')?.code ?? '', /\.then\(\(\) => import\('\.\/deeper\.ts'\)\);\nvoid import\('\.\/plain\.ts'\)/);
  assert.equal(transformed(built, 'src/topic.ts'), null, 'a module without a lazy site is left alone');
  assert.equal(built.transform.handler("void import('./lazy.ts');", '\0virtual:x.ts'), null, 'a virtual module is left alone');
  const { filter } = built.transform;
  assert.ok(filter.id.include.test(join(fixture, 'src/home.ts')) && filter.code.test("void import ('./x.ts')"));
  assert.ok(filter.id.exclude.test('/p/node_modules/three/build/three.module.js'), 'dependencies are never parsed');
  // the call the sites make settles even when the chunk fails (the module then loads with English for those keys)
  globalThis.__cotI18nLazy = () => Promise.reject(new Error('offline'));
  assert.equal(await (0, eval)(loadFirst), undefined, 'a failed lazy chunk does not fail the import()');
  delete globalThis.__cotI18nLazy;
  assert.equal(await (0, eval)(loadFirst), undefined, 'no runtime (a worker): nothing to wait for');
  // the dev server: one subset of the boot and lazy keys, no lazy chunk named, no site rewritten
  const dev = fixturePlugin('serve');
  assert.deepEqual(Object.keys(exported(dev.load('\0cot-i18n:home.en-US'))),
    ['nav.home', 'nav.docs', 'reference.hint', 'help.layers', 'reference.search']);
  assert.equal(transformed(dev, 'src/home.ts'), null);
  assert.doesNotMatch(dev.transformIndexHtml.handler(readFileSync(join(fixture, 'site/home.html'), 'utf8'), {}), /-lazy=/);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

// --- the real tree ----------------------------------------------------------------------------
process.chdir(ROOT); // vite.config.ts resolves its inputs from the working directory
const { default: config } = await import(pathToFileURL(resolve(ROOT, 'vite.config.ts')).href);
const pages = htmlInputs(config);
const topicPages = pages.filter((file) => /^site\/docs-[a-z]+\.html$/.test(file));
assert.equal(topicPages.length, 14, `the thirteen manual topics and their fallback: ${topicPages.join(', ')}`);
const en = readJson('src/ui/i18nCatalog.en-US.json');
const zh = readJson('src/ui/i18nCatalog.zh-CN.json');
const real = scanPageCatalogs({ root: ROOT, pages, english: en });
assert.deepEqual(real.issues, [], `a public page could show a raw key:\n${real.issues.join('\n')}`);
// 2026-10-06: main's 1f4c1d003 added site/hud-preview.html (the HUD editor's frame of the production HUD); it loads
// its own `hudPreview` page catalog.
assert.deepEqual(Object.keys(real.catalogs), ['docs', 'docsTopic', 'gallery', 'game', 'home', 'hudPreview', 'notFound']);
assert.deepEqual(real.catalogs[FULL_CATALOG].pages, ['index.html'], 'only the game loads the full catalogs');
assert.deepEqual(real.catalogs.docsTopic.pages.sort(), topicPages.sort());
const fullKeys = Object.keys(en);
for (const [name, { pages: catalogPages, modules, keys, lazyKeys, lazy }] of Object.entries(real.catalogs)) {
  if (name === FULL_CATALOG) continue;
  // 2026-10-08: a page boots on its boot graph's keys; the keys only its import() targets can show (the field guides,
  // the reference tables, the media archive, the stars count) load with those modules. Push 3b's gallery bound (0.30:
  // main's 395305d45 damage workbench brought the page to 1198 of 4061 keys through its lab's import()) is retired:
  // every page boots on less than a quarter of the catalog.
  assert.ok(keys.length > 0 && keys.length < fullKeys.length * 0.25, `${name}: ${keys.length} of ${fullKeys.length} keys`);
  assert.ok(!lazyKeys.some((key) => keys.includes(key)), `${name}: a lazy key is not also a boot key`);
  if (lazyKeys.length) assert.ok(lazy.length, `${name}: lazy keys come from lazy boundaries`);
  for (const module of lazy) assert.ok(modules.includes(module), `${name}: the lazy boundary ${module} is scanned`);
  assert.deepEqual(Object.keys(catalogSubset(zh, lazyKeys)), lazyKeys, `${name}: every lazy key has its zh-CN string`);
  assert.ok(keys.includes('garage.tools.stagingAreas'), `${name}: the runtime's locale CSS label`);
  assert.ok(modules.includes('src/ui/i18n.ts'), `${name}: reaches the runtime`);
  assert.ok(!modules.some((module) => /^src\/ui\/i18nCatalog/.test(module)), `${name}: no catalog module in the scan`);
  for (const page of catalogPages) {
    const html = readFileSync(resolve(ROOT, page), 'utf8');
    for (const script of htmlModuleScripts(html)) assert.ok(modules.includes(script), `${page}: ${script} is scanned`);
    for (const key of markupKeys(html)) assert.ok(keys.includes(key), `${page}: data-i18n="${key}" is in ${name}`);
  }
  assert.deepEqual(Object.keys(catalogSubset(zh, keys)), keys, `${name}: every key has its zh-CN string`);
}
assert.ok(real.catalogs.notFound.keys.length <= 16 && real.catalogs.notFound.keys.includes('notFound.metaTitle'),
  `the 404 page needs a handful of strings: ${real.catalogs.notFound.keys.join(', ')}`);
// the gallery's damage workbench, a static import, boots with the page (its garage.module.*, garage.crew.* and
// gallery.damage.* names); the field guides behind the info buttons load with infoGuides.ts
const gallery = real.catalogs.gallery;
for (const prefix of ['garage.module.', 'garage.crew.', 'gallery.damage.']) {
  assert.ok(gallery.keys.some((key) => key.startsWith(prefix)), `the workbench's ${prefix}* keys boot with the gallery`);
}
assert.ok(gallery.lazy.includes('src/ui/infoGuides.ts') && gallery.lazyKeys.some((key) => key.startsWith('fieldGuide.')),
  'the field guides load with infoGuides.ts');
assert.deepEqual(real.lazySites['src/ui/contextInfo.ts'], ['./infoGuides.ts'], 'the info button\'s guide waits for its strings');
// every rewritten site imports a module that some page with a lazy chunk reaches only through import()
const lazyTargets = new Set(Object.values(real.catalogs).filter(({ lazyKeys }) => lazyKeys.length).flatMap(({ lazy }) => lazy));
for (const [module, specifiers] of Object.entries(real.lazySites)) {
  for (const specifier of specifiers) {
    const target = relative(ROOT, resolve(ROOT, dirname(module), specifier)).split(sep).join('/');
    assert.ok(lazyTargets.has(target), `${module}: import('${specifier}') is a lazy boundary`);
  }
}

// The CLI (npm run i18n:check) on the real tree: vite.config.ts imports the plugin, which imports the scanner, so the CLI
// must not await its run at top level while importing the config (Node reports an unsettled top-level await).
const cli = spawnSync(process.execPath, ['tools/i18n-page-catalogs.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
assert.equal(cli.status, 0, `node tools/i18n-page-catalogs.mjs --check:\n${cli.stdout}${cli.stderr}`);
assert.match(cli.stdout, /^notFound\s+\d+ keys/m);
assert.match(cli.stdout, /^gallery\s+\d+ keys .* \+ lazy \d+ keys \d+ B behind \d+ import\(\) boundaries$/m);
assert.match(cli.stdout, /i18n-page-catalogs: PASS/);

// --- the runtime's catalog meta contract --------------------------------------------------------
const registrySource = readFileSync(resolve(ROOT, 'src/ui/i18nDictionaries.ts'), 'utf8');
assert.ok(registrySource.includes(`meta[name="${PAGE_CATALOG_META}"]`), 'the runtime reads the meta the scan and the plugin name');
assert.match(registrySource, /getAttribute\(`data-\$\{locale\.toLowerCase\(\)\}\$\{suffix\}`\)/,
  'the runtime reads data-en-us / data-zh-cn (and their -lazy chunks)');
const { lazyCatalogUrl, pageCatalogUrl } = await import('../src/ui/i18nDictionaries.ts');
const withDocument = (attributes, run) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelector: (selector) => (selector === `meta[name="${PAGE_CATALOG_META}"]` && attributes
      ? { getAttribute: (name) => attributes[name] ?? null } : null),
  } });
  try { return run(); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  }
};
const page = { content: 'home', 'data-en-us': '/assets/i18n.home.en-US-abc.js', 'data-zh-cn': '/@cot-i18n/home.zh-CN.js' };
assert.equal(withDocument(page, () => pageCatalogUrl('en-US')), '/assets/i18n.home.en-US-abc.js');
assert.equal(withDocument(page, () => pageCatalogUrl('zh-CN')), '/@cot-i18n/home.zh-CN.js', 'the dev server\'s virtual module');
assert.equal(withDocument({ content: 'game' }, () => pageCatalogUrl('en-US')), null, 'the game loads the full catalogs');
assert.equal(withDocument(null, () => pageCatalogUrl('en-US')), null, 'no meta: the full catalogs');
for (const url of ['//cdn.test/x.js', 'https://cdn.test/x.js', '/\\cdn.test/x.js', 'data:text/javascript,1']) {
  assert.equal(withDocument({ content: 'home', 'data-en-us': url }, () => pageCatalogUrl('en-US')), null, `${url} is refused`);
}
assert.equal(pageCatalogUrl('en-US'), null, 'Node has no document');
// the lazy chunks: the same contract under data-en-us-lazy / data-zh-cn-lazy
const lazyPage = { ...page, 'data-en-us-lazy': '/assets/i18n.home~lazy.en-US-abc.js', 'data-zh-cn-lazy': '/@cot-i18n/home~lazy.zh-CN.js' };
assert.equal(withDocument(lazyPage, () => lazyCatalogUrl('en-US')), '/assets/i18n.home~lazy.en-US-abc.js');
assert.equal(withDocument(lazyPage, () => lazyCatalogUrl('zh-CN')), '/@cot-i18n/home~lazy.zh-CN.js');
assert.equal(withDocument(page, () => lazyCatalogUrl('en-US')), null, 'a page without a lazy chunk');
for (const url of ['//cdn.test/x.js', 'https://cdn.test/x.js', '/\\cdn.test/x.js']) {
  assert.equal(withDocument({ ...page, 'data-en-us-lazy': url }, () => lazyCatalogUrl('en-US')), null, `${url} is refused`);
}
assert.equal(lazyCatalogUrl('en-US'), null, 'Node has no document');
assert.equal(globalThis.__cotI18nLazy, undefined, 'without a document the runtime registers no loader');
// loading (a fresh process, so no registry state of this one): a lazy chunk joins its locale's boot chunk, a failed one
// is retried, and a locale that loads after a lazy module takes its lazy chunk with it
const chunkDir = mkdtempSync(join(tmpdir(), 'cot-i18n-lazy-chunks-'));
try {
  const chunkFile = (name, dictionary) => {
    writeFileSync(join(chunkDir, name), `export default ${JSON.stringify(dictionary)};\n`);
    return join(chunkDir, name);
  };
  const attributes = { content: 'home', 'data-en-us': chunkFile('en.mjs', { 'boot.key': 'Boot' }),
    'data-en-us-lazy': join(chunkDir, 'missing.mjs'), 'data-zh-cn': chunkFile('zh.mjs', { 'boot.key': '启动' }),
    'data-zh-cn-lazy': chunkFile('zh-lazy.mjs', { 'lazy.key': '懒' }) };
  const enLazy = chunkFile('en-lazy.mjs', { 'lazy.key': 'Lazy' });
  const script = `import assert from 'node:assert/strict';
const attributes = ${JSON.stringify(attributes)};
globalThis.document = { querySelector: (selector) => (selector === 'meta[name="${PAGE_CATALOG_META}"]'
  ? { getAttribute: (name) => attributes[name] ?? null } : null) };
const registry = await import(${JSON.stringify(pathToFileURL(resolve(ROOT, 'src/ui/i18nDictionaries.ts')).href)});
assert.equal(globalThis.__cotI18nLazy, registry.loadLazyCatalog, 'a document registers the loader the build calls');
await registry.loadLocaleDictionary('en-US');
assert.equal(registry.catalogText('en-US', 'boot.key'), 'Boot');
assert.equal(registry.catalogText('en-US', 'lazy.key'), 'lazy.key', 'no lazy key before a lazy module loads');
await assert.rejects(registry.loadLazyCatalog(), 'a missing lazy chunk rejects (the build sites go on without it)');
attributes['data-en-us-lazy'] = ${JSON.stringify(enLazy)};
await registry.loadLazyCatalog();
assert.equal(registry.catalogText('en-US', 'lazy.key'), 'Lazy', 'a failed lazy chunk is retried');
assert.equal(registry.catalogText('en-US', 'boot.key'), 'Boot', 'the lazy chunk joins the boot chunk');
assert.equal(registry.localeDictionary('zh-CN'), undefined, 'English documents never load Chinese');
await registry.loadLocaleDictionary('zh-CN');
assert.equal(registry.catalogText('zh-CN', 'lazy.key'), '懒', 'a locale loaded after a lazy module takes its lazy chunk');
assert.equal(registry.catalogText('zh-CN', 'boot.key'), '启动');
console.log('lazy-runtime PASS');
`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, `the lazy chunk runtime:\n${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /lazy-runtime PASS/);
} finally {
  rmSync(chunkDir, { recursive: true, force: true });
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  querySelector() { throw new Error('a stand-in that knows only its own selectors'); },
} });
assert.equal(pageCatalogUrl('en-US'), null, 'a throwing stand-in document loads the full catalogs');
delete globalThis.document;

// --- the build plugin ---------------------------------------------------------------------------
const files = { 'en-US': '/assets/i18n.home.en-US-a1.js', 'zh-CN': '/assets/i18n.home.zh-CN-b2.js' };
const lazyFiles = { 'en-US': '/assets/i18n.home~lazy.en-US-c3.js', 'zh-CN': '/assets/i18n.home~lazy.zh-CN-d4.js' };
assert.equal(nameCatalogChunks('<meta name="cot-i18n-catalog" content="home">', files, lazyFiles),
  '<meta name="cot-i18n-catalog" content="home" data-en-us="/assets/i18n.home.en-US-a1.js" '
  + 'data-zh-cn="/assets/i18n.home.zh-CN-b2.js" data-en-us-lazy="/assets/i18n.home~lazy.en-US-c3.js" '
  + 'data-zh-cn-lazy="/assets/i18n.home~lazy.zh-CN-d4.js">');
assert.equal(nameCatalogChunks('<head><meta name="cot-i18n-catalog" content="home"></head>', files),
  '<head><meta name="cot-i18n-catalog" content="home" data-en-us="/assets/i18n.home.en-US-a1.js" '
  + 'data-zh-cn="/assets/i18n.home.zh-CN-b2.js"></head>');
assert.equal(nameCatalogChunks('<meta name="cot-i18n-catalog" content="home" />', files),
  '<meta name="cot-i18n-catalog" content="home" data-en-us="/assets/i18n.home.en-US-a1.js" data-zh-cn="/assets/i18n.home.zh-CN-b2.js" />');
assert.throws(() => nameCatalogChunks('<head></head>', files), /no <meta name="cot-i18n-catalog">/);
// an import() of a lazy boundary loads the lazy chunk first; the offsets are UTF-16 (text before the site is not ASCII)
const once = rewriteLazyImports("void import('./x.ts');", 'src/a.ts', new Set(['./x.ts']));
const LOAD = once.slice('void '.length, once.indexOf(".then(() => import('./x.ts'))"));
assert.equal(once, `void ${LOAD}.then(() => import('./x.ts'));`);
assert.equal(rewriteLazyImports("// 图层 — 😀\nconst f = (): Promise<unknown> => import('./x.ts'), g = import('./y.ts'), h = import(`./x.ts`);",
  'src/a.ts', new Set(['./x.ts'])), "// 图层 — 😀\nconst f = (): Promise<unknown> => "
  + `${LOAD}.then(() => import('./x.ts')), g = import('./y.ts'), h = ${LOAD}.then(() => import(\`./x.ts\`));`);
assert.equal(rewriteLazyImports("void import('./y.ts');", 'src/a.ts', new Set(['./x.ts'])), null, 'nothing to rewrite');
assert.equal(rewriteLazyImports("void import('./x.ts');", 'src/a.ts', new Set()), null);
const preloaded = insertModulePreload('<head><script type="module" crossorigin src="/assets/a.js"></script>'
  + '<link rel="stylesheet" href="/assets/a.css"></head>', '/assets/en.js');
assert.equal(preloaded, '<head><script type="module" crossorigin src="/assets/a.js"></script>\n'
  + '<link rel="modulepreload" crossorigin href="/assets/en.js"><link rel="stylesheet" href="/assets/a.css"></head>');
assert.equal(insertModulePreload(preloaded, '/assets/en.js'), preloaded, 'preloading is idempotent');
assert.equal(insertModulePreload('<head></head>', '/assets/en.js'),
  '<head><link rel="modulepreload" crossorigin href="/assets/en.js">\n</head>');

const chunk = (fileName, extra = {}) => ({ type: 'chunk', fileName, moduleIds: [], imports: [], dynamicImports: [], code: '',
  isEntry: false, facadeModuleId: null, ...extra });
const bundle = {
  'assets/i18n-r1.js': chunk('assets/i18n-r1.js', {
    moduleIds: ['\0vite/modulepreload-polyfill.js', '/p/src/ui/localeRouting.ts', '/p/src/ui/i18nDictionaries.ts',
      '/p/src/ui/i18n.ts', '/p/src/presentation/staticI18n.ts', '/p/src/ui/responsiveLayout.ts'],
    imports: ['assets/preload-helper-p1.js'],
    dynamicImports: ['assets/i18nCatalogEnUS-e1.js', 'assets/i18nCatalogZhCN-z1.js'],
    code: 'import("./i18nCatalogEnUS-e1.js");import("./i18nCatalogZhCN-z1.js")',
  }),
  'assets/preload-helper-p1.js': chunk('assets/preload-helper-p1.js', { moduleIds: ['\0vite/preload-helper.js'] }),
  'assets/i18nCatalogEnUS-e1.js': chunk('assets/i18nCatalogEnUS-e1.js', {
    moduleIds: ['/p/src/ui/i18nCatalog.en-US.json', '/p/src/ui/i18nCatalogEnUS.ts'] }),
  'assets/i18nCatalogZhCN-z1.js': chunk('assets/i18nCatalogZhCN-z1.js', {
    moduleIds: ['/p/src/ui/i18nCatalog.zh-CN.json', '/p/src/ui/i18nCatalogZhCN.ts'] }),
  'assets/i18n.home.en-US-h1.js': chunk('assets/i18n.home.en-US-h1.js', { isEntry: true, facadeModuleId: '\0cot-i18n:home.en-US' }),
  'assets/i18n.home.zh-CN-h2.js': chunk('assets/i18n.home.zh-CN-h2.js', { isEntry: true, facadeModuleId: '\0cot-i18n:home.zh-CN' }),
  'assets/i18n.home~lazy.en-US-l1.js': chunk('assets/i18n.home~lazy.en-US-l1.js', {
    isEntry: true, facadeModuleId: '\0cot-i18n:home~lazy.en-US' }),
  'assets/i18n.home~lazy.zh-CN-l2.js': chunk('assets/i18n.home~lazy.zh-CN-l2.js', {
    isEntry: true, facadeModuleId: '\0cot-i18n:home~lazy.zh-CN' }),
  'assets/main-m1.js': chunk('assets/main-m1.js', { isEntry: true, facadeModuleId: '/p/index.html', imports: ['assets/i18n-r1.js'] }),
  'assets/wreckBakeWorker-w1.js': chunk('assets/wreckBakeWorker-w1.js', {
    isEntry: true, facadeModuleId: '/p/src/world/wreckBakeWorker.ts', imports: ['assets/preload-helper-p1.js'] }),
};
assert.deepEqual(catalogChunkFiles(bundle, 'home'),
  { 'en-US': '/assets/i18n.home.en-US-h1.js', 'zh-CN': '/assets/i18n.home.zh-CN-h2.js' });
assert.deepEqual(catalogChunkFiles(bundle, FULL_CATALOG),
  { 'en-US': '/assets/i18nCatalogEnUS-e1.js', 'zh-CN': '/assets/i18nCatalogZhCN-z1.js' });
assert.deepEqual(catalogChunkFiles(bundle, 'home', true),
  { 'en-US': '/assets/i18n.home~lazy.en-US-l1.js', 'zh-CN': '/assets/i18n.home~lazy.zh-CN-l2.js' }, 'the lazy chunks apart');
assert.throws(() => catalogChunkFiles(bundle, 'docs'), /the docs en-US catalog chunk is missing/);
assert.throws(() => catalogChunkFiles(bundle, 'docs', true), /the docs lazy en-US catalog chunk is missing/);
assert.throws(() => catalogChunkFiles({ ...bundle, 'assets/i18n-r1.js': { ...bundle['assets/i18n-r1.js'], code: 'import("./x.js")' } },
  FULL_CATALOG), /no chunk imports assets\/i18nCatalogEnUS-e1\.js by its emitted name/);
assert.deepEqual(bootChunkProblems(bundle), [], 'a sound bundle: the boot chunk holds the boot runtime and no worker loads it');
const polluted = { ...bundle, 'assets/i18n-r1.js': { ...bundle['assets/i18n-r1.js'],
  moduleIds: [...bundle['assets/i18n-r1.js'].moduleIds, '\0vite/preload-helper.js'] } };
assert.match(bootChunkProblems(polluted).join('\n'), /holds \\0vite\/preload-helper\.js, which is not boot runtime/);
const workerReach = { ...bundle, 'assets/wreckBakeWorker-w1.js': { ...bundle['assets/wreckBakeWorker-w1.js'],
  imports: ['assets/main-m1.js'] } };
assert.match(bootChunkProblems(workerReach).join('\n'), /wreckBakeWorker-w1\.js \(a worker or emitted entry\) statically loads/);
for (const id of ['/p/src/ui/i18n.ts', '/p/src/ui/i18nDictionaries.ts', '/p/src/ui/localeRouting.ts', '/p/src/ui/responsiveLayout.ts',
  '/p/src/presentation/staticI18n.ts', '\0vite/modulepreload-polyfill.js']) assert.ok(BOOT_RUNTIME_MODULES.test(id), id);
for (const id of ['/p/src/ui/i18nCatalogEnUS.ts', '/p/src/ui/i18nCatalog.en-US.json', '/p/src/ui/i18nCatalogZhCN.ts',
  '\0vite/preload-helper.js', '/p/src/ui/i18n.selftest.mjs']) assert.ok(!BOOT_RUNTIME_MODULES.test(id), id);

// The dev server serves the same subsets as virtual modules and names them on the page.
const plugin = i18nPageCatalogs();
plugin.configResolved({ root: ROOT, command: 'serve', build: config.build });
assert.equal(plugin.resolveId(pageCatalogModuleUrl('notFound', 'zh-CN')), '\0cot-i18n:notFound.zh-CN');
assert.equal(plugin.resolveId('/src/ui/i18n.ts'), null);
const served = plugin.load('\0cot-i18n:notFound.zh-CN');
assert.deepEqual(JSON.parse(served.replace(/^export default /, '').replace(/;\n$/, '')),
  catalogSubset(zh, real.catalogs.notFound.keys), 'the dev subset is the scan\'s, in the locale\'s strings');
assert.throws(() => plugin.load('\0cot-i18n:nowhere.en-US'), /no page declares the page catalog "nowhere"/);
assert.equal(plugin.load('/src/ui/i18n.ts'), null);
const devHtml = plugin.transformIndexHtml.handler(readFileSync(resolve(ROOT, '404.html'), 'utf8'), {});
assert.match(devHtml, /<meta name="cot-i18n-catalog" content="notFound" data-en-us="\/@cot-i18n\/notFound\.en-US\.js" data-zh-cn="\/@cot-i18n\/notFound\.zh-CN\.js">/);
const homeHtml = plugin.transformIndexHtml.handler(readFileSync(resolve(ROOT, real.catalogs.home.pages[0]), 'utf8'), {});
assert.match(homeHtml, /data-en-us="\/@cot-i18n\/home\.en-US\.js"/);
assert.doesNotMatch(homeHtml, /-lazy=/, 'the dev server names no lazy chunk: its page subset holds the lazy keys');
assert.equal(plugin.resolveId(pageCatalogModuleUrl('home', 'zh-CN', true)), '\0cot-i18n:home~lazy.zh-CN');
const gameHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
assert.equal(plugin.transformIndexHtml.handler(gameHtml, {}), gameHtml, 'the game names no page catalog');

// The build registers the plugin and the boot chunk groups.
assert.ok(config.plugins.flat().some((entry) => entry?.name === 'cot-i18n-page-catalogs'), 'vite.config.ts registers the plugin');
const groups = config.build.rollupOptions.output.codeSplitting.groups;
const helperGroup = groups.find((group) => group.test === VITE_PRELOAD_HELPER);
const bootGroup = groups.find((group) => group.test === BOOT_RUNTIME_MODULES);
assert.ok(helperGroup && bootGroup, 'the preload helper and the boot runtime each have a group');
assert.ok((helperGroup.priority ?? 0) > (bootGroup.priority ?? 0), 'the preload helper is claimed before the boot group');

console.log(`i18n-page-catalogs.selftest: ${Object.entries(real.catalogs).filter(([name]) => name !== FULL_CATALOG)
  .map(([name, { keys, lazyKeys }]) => `${name} ${keys.length}${lazyKeys.length ? ` (+${lazyKeys.length} lazy)` : ''}`).join(', ')} `
  + `of ${fullKeys.length} keys; no raw-key paths`);
