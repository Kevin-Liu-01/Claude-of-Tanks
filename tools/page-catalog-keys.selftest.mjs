// The string-catalog keys the icons page draws (2026-11-01, item 267; tools/page-catalog-keys.mjs).
// Pins: (1) catalogText records each key it is asked for when a tool page has created the recorder, and nothing when
// none has; (2) the guard names every key outside the list (exact or `prefix*`) and a page without the recorder;
// (3) the icons page creates the recorder before its modules, genIcons and presentation-centering --update fail the
// run on the guard's findings, and both steps key exactly ICONS_PAGE_CATALOG_KEYS; (4) the world bakes' map catalog
// imports no i18n (the localized map name lives in src/ui/mapNames.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICONS_PAGE_CATALOG_KEYS, catalogKeyDeclared, undeclaredCatalogReads } from './page-catalog-keys.mjs';
import { STEPS } from './changed-only/steps.mjs';

// (1) the recorder
const { catalogText } = await import('../src/ui/i18nDictionaries.ts');
catalogText('en-US', 'probe.before');
globalThis.__COT_CATALOG_READS = new Set();
catalogText('en-US', 'gallery.legend.owner.hull');
catalogText('zh-CN', 'hud.blast', { n: 2 });
assert.deepEqual([...globalThis.__COT_CATALOG_READS].sort(), ['gallery.legend.owner.hull', 'hud.blast'],
  'every key asked for is recorded, in any locale, and nothing before the recorder existed');
delete globalThis.__COT_CATALOG_READS;

// (2) the guard
assert.ok(catalogKeyDeclared('gallery.legend.owner.hull', ['gallery.legend.owner.hull']));
assert.ok(catalogKeyDeclared('gallery.legend.armor.0', ['gallery.legend.*']) && !catalogKeyDeclared('gallery.legends', ['gallery.legend.*']));
assert.ok(!catalogKeyDeclared('gallery.legend.owner.hullx', ['gallery.legend.owner.hull']), 'an exact key is exact');
const fakePage = (reads) => ({ evaluate: async (fn) => { globalThis.__COT_CATALOG_READS = reads; try { return fn(); } finally { delete globalThis.__COT_CATALOG_READS; } } });
assert.deepEqual(await undeclaredCatalogReads(fakePage(new Set(['gallery.legend.owner.turret'])), ICONS_PAGE_CATALOG_KEYS), [],
  'a declared key passes');
assert.deepEqual(await undeclaredCatalogReads(fakePage(new Set(['shotInfo.missileBlast', 'gallery.legend.owner.hull'])), ICONS_PAGE_CATALOG_KEYS),
  ['catalog key shotInfo.missileBlast: not an input of this page\'s changed-only key (tools/page-catalog-keys.mjs)'], 'an undeclared key is named');
assert.match((await undeclaredCatalogReads(fakePage(undefined), ICONS_PAGE_CATALOG_KEYS))[0], /no catalog read recorder/,
  'a page without the recorder fails: its strings would be keyed by nothing');

// (3) wiring
const page = readFileSync('tools/icons-page.html', 'utf8');
const recorder = page.indexOf('globalThis.__COT_CATALOG_READS = new Set();'), module = page.indexOf('<script type="module">');
assert.ok(recorder > 0 && recorder < module, 'the icons page creates the recorder before its modules run');
for (const [tool, guard] of [['genIcons', /pageErrors\.push\(\.\.\.await undeclaredCatalogReads\(page, ICONS_PAGE_CATALOG_KEYS\)\)/],
  ['presentation-centering', /if \(update\) pageErrors\.push\(\.\.\.await undeclaredCatalogReads\(page, ICONS_PAGE_CATALOG_KEYS\)\)/]]) {
  assert.match(readFileSync(`tools/${tool}.mjs`, 'utf8'), guard, `${tool}: a key outside the list is a page error (the run fails)`);
}
for (const name of ['centering', 'icons']) {
  assert.equal(STEPS.find((step) => step.name === name).catalogKeys, ICONS_PAGE_CATALOG_KEYS, `${name}: keys exactly the page's catalog keys`);
}

// (4) the world bakes' map catalog names no string
assert.doesNotMatch(readFileSync('src/world/maps/catalog.ts', 'utf8'), /i18n/, 'the map catalog imports no i18n');
assert.match(readFileSync('src/ui/mapNames.ts', 'utf8'), /export function getLocalizedMapName/);

console.log(`page-catalog-keys.selftest: PASS (the icons page keys ${ICONS_PAGE_CATALOG_KEYS.join(', ')})`);
