// The string-catalog keys the icons page (tools/icons-page.html) asks for in the chain's two GPU steps (2026-11-01, item
// 267).
//
// The page reaches the i18n catalogs through src/gallery/overlays.ts, which names each part's owner (hull or turret). The
// changed-only keys used to hold both whole catalogs (src/ui/i18nCatalog.en-US.json and .zh-CN.json), so any string
// edit, a HUD plural among them, re-ran centering and icons on every id. The steps key the values of these keys alone
// (steps.mjs `catalogKeys`). Measured 2026-11-01 with this guard and an empty list: genIcons on 6 ids across the fleet
// asked for the two part-owner labels (overlays.ts createInspectionOverlay) and nothing else; centering --update asked
// for none; the page never calls inspectionLegend, the legend's other keys. The page records each key it asks for
// (src/ui/i18nDictionaries.ts catalogText, globalThis.__COT_CATALOG_READS, created by the page before its modules), and
// both tools fail the run on a key outside this list: a new string the page draws fails loudly instead of slipping past
// the keys. A pattern ending in `*` names every key with that prefix.
export const ICONS_PAGE_CATALOG_KEYS = Object.freeze(['gallery.legend.owner.hull', 'gallery.legend.owner.turret']);

/** Whether `key` is one of `patterns` (exact, or a `prefix*`). */
export const catalogKeyDeclared = (key, patterns) => patterns.some((pattern) =>
  (pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern));

/**
 * The keys a page asked the catalogs for, read after its work: page errors naming any key outside `patterns`, or the
 * missing recorder (a page that never created it would key nothing it draws).
 */
export async function undeclaredCatalogReads(page, patterns) {
  const reads = await page.evaluate(() => (globalThis.__COT_CATALOG_READS ? [...globalThis.__COT_CATALOG_READS] : null));
  if (!reads) return ['the page has no catalog read recorder (globalThis.__COT_CATALOG_READS): its strings would be keyed by nothing'];
  return reads.filter((key) => !catalogKeyDeclared(key, patterns)).sort()
    .map((key) => `catalog key ${key}: not an input of this page's changed-only key (tools/page-catalog-keys.mjs)`);
}
