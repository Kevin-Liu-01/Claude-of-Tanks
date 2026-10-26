/**
 * techTreeStrings.ts — the tech-tree screen's own catalog strings, which load with its chunk.
 *
 * The game's catalog chunks leave the screen's strings out (src/ui/i18nTechTreeKeys.ts, tools/viteI18nStudioCatalog.ts).
 * garage.ts loads this module beside the screen, and the screen opens once each resident locale's slice is merged into
 * its dictionary (i18nSlices.ts), so it never shows a raw key. Outside Vite (Node tests and tools) the full catalogs are
 * resident and nothing loads.
 */
import { residentSlice } from './i18nSlices.ts';

/** Make the tech-tree screen's strings resident; a failed chunk fetch stays retryable. */
export const ensureTechTreeStrings = residentSlice({
  'en-US': () => import('virtual:cot-i18n-techTree/en-US'),
  'zh-CN': () => import('virtual:cot-i18n-techTree/zh-CN'),
});
