/**
 * studioStrings.ts — the Scene Studio's own catalog strings, which load with its chunk.
 *
 * The game's catalog chunks leave the Studio's strings out (src/ui/i18nStudioKeys.ts,
 * tools/viteI18nStudioCatalog.ts). main.ts loads this module beside the Studio's chunk, and the
 * Studio opens once each resident locale's slice (English, and the active locale) is merged into
 * its dictionary (i18nSlices.ts). A locale switch reloads the document, whose Studio then loads that
 * locale's slice; until then a locale switched in place shows the Studio's strings in English. Outside
 * Vite (Node tests and tools) the full catalogs are resident and nothing loads.
 */
import { residentSlice } from './i18nSlices.ts';

/** Make the Studio's strings resident; a failed chunk fetch stays retryable. */
export const ensureStudioStrings = residentSlice({
  'en-US': () => import('virtual:cot-i18n-studio/en-US'),
  'zh-CN': () => import('virtual:cot-i18n-studio/zh-CN'),
});
