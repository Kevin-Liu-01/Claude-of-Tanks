/**
 * notFoundIndexes.ts — the 404 search's indexes as one lazily imported module (notFound.ts loads it on the field's first
 * focus): the fleet records and the manual's index in the reader's locale.
 *
 * A module wrapper rather than `import('./fleetWall.json', { with: { type: 'json' } })` (the pattern of
 * src/ui/i18nCatalogZhCN.ts): the dev server serves a JSON module as JavaScript, which the browser refuses for an
 * attributed dynamic import, so the search found nothing there; a static, attributed import inside a lazily imported
 * module bundles and runs in both. Copyright © 2026 Kevin B. Liu.
 */
import fleet from './fleetWall.json' with { type: 'json' };
import manualEn from '../docs/searchIndex.en-US.json' with { type: 'json' };
import manualZh from '../docs/searchIndex.zh-CN.json' with { type: 'json' };

export { fleet, manualEn, manualZh };
