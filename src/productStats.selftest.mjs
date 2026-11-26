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
assert.doesNotMatch(currentFacts,
  /20 destructible battlefields|16 (?:generated and destructible maps|authored battlefields)/,
  'current public facts contain retired battlefield totals');

// Every vehicle count a public surface states equals a roster count. The surfaces are the README and every doc it
// links (what a visitor reads), the site pages, the public text files, the generated manual prerenders and search
// indexes, the UI catalogs in every locale, package.json and the media kit's copy. A count is three digits next to a
// vehicle noun in any shipped locale, with at most three roster qualifiers between ("313 first-party procedural
// vehicles", "313 辆坦克", "313 Panzern"). Model names never match: a letter, digit or hyphen before the number
// (m113, AC-130) or a hyphen after it (152-mm) rules them out.
const ROSTER_COUNTS = new Set([actual.productionVehicles, actual.developmentVehicles, actual.savedVehicleRecords,
  actual.battlePlayableVehicles]);
const QUALIFIER = String.raw`(?:first-party|procedural|production(?:-visible)?|playable|battle-playable|saved|keyed|`
  + String.raw`local-development|development|in-engine)`;
const VEHICLE_NOUN = String.raw`(?:(?:vehicles?|tanks?|Fahrzeuge|Fahrzeugen|Panzer|Panzern|veh[íi]culos|tanques|`
  + String.raw`blindados|танков|танка|машин)(?!\p{L})|両|輌|辆)`;
const STATED_COUNT = new RegExp(String.raw`(?<![\p{L}\d.,\-])(\d{3})(?![\d\-])\**\s?\**(?:${QUALIFIER}\**\s\**){0,3}`
  + VEHICLE_NOUN, 'gu');
function statedVehicleCounts(text) {
  return [...text.matchAll(STATED_COUNT)].map((match) => ({
    count: Number(match[1]),
    line: text.slice(0, match.index).split('\n').length,
    phrase: match[0],
  }));
}
const statedIn = (text) => statedVehicleCounts(text).map(({ count }) => count);
assert.deepEqual(statedIn('search all 311 vehicles; 313 first-party procedural vehicles; the same 311 vehicle specs'),
  [311, 313, 311]);
assert.deepEqual(statedIn('**313 saved vehicle records**, 313 辆坦克, 313 Panzern, 313 танков, 313 両, 313 tanques'),
  [313, 313, 313, 313, 313, 313]);
assert.deepEqual(statedIn('m113 fire support vehicle, AC-130 vehicles, type 100 main battle tank, a 152-mm tank '
  + 'gun, 1,225 vehicles, 14 tanks a side, 160 s in the vehicle stage'), []);

const DATED_RECORDS = new Map([
  ['docs/DEPLOYS.md', 'the release log: each row records the fleet as that release shipped it'],
]);
const listed = (dir, pattern) => readdirSync(join(ROOT, dir)).filter((name) => pattern.test(name))
  .map((name) => `${dir}/${name}`);
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const readmeDocs = [...new Set([...readme.matchAll(/\]\((docs\/[^)#\s]+\.md)/g)].map((match) => match[1]))];
for (const doc of DATED_RECORDS.keys()) assert.ok(readmeDocs.includes(doc), `${doc} is no longer README-linked`);
const countSurfaces = [
  'README.md', 'index.html', '404.html', 'package.json', 'tools/media-r5/kit-copy.json',
  ...readmeDocs.filter((doc) => !DATED_RECORDS.has(doc)),
  ...listed('site', /\.html$/),
  ...listed('public', /\.(?:txt|webmanifest|xml|json|html)$/),
  ...listed('public/docs', /\.txt$/),
  ...listed('src/docs', /\.json$/),
  ...listed('src/ui', /^i18nCatalog\..+\.json$/),
];
const wrongCounts = countSurfaces.flatMap((file) => statedVehicleCounts(readFileSync(join(ROOT, file), 'utf8'))
  .filter(({ count }) => !ROSTER_COUNTS.has(count))
  .map(({ line, phrase }) => `${file}:${line}: "${phrase}"`));
assert.deepEqual(wrongCounts, [],
  `public surfaces state a vehicle count the roster (${[...ROSTER_COUNTS].join('/')}) does not have`);
const stated = countSurfaces.reduce((sum, file) => sum
  + statedVehicleCounts(readFileSync(join(ROOT, file), 'utf8')).length, 0);
console.log(`productStats.selftest: ${stated} stated vehicle counts on ${countSurfaces.length} public surfaces match the roster`);

console.log(
  `productStats.selftest: ${PRODUCT_STATS.productionVehicles} production / `
  + `${PRODUCT_STATS.developmentVehicles} development / ${PRODUCT_STATS.savedVehicleRecords} saved vehicles, `
  + `${PRODUCT_STATS.battlefields} battlefields`,
);

assert.ok(PRODUCT_DESCRIPTION.length <= 350, 'GitHub About character budget');
assert.equal(renderProductStats('{{COT_PRODUCT_DESCRIPTION}}'), PRODUCT_DESCRIPTION);
assert.ok(readFileSync(join(ROOT, 'README.md'), 'utf8').includes(PRODUCT_DESCRIPTION), 'README summary must match shared product facts');
assert.ok(readFileSync(join(ROOT, 'README.md'), 'utf8').includes(`**${PRODUCT_STATS.battleModes} battle modes**`));
