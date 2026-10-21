/**
 * fleetStrings.ts — the Garage Filter panel's own catalog strings, which load with the panel.
 *
 * The game's catalog chunks leave the panel's class, role, status and filter strings out (src/ui/i18nFleetKeys.ts,
 * tools/viteI18nStudioCatalog.ts). garage.ts loads this module beside the panel on the first press of the Filter
 * toggle, and the panel mounts once each resident locale's slice is merged into its dictionary (i18nSlices.ts), so it
 * never shows a raw key. Outside Vite (Node tests and tools) the full catalogs are resident and nothing loads.
 */
import { residentSlice } from './i18nSlices.ts';

/** Make the Filter panel's strings resident; a failed chunk fetch stays retryable. */
export const ensureFleetStrings = residentSlice({
  'en-US': () => import('virtual:cot-i18n-fleet/en-US'),
  'zh-CN': () => import('virtual:cot-i18n-fleet/zh-CN'),
});
