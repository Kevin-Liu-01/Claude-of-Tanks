/**
 * Public product totals shared by runtime UI, HTML templates, documentation
 * checks, and release tooling.
 *
 * Keep this module dependency-free: Vite imports it while loading the build
 * configuration, and boot-critical presentation code may import it without
 * pulling the vehicle or battlefield registries into the initial graph.
 * `productStats.selftest.mjs` verifies every value against those registries.
 */
export interface ProductStats {
  productionVehicles: number;
  developmentVehicles: number;
  savedVehicleRecords: number;
  developmentOnlyVehicles: number;
  referenceVehicleRecords: number;
  battlePlayableVehicles: number;
  comparisonCandidates: number;
  battlefields: number;
}

export const PRODUCT_STATS: Readonly<ProductStats> = Object.freeze({
  productionVehicles: 118,
  developmentVehicles: 155,
  savedVehicleRecords: 157,
  developmentOnlyVehicles: 37,
  referenceVehicleRecords: 2,
  battlePlayableVehicles: 128,
  comparisonCandidates: 7,
  battlefields: 20,
});

export const PRODUCT_STAT_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  '{{COT_PRODUCTION_VEHICLES}}': PRODUCT_STATS.productionVehicles,
  '{{COT_DEVELOPMENT_VEHICLES}}': PRODUCT_STATS.developmentVehicles,
  '{{COT_SAVED_VEHICLE_RECORDS}}': PRODUCT_STATS.savedVehicleRecords,
  '{{COT_DEVELOPMENT_ONLY_VEHICLES}}': PRODUCT_STATS.developmentOnlyVehicles,
  '{{COT_REFERENCE_VEHICLE_RECORDS}}': PRODUCT_STATS.referenceVehicleRecords,
  '{{COT_BATTLE_PLAYABLE_VEHICLES}}': PRODUCT_STATS.battlePlayableVehicles,
  '{{COT_COMPARISON_CANDIDATES}}': PRODUCT_STATS.comparisonCandidates,
  '{{COT_BATTLEFIELDS}}': PRODUCT_STATS.battlefields,
});

/** Resolve product-stat tokens in an HTML or text template. */
export function renderProductStats(source: string): string {
  let rendered = String(source);
  for (const [token, value] of Object.entries(PRODUCT_STAT_TOKENS)) {
    rendered = rendered.replaceAll(token, String(value));
  }
  return rendered;
}
