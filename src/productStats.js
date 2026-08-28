/**
 * Public product totals shared by runtime UI, HTML templates, documentation
 * checks, and release tooling.
 *
 * Keep this module dependency-free: Vite imports it while loading the build
 * configuration, and boot-critical presentation code may import it without
 * pulling the vehicle or battlefield registries into the initial graph.
 * `productStats.selftest.mjs` verifies every value against those registries.
 */
export const PRODUCT_STATS = Object.freeze({
  productionVehicles: 117,
  developmentVehicles: 154,
  savedVehicleRecords: 156,
  developmentOnlyVehicles: 37,
  referenceVehicleRecords: 2,
  battlePlayableVehicles: 127,
  comparisonCandidates: 7,
  battlefields: 20,
});

export const PRODUCT_STAT_TOKENS = Object.freeze({
  '{{COT_PRODUCTION_VEHICLES}}': PRODUCT_STATS.productionVehicles,
  '{{COT_DEVELOPMENT_VEHICLES}}': PRODUCT_STATS.developmentVehicles,
  '{{COT_SAVED_VEHICLE_RECORDS}}': PRODUCT_STATS.savedVehicleRecords,
  '{{COT_DEVELOPMENT_ONLY_VEHICLES}}': PRODUCT_STATS.developmentOnlyVehicles,
  '{{COT_REFERENCE_VEHICLE_RECORDS}}': PRODUCT_STATS.referenceVehicleRecords,
  '{{COT_BATTLE_PLAYABLE_VEHICLES}}': PRODUCT_STATS.battlePlayableVehicles,
  '{{COT_COMPARISON_CANDIDATES}}': PRODUCT_STATS.comparisonCandidates,
  '{{COT_BATTLEFIELDS}}': PRODUCT_STATS.battlefields,
});

/**
 * Resolve product-stat tokens in an HTML or text template.
 * @param {string} source
 * @returns {string}
 */
export function renderProductStats(source) {
  let rendered = String(source);
  for (const [token, value] of Object.entries(PRODUCT_STAT_TOKENS)) {
    rendered = rendered.replaceAll(token, String(value));
  }
  return rendered;
}
