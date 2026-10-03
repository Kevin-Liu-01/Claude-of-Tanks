// i18nLazyCatalog.selftest.mjs — every document loads its own catalogs on demand: English documents never load the
// zh-CN catalog and Chinese ones preload it (FE-P3); no page's static graph holds a catalog, so a public page loads only
// its generated page catalog (tools/i18n-page-catalogs.selftest.mjs) and the game the full catalogs.
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

console.log('i18nLazyCatalog.selftest: no page graph holds a catalog; zh-CN loads on demand, English pages never fetch it, '
  + '/cn/ preloads it');
