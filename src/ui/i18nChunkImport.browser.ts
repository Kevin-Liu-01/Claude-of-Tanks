/**
 * i18nChunkImport.browser.ts — the catalog chunk import of a Vite document (built or served).
 *
 * The page catalog plugin resolves the registry's `./i18nChunkImport.ts` to this module (tools/viteI18nPageCatalogs.ts),
 * so the document imports the chunk URL its catalog meta names, exactly as the registry did inline before 2026-10-16.
 * Nothing imports this module by name: no Node graph reaches it (src/ui/i18nChunkImport.selftest.mjs), and the build
 * fails when the boot chunk does not hold it (bootChunkProblems).
 */
import type { importCatalogChunk as Contract } from './i18nChunkImport.ts';

export const importCatalogChunk: typeof Contract = (url) => import(/* @vite-ignore */ url);
