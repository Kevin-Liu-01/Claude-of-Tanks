/**
 * tutorialStrings.ts — the first-game tutorial's own catalog strings, which load with its chunk (272).
 *
 * The game's catalog chunks leave the tutorial's strings out (src/ui/i18nTutorialKeys.ts, tools/viteI18nStudioCatalog.ts).
 * app/tutorialAccess.ts loads this module beside the overlay, and a chapter starts once each resident locale's slice is
 * merged into its dictionary (i18nSlices.ts), so the card never shows a raw key. Outside Vite (Node tests and tools) the
 * full catalogs are resident and nothing loads.
 */
import { residentSlice } from './i18nSlices.ts';

/** Make the tutorial's strings resident; a failed chunk fetch stays retryable. */
export const ensureTutorialStrings = residentSlice({
  'en-US': () => import('virtual:cot-i18n-tutorial/en-US'),
  'zh-CN': () => import('virtual:cot-i18n-tutorial/zh-CN'),
});
