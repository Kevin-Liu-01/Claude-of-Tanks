import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_STATS, PRODUCT_STAT_TOKENS, renderProductStats } from './productStats.ts';
import { MAP_IDS } from './world/maps/index.ts';

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
} = await import('./vehicles/specs.js');

const actual = {
  productionVehicles: PRODUCTION_TANK_IDS.length,
  developmentVehicles: DEVELOPMENT_TANK_IDS.length,
  savedVehicleRecords: SAVED_TANK_IDS.length,
  developmentOnlyVehicles: DEVELOPMENT_TANK_IDS.length - PRODUCTION_TANK_IDS.length,
  referenceVehicleRecords: RETIRED_EXTERNAL_PLACEHOLDER_IDS.size,
  battlePlayableVehicles: ALL_TANK_IDS.length,
  battlefields: MAP_IDS.length,
};
assert.equal(
  ALL_TANK_IDS.filter((id) => MODEL_SOURCE[id]?.candidateGlb).length,
  0,
  'runtime fleet registry must not contain offline comparison GLBs',
);
assert.deepEqual(PRODUCT_STATS, actual,
  'src/productStats.ts must match the canonical vehicle and battlefield registries');

assert.equal(Object.keys(PRODUCT_STAT_TOKENS).length, Object.keys(PRODUCT_STATS).length,
  'every shared stat needs one template token');

const htmlTemplates = [
  'index.html', 'home.html', 'gallery.html', 'docs.html',
  'docs-vehicles.html', 'docs-worlds.html',
];
for (const file of htmlTemplates) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const rendered = renderProductStats(source);
  assert.doesNotMatch(rendered, /\{\{COT_[A-Z_]+\}\}/, `${file} has an unresolved product-stat token`);
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
  /111 production-visible|148 keyed local-development|150 (?:saved|records)|121 first-party procedural|16 (?:generated and destructible maps|authored battlefields)/,
  'current public facts contain retired fleet or battlefield totals');

console.log(
  `productStats.selftest: ${PRODUCT_STATS.productionVehicles} production / `
  + `${PRODUCT_STATS.developmentVehicles} development / ${PRODUCT_STATS.savedVehicleRecords} saved vehicles, `
  + `${PRODUCT_STATS.battlefields} battlefields`,
);
