/**
 * i18nTechTreeKeys.ts — which catalog keys belong to the tech-tree screen's own lazily loaded slice (252).
 *
 * The tree's names, stats, units and zoom controls are shown only by the screen (src/ui/techTree.ts), which the Garage
 * loads on demand. The game's boot catalogs never carry them: the build serves the game's catalog modules without these
 * keys and each locale's tech-tree slice as its own module, which the Garage loads beside the screen
 * (tools/viteI18nStudioCatalog.ts, src/ui/techTreeStrings.ts). The game bar's label stays in the boot catalog.
 */
// the game bar's and the phone menu's label, which the Garage shows before the screen loads
const TECH_TREE_BOOT_KEYS = new Set(['techTree.open']);

/** True for a key of the tech-tree screen's demand-loaded slice. */
export function isTechTreeCatalogKey(key: string): boolean {
  return key.startsWith('techTree.') && !TECH_TREE_BOOT_KEYS.has(key);
}
