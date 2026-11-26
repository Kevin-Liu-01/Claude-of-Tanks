import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_STATS, PRODUCT_STAT_TOKENS, PRODUCT_DESCRIPTION, renderProductStats } from './productStats.ts';
import { MAP_IDS } from './world/maps/index.ts';
import { BATTLE_MODE_IDS } from './sim/matchModes.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Loading the factory registers every extension pack before the projections
// are measured. The shared stats module itself deliberately avoids this cost.
await import('./vehicles/tankFactory.ts');
const {
  ALL_TANK_IDS,
  DEVELOPMENT_TANK_IDS,
  MODEL_SOURCE,
  PRODUCTION_TANK_IDS,
  RETIRED_EXTERNAL_PLACEHOLDER_IDS,
  SAVED_TANK_IDS,
} = await import('./vehicles/specs.ts');

const actual = {
  productionVehicles: PRODUCTION_TANK_IDS.length,
  developmentVehicles: DEVELOPMENT_TANK_IDS.length,
  savedVehicleRecords: SAVED_TANK_IDS.length,
  developmentOnlyVehicles: DEVELOPMENT_TANK_IDS.length - PRODUCTION_TANK_IDS.length,
  referenceVehicleRecords: RETIRED_EXTERNAL_PLACEHOLDER_IDS.size,
  battlePlayableVehicles: ALL_TANK_IDS.length,
  battlefields: MAP_IDS.length,
  battleModes: BATTLE_MODE_IDS.length,
};
assert.equal(
  ALL_TANK_IDS.filter((id) => MODEL_SOURCE[id]?.candidateGlb).length,
  0,
  'runtime fleet registry must not register a candidate model',
);
assert.deepEqual(PRODUCT_STATS, actual,
  'src/productStats.ts must match the canonical vehicle and battlefield registries');

assert.equal(Object.keys(PRODUCT_STAT_TOKENS).length, Object.keys(PRODUCT_STATS).length,
  'every shared stat needs one template token');

const htmlTemplates = [
  'index.html', 'site/home.html', 'site/gallery.html', 'site/docs.html',
];
for (const file of htmlTemplates) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const rendered = renderProductStats(source);
  for (const token of Object.keys(PRODUCT_STAT_TOKENS)) {
    assert.equal(rendered.includes(token), false, `${file} has an unresolved product-stat token`);
  }
}

const currentFacts = [
  'README.md',
  'docs/FEATURES.md',
  'docs/VEHICLE-ROSTER.md',
  'public/llms.txt',
  'public/llms-full.txt',
  'public/docs/llms.txt',
  'public/site.webmanifest',
].map((file) => readFileSync(join(ROOT, file), 'utf8')).join('\n');

const gallery = renderProductStats(readFileSync(join(ROOT, 'site/gallery.html'), 'utf8'));
// the tab title is the page and the game (the coordinator's title ruling); the live fleet count is in its description
assert.ok(gallery.includes('<title>Tank Gallery · Claude of Tanks</title>'), 'the Gallery tab title reads the page, then the game');
assert.ok(gallery.includes(`<meta name="description" content="Inspect all ${PRODUCT_STATS.productionVehicles} production vehicles`),
  'the Gallery description follows the live fleet count');
assert.ok(gallery.includes('property="og:title" content="Tank Gallery · Claude of Tanks"'), 'the Gallery share title matches its tab title');

for (const value of [
  PRODUCT_STATS.productionVehicles,
  PRODUCT_STATS.developmentVehicles,
  PRODUCT_STATS.savedVehicleRecords,
  PRODUCT_STATS.battlePlayableVehicles,
  PRODUCT_STATS.battlefields,
]) {
  assert.match(currentFacts, new RegExp(`\\b${value}\\b`), `current public facts omit ${value}`);
}
// Every product count a public surface states equals its source. The surfaces are the README and every doc it links
// (what a visitor reads), the fact sheets, the site pages, the public text files, the generated manual prerenders and
// search indexes, the UI catalogs in every locale, package.json and the media kit's copy. A stated count is a number
// next to a counted noun in any shipped locale, with at most three of that noun's qualifiers between ("313
// first-party procedural vehicles", "313 辆坦克", "33 Schlachtfelder", "15 battle modes"). Model names never match: a
// letter, digit or hyphen before the number (m113, AC-130) or a hyphen after it (152-mm) rules them out.
const { WATCH_RULES } = await import('./sim/matchRuleset.ts');
const R = String.raw;
const COUNTED = [
  {
    noun: 'vehicle',
    digits: R`\d{3}`,
    sources: { roster: new Set([actual.productionVehicles, actual.developmentVehicles, actual.savedVehicleRecords,
      actual.battlePlayableVehicles]) },
    qualifier: R`(?:first-party|procedural|production(?:-visible)?|playable|battle-playable|saved|keyed|`
      + R`local-development|development|in-engine)`,
    words: R`(?:(?:vehicles?|tanks?|Fahrzeuge|Fahrzeugen|Panzer|Panzern|veh[íi]culos|tanques|blindados|танков|танка|`
      + R`машин)(?!\p{L})|両|輌|辆)`,
  },
  {
    noun: 'battlefield',
    digits: R`\d{2,3}`,
    sources: { maps: new Set([actual.battlefields]) },
    qualifier: R`(?:destructible|authored|playable|generated|procedural|first-party)`,
    words: R`(?:(?:battlefields|maps|worlds|Schlachtfelder|Schlachtfeldern|Karten|campos de batalla|mapas|карт|`
      + R`полей боя|поля боя)(?!\p{L})|戦場|マップ|战场|地图)`,
  },
  {
    // "15 battle modes" names the whole set; a bare "14 modes" may name a sourced subset (Watch runs in every mode
    // but AC-130), so it equals one of the sources
    noun: 'mode',
    digits: R`\d{2,3}`,
    sources: { modes: new Set([actual.battleModes]), watch: new Set([WATCH_RULES.modes.length]) },
    whole: { source: 'modes', phrase: /battle|game|Kampf|Spiel|de (?:batalha|batalla|juego)|боев|игров|バトル|对战|战斗/iu },
    qualifier: R`(?:battle|game)`,
    words: R`(?:(?:modes|Modi|Kampfmodi|Spielmodi|modos(?: de (?:batalha|batalla|juego))?|режимов|режима|`
      + R`боевых режимов)(?!\p{L})|モード|模式)`,
  },
].map((counted) => ({
  ...counted,
  pattern: new RegExp(R`(?<![\p{L}\d.,\-])(${counted.digits})(?![\d\-])\**\s?\**(?:${counted.qualifier}\**\s\**){0,3}`
    + R`(?:[个张种座])?${counted.words}`, 'gu'),
  allowed: new Set(Object.values(counted.sources).flatMap((set) => [...set])),
}));
function statedCounts(text) {
  return COUNTED.flatMap((counted) => [...text.matchAll(counted.pattern)].map((match) => {
    const count = Number(match[1]);
    const whole = counted.whole && counted.whole.phrase.test(match[0].slice(match[1].length));
    const ok = whole ? counted.sources[counted.whole.source].has(count) : counted.allowed.has(count);
    return { noun: counted.noun, count, ok, line: text.slice(0, match.index).split('\n').length, phrase: match[0] };
  }));
}
const statedIn = (text) => statedCounts(text).map(({ noun, count, ok }) => `${noun} ${count}${ok ? '' : ' WRONG'}`);
const V = actual.productionVehicles;
const B = actual.battlefields;
const M = actual.battleModes;
const W = WATCH_RULES.modes.length;
assert.notEqual(M, W, 'the fixtures below need the Watch subset to differ from the whole mode set');
assert.deepEqual(statedIn(`search all 311 vehicles; ${V} first-party procedural vehicles; the same 311 vehicle specs`),
  ['vehicle 311 WRONG', `vehicle ${V}`, 'vehicle 311 WRONG']);
assert.deepEqual(statedIn(`**${V} saved vehicle records**, ${V} 辆坦克, ${V} Panzern, ${V} танков, ${V} 両, ${V} tanques`),
  Array(6).fill(`vehicle ${V}`));
assert.deepEqual(statedIn(`${B} authored battlefields, ${B} Schlachtfelder, ${B} 个战场, ${B + 1} destructible battlefields`),
  [`battlefield ${B}`, `battlefield ${B}`, `battlefield ${B}`, `battlefield ${B + 1} WRONG`]);
assert.deepEqual(statedIn(`${M} battle modes, ${W} battle modes, it works in ${W} modes, ${W} Modi, ${W} 种模式, `
  + `${W - 1} modes, ${W} modos de batalla`),
  [`mode ${M}`, `mode ${W} WRONG`, `mode ${W}`, `mode ${W}`, `mode ${W}`, `mode ${W - 1} WRONG`, `mode ${W} WRONG`]);
assert.deepEqual(statedIn('m113 fire support vehicle, AC-130 vehicles, type 100 main battle tank, a 152-mm tank '
  + 'gun, 1,225 vehicles, 14 tanks a side, 160 s in the vehicle stage, all 4 maps, merges 2 maps, 7 modes x 32 '
  + 'seeds, all 20 battlefield shadow audits'), []);

const DATED_RECORDS = new Map([
  ['docs/DEPLOYS.md', 'the release log: each row records the fleet, maps and modes as that release shipped them'],
]);
const listed = (dir, pattern) => readdirSync(join(ROOT, dir)).filter((name) => pattern.test(name))
  .map((name) => `${dir}/${name}`);
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const readmeDocs = [...new Set([...readme.matchAll(/\]\((docs\/[^)#\s]+\.md)/g)].map((match) => match[1]))];
for (const doc of DATED_RECORDS.keys()) assert.ok(readmeDocs.includes(doc), `${doc} is no longer README-linked`);
const countSurfaces = [...new Set([
  'README.md', 'index.html', '404.html', 'package.json', 'tools/media-r5/kit-copy.json',
  'docs/FEATURES.md', 'docs/VEHICLE-ROSTER.md',
  ...readmeDocs.filter((doc) => !DATED_RECORDS.has(doc)),
  ...listed('site', /\.html$/),
  ...listed('public', /\.(?:txt|webmanifest|xml|json|html)$/),
  ...listed('public/docs', /\.txt$/),
  ...listed('src/docs', /\.json$/),
  ...listed('src/ui', /^i18nCatalog\..+\.json$/),
])];
const statedOn = countSurfaces.map((file) => ({ file, counts: statedCounts(readFileSync(join(ROOT, file), 'utf8')) }));
const wrongCounts = statedOn.flatMap(({ file, counts }) => counts.filter(({ ok }) => !ok)
  .map(({ noun, line, phrase }) => `${file}:${line}: ${noun} "${phrase}"`));
const sourceList = COUNTED.map(({ noun, sources }) => `${noun}s ${Object.entries(sources)
  .map(([name, set]) => `${name} ${[...set].join('/')}`).join(', ')}`).join('; ');
assert.deepEqual(wrongCounts, [], `public surfaces state a product count its source does not have (${sourceList})`);
const tally = Object.fromEntries(COUNTED.map(({ noun }) => [noun,
  statedOn.reduce((sum, { counts }) => sum + counts.filter((entry) => entry.noun === noun).length, 0)]));
console.log(`productStats.selftest: stated counts on ${countSurfaces.length} public surfaces match their sources `
  + `(${Object.entries(tally).map(([noun, n]) => `${n} ${noun}`).join(', ')}; ${sourceList})`);

console.log(
  `productStats.selftest: ${PRODUCT_STATS.productionVehicles} production / `
  + `${PRODUCT_STATS.developmentVehicles} development / ${PRODUCT_STATS.savedVehicleRecords} saved vehicles, `
  + `${PRODUCT_STATS.battlefields} battlefields`,
);

assert.ok(PRODUCT_DESCRIPTION.length <= 350, 'GitHub About character budget');
assert.equal(renderProductStats('{{COT_PRODUCT_DESCRIPTION}}'), PRODUCT_DESCRIPTION);
assert.ok(readFileSync(join(ROOT, 'README.md'), 'utf8').includes(PRODUCT_DESCRIPTION), 'README summary must match shared product facts');
assert.ok(readFileSync(join(ROOT, 'README.md'), 'utf8').includes(`**${PRODUCT_STATS.battleModes} battle modes**`));
