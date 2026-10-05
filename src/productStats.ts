/**
 * Public product totals shared by runtime UI, HTML templates, documentation
 * checks, and release tooling.
 *
 * Keep this module dependency-free: Vite imports it while loading the build
 * configuration, and boot-critical presentation code may import it without
 * pulling the vehicle or battlefield registries into the initial graph.
 * `productStats.selftest.mjs` verifies every value against those registries.
 */
interface ProductStats {
  productionVehicles: number;
  developmentVehicles: number;
  savedVehicleRecords: number;
  developmentOnlyVehicles: number;
  referenceVehicleRecords: number;
  battlePlayableVehicles: number;
  battlefields: number;
  battleModes: number;
}

export const PRODUCT_STATS: Readonly<ProductStats> = Object.freeze({
  productionVehicles: 220,
  developmentVehicles: 220,
  savedVehicleRecords: 220,
  developmentOnlyVehicles: 0,
  referenceVehicleRecords: 0,
  battlePlayableVehicles: 220,
  battlefields: 33,
  battleModes: 13,
});

export const PRODUCT_STAT_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  '{{COT_PRODUCTION_VEHICLES}}': PRODUCT_STATS.productionVehicles,
  '{{COT_DEVELOPMENT_VEHICLES}}': PRODUCT_STATS.developmentVehicles,
  '{{COT_SAVED_VEHICLE_RECORDS}}': PRODUCT_STATS.savedVehicleRecords,
  '{{COT_DEVELOPMENT_ONLY_VEHICLES}}': PRODUCT_STATS.developmentOnlyVehicles,
  '{{COT_REFERENCE_VEHICLE_RECORDS}}': PRODUCT_STATS.referenceVehicleRecords,
  '{{COT_BATTLE_PLAYABLE_VEHICLES}}': PRODUCT_STATS.battlePlayableVehicles,
  '{{COT_BATTLEFIELDS}}': PRODUCT_STATS.battlefields,
  '{{COT_BATTLE_MODES}}': PRODUCT_STATS.battleModes,
});

/** Canonical public summary; also used for the GitHub repository About text. */
export const PRODUCT_DESCRIPTION = `A World of Tanks-style armored combat simulator built directly with Three.js and Vite: ${PRODUCT_STATS.productionVehicles} vehicles, ${PRODUCT_STATS.battlefields} destructible battlefields, and ${PRODUCT_STATS.battleModes} modes, with plate-level armor, ballistics, modules, spotting, and physics. Play in your browser on desktop or mobile. Built end-to-end by a multi-agent Claude/Codex pipeline.`;

/** Resolve product-stat tokens in an HTML or text template. */
export function renderProductStats(source: string): string {
  let rendered = String(source).replaceAll('{{COT_PRODUCT_DESCRIPTION}}', PRODUCT_DESCRIPTION);
  for (const [token, value] of Object.entries(PRODUCT_STAT_TOKENS)) {
    rendered = rendered.replaceAll(token, String(value));
  }
  return rendered;
}
