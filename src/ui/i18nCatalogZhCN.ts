/**
 * i18nCatalogZhCN.ts — the zh-CN dictionary as a lazily imported module (i18nDictionaries.ts).
 *
 * A module wrapper rather than `import('./i18nCatalog.zh-CN.json', { with: { type: 'json' } })`:
 * Rolldown emits a chunk for that call but leaves the specifier unrewritten, so the browser would
 * request the raw .json path, while Node refuses a JSON import without the attribute. A static,
 * attributed import inside a lazily imported module bundles and runs correctly in both.
 */
import zhCN from './i18nCatalog.zh-CN.json' with { type: 'json' };

export default zhCN;
