/**
 * i18nFleetKeys.ts — which catalog keys belong to the Garage Filter panel's own lazily loaded slice (230).
 *
 * The roster's class and role filters added 47 `fleet.*` strings per locale, 46 of them shown only by the Filter panel
 * and the fleet facet tables, which load on the first press of the Filter toggle (garage.ts, garageFacetPanel.ts). The
 * game's boot catalogs never carry those: the build serves the game's catalog modules without these keys and each locale's
 * fleet slice as its own module, which the toggle loads beside the panel (tools/viteI18nStudioCatalog.ts,
 * src/ui/fleetStrings.ts). Every key matched here is shown only by the panel's modules
 * (src/ui/i18nLazyCatalog.selftest.mjs); the toggle's own label stays in the boot catalog.
 */
// the toggle's label, which the Garage shows before the panel loads
const FLEET_BOOT_KEYS = new Set(['fleet.filter.toggleAria']);

/** True for a key of the Filter panel's demand-loaded slice. */
export function isFleetCatalogKey(key: string): boolean {
  return key.startsWith('fleet.') && !FLEET_BOOT_KEYS.has(key);
}
