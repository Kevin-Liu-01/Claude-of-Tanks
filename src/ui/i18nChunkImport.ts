/**
 * i18nChunkImport.ts — how the locale registry (i18nDictionaries.ts) imports the catalog chunk a document names, outside
 * a Vite document.
 *
 * Only a built or served page names a page catalog chunk (`data-en-us`, `data-zh-cn` and their `-lazy` chunks on its
 * catalog meta), and the plugin that names them (tools/viteI18nPageCatalogs.ts) also resolves this module to
 * i18nChunkImport.browser.ts, which imports the URL. Everywhere else (Node: the servers, tools and every receipt, and
 * any bundle Vite does not build) no document names a chunk, so nothing calls this; a call is a stand-in document
 * naming chunks without the plugin, and it fails loudly rather than load an unbuilt URL.
 *
 * The URL import lives in the browser module alone because a computed import() cannot be followed statically: the
 * self-test runner keys no receipt whose import graph holds one (tools/selftest-cache.mjs), and this registry is in the
 * graph of every receipt that imports the locale runtime (src/ui/i18nChunkImport.selftest.mjs).
 */
type CatalogChunk = { default: Readonly<Record<string, string>> };

export function importCatalogChunk(url: string): Promise<CatalogChunk> {
  return Promise.reject(new Error(`i18nChunkImport: ${url} is a catalog chunk, which only a Vite document imports `
    + '(tools/viteI18nPageCatalogs.ts resolves this module to src/ui/i18nChunkImport.browser.ts)'));
}
