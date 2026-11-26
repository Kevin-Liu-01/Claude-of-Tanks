// changed-only catalog-keys.selftest (279): a string-catalog edit the generators never draw moves no step's key.
//
// 267 took the string catalogs out of the GPU steps' keys (steps.mjs `catalogKeys`: the icons page draws two part-owner
// labels, and tools/page-catalog-keys.mjs fails a run on any other key it asks for), but it listed the two catalogs it
// had. The five locales 274 added (de, es, ja, pt-BR, ru) reached centering and icons through src/ui/i18nDictionaries.ts
// and were keyed whole, so docs-refresh-279's Field Manual strings marked both steps on every id with byte-identical
// outputs. Every src/ui/i18nCatalog.<locale>.json is now a catalog by its name (steps.mjs isCatalogFile).
// Proof on the real fleet, the rows read once:
//   - the catalogs by name are exactly the locale table's (src/ui/localePrefix.ts SUPPORTED_LOCALES), and the steps that
//     reach any of them declare their keys;
//   - an edit of every undeclared string in all seven catalogs, plus a new key in each, leaves every step's tool key and
//     every id's and map's key unchanged;
//   - control (the fix reverted: 274's two listed catalogs, KEYS_274): the same edit marks centering and icons on every id;
//   - control: a declared key's value in one added locale marks centering and icons on every id.
// Builds nothing. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeState, KEYS_274, readRows } from './fingerprint.mjs';
import { createGraph } from './graph.mjs';
import { isCatalogFile, STEPS, WORLD_STEPS } from './steps.mjs';
import { ICONS_PAGE_CATALOG_KEYS, catalogKeyDeclared } from '../page-catalog-keys.mjs';
import { SUPPORTED_LOCALES } from '../../src/ui/localePrefix.ts';

const root = resolve(import.meta.dirname, '../..');

// the catalogs by name are the locale table's
const named = readdirSync(resolve(root, 'src/ui')).map((name) => `src/ui/${name}`).filter(isCatalogFile).sort();
assert.deepEqual(named, SUPPORTED_LOCALES.map((locale) => `src/ui/i18nCatalog.${locale}.json`).sort(),
  'every locale\'s catalog, and nothing else in src/ui, is a string catalog by its name');
assert.ok(!isCatalogFile('src/ui/i18nCatalog.en-US.metadata.json') && !isCatalogFile('src/ui/i18nCatalog.ts')
  && !isCatalogFile('src/docs/searchIndex.de.json'), 'control: the metadata, the loader and the docs index are no catalogs');

const rows = readRows(root, process.env);
const stateOf = (config, overlay = {}) => computeState({ root, rows, config, graph: createGraph({ root, overlay }) });
const base = { now: stateOf(undefined), then: stateOf(KEYS_274) };
const ALL = base.now.ids.length;
const TANK_STEPS = STEPS.map((step) => step.name), WORLD = WORLD_STEPS.map((step) => step.name);
const PAGE = ['centering', 'icons'];

// every step that reaches a catalog declares the keys its tool draws; the icons page's two steps reach all seven
for (const [name, entry] of Object.entries(base.now.steps)) {
  if (entry.toolFiles.some(isCatalogFile)) assert.ok(entry.step.catalogKeys?.length, `${name}: reaches a catalog, so declares its keys`);
}
for (const name of PAGE) assert.deepEqual(base.now.steps[name].toolFiles.filter(isCatalogFile), named, `${name}: reaches every locale's catalog`);
for (const [name, entry] of Object.entries(base.now.world.steps)) assert.ok(!entry.toolFiles.some(isCatalogFile), `world ${name}: reaches no catalog`);

function dueAfter(overlay, formula = 'now') {
  const before = base[formula], after = stateOf(formula === 'now' ? undefined : KEYS_274, overlay);
  const out = { tools: {} };
  for (const name of TANK_STEPS) {
    out[name] = before.ids.filter((id) => before.inKey(name, id) !== after.inKey(name, id)).length;
    out.tools[name] = before.steps[name].tool === after.steps[name].tool;
  }
  for (const name of WORLD) out[name] = before.world.ids.filter((map) => before.world.inKey(name, map) !== after.world.inKey(name, map)).length;
  return out;
}
const counts = (due, names) => Object.fromEntries(names.map((name) => [name, due[name]]));
const every = (names, n) => Object.fromEntries(names.map((name) => [name, n]));
const NONE = every([...TANK_STEPS, ...WORLD], 0);

// a catalog-only edit: every string no generator draws, in every catalog, plus a new key in each (a docs chapter's)
const catalogs = Object.fromEntries(named.map((file) => [file, JSON.parse(readFileSync(resolve(root, file), 'utf8'))]));
const declared = (key) => catalogKeyDeclared(key, ICONS_PAGE_CATALOG_KEYS);
let edited = 0;
const docsEdit = Object.fromEntries(Object.entries(catalogs).map(([file, catalog]) => {
  const next = Object.fromEntries(Object.entries(catalog).map(([key, value]) => {
    if (declared(key) || typeof value !== 'string') return [key, value];
    edited++;
    return [key, `${value} ·`];
  }));
  next['docs.manual.cot279.sample'] = 'A Field Manual string no generator draws';
  return [file, `${JSON.stringify(next, null, 2)}\n`];
}));
assert.ok(edited > 1000, `the edit reaches the catalogs' strings (${edited})`);

const now = dueAfter(docsEdit);
assert.deepEqual(counts(now, [...TANK_STEPS, ...WORLD]), NONE, 'a catalog-only edit marks no step on any id or map');
assert.deepEqual(now.tools, every(TANK_STEPS, true), 'and moves no step\'s tool key');

// control: the fix reverted (274's two listed catalogs): the same edit marks the icons page's steps on every id
const then = dueAfter(docsEdit, 'then');
assert.deepEqual(counts(then, [...TANK_STEPS, ...WORLD]), { ...NONE, ...every(PAGE, ALL) },
  'control: under 274\'s listed catalogs the same edit marks centering and icons on every id (docs-refresh-279\'s cost)');

// control: a string the page draws, in a locale 274 added, still marks them
const de = 'src/ui/i18nCatalog.de.json', drawn = ICONS_PAGE_CATALOG_KEYS[0];
assert.ok(typeof catalogs[de][drawn] === 'string', `${de} holds ${drawn}`);
const drawnEdit = dueAfter({ [de]: `${JSON.stringify({ ...catalogs[de], [drawn]: `${catalogs[de][drawn]}!` }, null, 2)}\n` });
assert.deepEqual(counts(drawnEdit, [...TANK_STEPS, ...WORLD]), { ...NONE, ...every(PAGE, ALL) },
  `control: ${drawn} in the de catalog marks centering and icons on every id`);

console.log(`changed-only catalog-keys.selftest: PASS (${named.length} catalogs by name, the locale table's; ${edited} undeclared strings `
  + `and a new key edited: no step or tool key moves on ${ALL} ids and ${base.now.world.ids.length} maps; under 274's listed catalogs `
  + `${PAGE.join(' and ')} on ${ALL} ids; a drawn string in de: ${PAGE.join(' and ')} on ${ALL} ids)`);
