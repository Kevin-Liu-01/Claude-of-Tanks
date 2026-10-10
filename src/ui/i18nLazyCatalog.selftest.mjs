// i18nLazyCatalog.selftest.mjs — every document loads its own catalogs on demand: English documents never load the
// zh-CN catalog and Chinese ones preload it (FE-P3); no page's static graph holds a catalog, so a public page loads only
// its generated page catalog (tools/i18n-page-catalogs.selftest.mjs) and the game the full catalogs, less the Scene
// Studio's strings, which load with its chunk.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importChain, runtimeImportSpecifiers, staticImportClosure } from '../../tools/static-import-closure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// 1. No page's static graph holds a catalog: the runtime awaits the document's dictionaries (the game's full catalogs or
//    a public page's page catalog), and English leaves the shared runtime chunk for the game's own catalog chunk.
const PAGE_ENTRIES = ['src/main.ts', 'src/ui/localeBootstrap.ts', 'src/presentation/notFound.ts',
  'src/presentation/publicNav.ts', 'src/presentation/publicPages.ts', 'src/docs/docs.ts', 'src/docs/topics.ts',
  'src/gallery/gallery.ts'];
const CATALOG_MODULES = ['src/ui/i18nCatalog.en-US.json', 'src/ui/i18nCatalogEnUS.ts', 'src/ui/i18nCatalog.zh-CN.json',
  'src/ui/i18nCatalogZhCN.ts', 'src/ui/i18nCatalog.ts'];
for (const entry of PAGE_ENTRIES) {
  const closure = staticImportClosure(entry, { root: ROOT });
  assert.ok(closure.has('src/ui/i18n.ts'), `${entry} reaches the i18n runtime`);
  for (const forbidden of CATALOG_MODULES) {
    assert.ok(!closure.has(forbidden), `${entry} statically loads ${forbidden}: ${importChain(closure, forbidden)}`);
  }
}

// 2. Browser code reaches the full two-locale catalog through no import, static or dynamic: inside src/ only the
//    server/build-time localizer imports it, and nothing in src/ imports the localizer.
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src/*.ts'],
  { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((file) => file && !file.endsWith('.d.ts'));
const importersOf = (target) => sources.filter((file) => {
  const text = readFileSync(resolve(ROOT, file), 'utf8');
  if (!text.includes(target.split('/').pop())) return false;
  const dynamic = [...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  return [...runtimeImportSpecifiers(text, file), ...dynamic]
    .some((specifier) => resolve(ROOT, dirname(file), specifier) === resolve(ROOT, target));
});
assert.deepEqual(importersOf('src/ui/i18nCatalog.ts'), ['src/presentation/localizedHtml.ts'],
  'only the server/build-time localizer imports the full catalog');
assert.deepEqual(importersOf('src/presentation/localizedHtml.ts'), [],
  'the localizer runs in the middleware, the Vite config and the page generator, never in the browser');

// The lazy loaders import modules, never the JSON files: Rolldown leaves an attributed dynamic JSON import
// unrewritten (the browser would request /assets/i18nCatalog.zh-CN.json), and the build plugin refuses it.
const dictionariesSource = readFileSync(resolve(ROOT, 'src/ui/i18nDictionaries.ts'), 'utf8');
assert.match(dictionariesSource, /import\('\.\/i18nCatalogZhCN\.ts'\)/);
assert.match(dictionariesSource, /import\('\.\/i18nCatalogEnUS\.ts'\)/);
assert.doesNotMatch(dictionariesSource, /import\(\s*['"][^'"]+\.json['"]/, 'no dynamic JSON import in browser code');
assert.doesNotMatch(dictionariesSource, /^import\b/m, 'the registry ships no catalog: it has no static import');

// 3. Runtime: an English boot leaves zh-CN unloaded; Chinese text appears only once its dictionary is resident.
const stored = new Map();
const defineGlobal = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, value });
defineGlobal('localStorage', { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) });
// A worker or server reaches the runtime through shared code (the map catalog): evaluating it never starts a Chinese
// download, even with a Chinese navigator. Outside Vite (here, Node) the full English catalog stays resident for
// servers, tools and receipts; a Vite-built module worker (import.meta.env defined, no window) awaits nothing, so it
// cannot miss its first messages.
defineGlobal('navigator', { language: 'zh-CN', languages: ['zh-CN'] });
const dictionaries = await import('./i18nDictionaries.ts');
const worker = await import('./i18n.ts?context=worker');
assert.equal(dictionaries.localeDictionary('zh-CN'), undefined, 'a windowless context leaves the Chinese catalog unloaded');
assert.ok(dictionaries.localeDictionary('en-US'), 'Node keeps the full English catalog resident');
assert.equal(worker.t('garage.battle'), 'BATTLE', 'a windowless Node context translates through English');
const runtimeSource = readFileSync(resolve(ROOT, 'src/ui/i18n.ts'), 'utf8');
const bootAwait = /^if \(typeof window !== 'undefined'\) \{\s*await Promise\.all\(\[\s*loadLocaleDictionary\(FALLBACK_LOCALE\),\s*loadLocaleDictionary\(detectLocale\(\)\)\.catch\([\s\S]*?\]\);\s*\} else if \(!import\.meta\.env\) \{\s*await loadLocaleDictionary\(FALLBACK_LOCALE\);\s*\}\s*$/m;
assert.match(runtimeSource, bootAwait,
  'browser documents await English (a failure propagates) and the boot locale (a failure degrades); only Node awaits otherwise');
assert.equal(runtimeSource.match(/^\s*await /gm)?.length, 2, 'the runtime has no other top-level await');

defineGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
defineGlobal('document', { documentElement: { lang: '', dir: '', style: { setProperty() {} } } });
defineGlobal('window', Object.assign(new EventTarget(), { location: { pathname: '/' } }));
const english = await import('./i18n.ts?boot=en');
assert.equal(english.getLocale(), 'en-US');
assert.equal(dictionaries.localeDictionary('zh-CN'), undefined, 'an English boot never loads the Chinese catalog');
assert.equal(english.t('garage.battle'), 'BATTLE');
assert.equal(dictionaries.catalogText('zh-CN', 'garage.battle'), 'BATTLE', 'an absent dictionary falls back to English');

const first = dictionaries.loadLocaleDictionary('zh-CN');
assert.equal(dictionaries.loadLocaleDictionary('zh-CN'), first, 'concurrent loads share one request');
const events = [];
window.addEventListener('cot:locale-changed', (event) => events.push(event.detail));
const switched = english.setLocale('zh-CN');
assert.equal(english.t('garage.battle'), 'BATTLE', 'until the catalog is resident an in-place switch reads English');
await switched;
assert.equal(english.t('garage.battle'), '出战', 'the switch settles once the catalog is resident');
assert.deepEqual(events, [{ locale: 'zh-CN', previous: 'en-US' }, { locale: 'zh-CN', previous: 'en-US' }],
  'subscribers re-render again when the catalog arrives');
assert.equal(dictionaries.catalogText('zh-CN', 'garage.battle'), '出战');
assert.equal(await dictionaries.loadLocaleDictionary('en-US'), undefined, 'English is always resident');

window.location.pathname = '/cn/';
const chinese = await import('./i18n.ts?boot=cn');
assert.equal(chinese.getLocale(), 'zh-CN', 'a /cn/ route boots Chinese');
assert.equal(chinese.t('garage.battle'), '出战');

// 4. Chinese documents preload the catalog chunk named by the build's meta; English ones never do.
const { LOCALE_CATALOG_META, localizeHtmlDocument } = await import('../presentation/localizedHtml.ts');
const { PUBLIC_ROUTE_RECORDS } = await import('./localeRouting.ts');
const route = PUBLIC_ROUTE_RECORDS.find(({ id }) => id === 'game');
const href = '/assets/i18nCatalog.zh-CN-abc12345.js';
const built = '<!doctype html><html lang="en-US"><head><title>x</title>'
  + '<link rel="canonical" href="https://cot.kevinliu.studio/">'
  + '<script type="module" crossorigin src="/assets/main-aaaa1111.js"></script>'
  + '<link rel="modulepreload" crossorigin href="/assets/three-bbbb2222.js">'
  + `<meta name="${LOCALE_CATALOG_META}" data-locale="zh-CN" content="${href}"></head><body></body></html>`;
const preload = `<link rel="modulepreload" crossorigin href="${href}">`;
const zh = localizeHtmlDocument(built, route, 'zh-CN');
assert.equal(zh.split(preload).length - 1, 1, 'one catalog preload on the Chinese document');
assert.ok(zh.indexOf(preload) > zh.indexOf('src="/assets/main-aaaa1111.js"')
  && zh.indexOf(preload) < zh.indexOf('three-bbbb2222.js'), 'the preload sits beside the module entry');
assert.equal(localizeHtmlDocument(zh, route, 'zh-CN').split(preload).length - 1, 1, 're-localizing is idempotent');
assert.ok(!localizeHtmlDocument(built, route, 'en-US').includes(preload), 'English documents keep the meta inert');
assert.ok(!localizeHtmlDocument(built.replace(/<meta name="cot-locale-catalog"[^>]*>/, ''), route, 'zh-CN')
  .includes('modulepreload" crossorigin href="/assets/i18nCatalog'), 'no meta (the dev server) means no preload');

const viteConfig = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');
assert.match(viteConfig, /^\s*i18nPageCatalogs\(\),$/m, 'the build registers the page catalog plugin');
const pluginSource = readFileSync(resolve(ROOT, 'tools/viteI18nPageCatalogs.ts'), 'utf8');
assert.match(pluginSource, /transformIndexHtml: \{\s*order: 'post',/,
  'the build names each page\'s catalog chunks after bundling');

// 5. The Scene Studio's strings (src/ui/i18nStudioKeys.ts) load with its chunk: the build serves the game's catalogs
//    without them and each locale's slice as a module that main.ts loads beside the Studio's chunk.
const { i18nStudioCatalog, splitStudioCatalog } = await import('../../tools/viteI18nStudioCatalog.ts');
const fullCatalogs = Object.fromEntries(['en-US', 'zh-CN'].map((locale) =>
  [locale, JSON.parse(readFileSync(resolve(ROOT, `src/ui/i18nCatalog.${locale}.json`), 'utf8'))]));
const studioKeys = Object.keys(splitStudioCatalog(fullCatalogs['en-US']).studio).sort();
assert.ok(studioKeys.length > 100, 'the Studio owns its slice of the catalog');
assert.deepEqual(Object.keys(splitStudioCatalog(fullCatalogs['zh-CN']).studio).sort(), studioKeys, 'both locales split alike');
assert.match(viteConfig, /^\s*i18nStudioCatalog\(\),\n\s*i18nPageCatalogs\(\),$/m, 'the build registers the Studio catalog split');
const studioPlugin = i18nStudioCatalog();
studioPlugin.configResolved({ root: ROOT });
const pluginContext = { addWatchFile() {}, error(message) { throw new Error(message); } };
assert.equal(studioPlugin.enforce, 'pre', 'the split serves the catalog files before Vite reads them');
for (const locale of ['en-US', 'zh-CN']) {
  const game = JSON.parse(studioPlugin.load.call(pluginContext, resolve(ROOT, `src/ui/i18nCatalog.${locale}.json`)));
  const sliceId = studioPlugin.resolveId.call(pluginContext, `virtual:cot-i18n-studio/${locale}`);
  const slice = JSON.parse(studioPlugin.load.call(pluginContext, sliceId).replace(/^export default /, '').replace(/;\s*$/, ''));
  assert.ok(studioKeys.every((key) => !(key in game)), `the game's ${locale} catalog leaves the Studio's strings out`);
  assert.deepEqual(Object.keys(slice).sort(), studioKeys, `the ${locale} Studio slice holds them`);
  assert.deepEqual({ ...game, ...slice }, fullCatalogs[locale], `the ${locale} split loses and changes nothing`);
}
assert.equal(studioPlugin.load.call(pluginContext, resolve(ROOT, 'src/ui/i18n.ts')), null, 'other modules load as written');
// Nothing outside the Studio shows its strings (they would read raw), and the game's static graph holds no Studio module.
const STUDIO_MODULE = /^src\/(?:ui|game)\/studio[A-Za-z]*\.ts$/;
const studioFamilies = ['studio.film.', 'studioPanel.picture.', 'studioPanel.light.', 'studioPanel.fxParam.'];
for (const file of sources) {
  if (STUDIO_MODULE.test(file) || file === 'src/ui/i18nStudioKeys.ts') continue;
  const text = readFileSync(resolve(ROOT, file), 'utf8');
  const shown = studioKeys.find((key) => ["'", '"', '`'].some((quote) => text.includes(`${quote}${key}${quote}`)))
    ?? studioFamilies.find((family) => text.includes(`\`${family}\${`));
  assert.equal(shown, undefined, `${file} shows the Studio string ${shown}, which the game's catalogs leave out`);
}
const { BATTLE_TIMES } = await import('../engine/battleWeatherPolicy.ts');
assert.ok(BATTLE_TIMES.every((time) => !studioKeys.includes(`atmosphere.${time}`)),
  'the battle time picker (battleTimeChoices.ts) offers no Studio-only time of day');
const gameClosure = staticImportClosure('src/main.ts', { root: ROOT });
for (const module of ['src/game/studio.ts', 'src/ui/studioPanel.ts', 'src/ui/studioPicturePanel.ts', 'src/ui/studioStrings.ts']) {
  assert.ok(!gameClosure.has(module), `the game statically loads ${module}: ${importChain(gameClosure, module)}`);
}
assert.match(readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8'),
  /loadModule: \(\) => Promise\.all\(\[import\('\.\/game\/studio\.ts'\), import\('\.\/ui\/studioStrings\.ts'\)\.then\(\(strings\) => strings\.ensureStudioStrings\(\)\)\]\)/,
  'the Studio opens once its strings are resident');
// Runtime: the Studio merges each resident locale's slice into its dictionary (here English and, after section 3's
// switch, Chinese); a failed slice merges nothing.
const { extendResidentDictionaries } = await import('./studioStrings.ts');
await assert.rejects(extendResidentDictionaries(() => Promise.reject(new Error('offline'))), /offline/, 'a failed slice rejects');
assert.equal(dictionaries.catalogText('en-US', 'studio.film.probe'), 'studio.film.probe', 'and merges nothing');
const sliceRequests = [];
await extendResidentDictionaries((locale) => {
  sliceRequests.push(locale);
  return Promise.resolve({ default: { 'studio.film.probe': locale === 'zh-CN' ? '影片' : 'Film' } });
});
assert.deepEqual(sliceRequests, ['en-US', 'zh-CN'], 'each resident locale loads its slice');
assert.equal(dictionaries.catalogText('en-US', 'studio.film.probe'), 'Film');
assert.equal(dictionaries.catalogText('zh-CN', 'studio.film.probe'), '影片');
assert.equal(dictionaries.catalogText('zh-CN', 'garage.battle'), '出战', 'the merge keeps the game\'s strings');

console.log('i18nLazyCatalog.selftest: no page graph holds a catalog; zh-CN loads on demand, English pages never fetch it, '
  + `/cn/ preloads it; the Studio's ${studioKeys.length} strings per locale load with its chunk`);
