/**
 * studioStrings.ts — the Scene Studio's own catalog strings, which load with its chunk.
 *
 * The game's catalog chunks leave the Studio's strings out (src/ui/i18nStudioKeys.ts,
 * tools/viteI18nStudioCatalog.ts). main.ts loads this module beside the Studio's chunk, and the
 * Studio opens once each resident locale's slice (English, and the active locale) is merged into
 * its dictionary. A locale switch reloads the document, whose Studio then loads that locale's
 * slice; until then a locale switched in place shows the Studio's strings in English. Outside
 * Vite (Node tests and tools) the full catalogs are resident and nothing loads.
 */
import { localeDictionary, registerLocaleDictionary, type CatalogLocale } from './i18nDictionaries.ts';

type Slice = Readonly<Record<string, string>>;
type SliceLoader = (locale: CatalogLocale) => Promise<{ default: Slice }>;

const SLICES: Readonly<Record<CatalogLocale, () => Promise<{ default: Slice }>>> = {
  'en-US': () => import('virtual:cot-i18n-studio/en-US'),
  'zh-CN': () => import('virtual:cot-i18n-studio/zh-CN'),
};

/** Merge each resident locale's slice into its dictionary; nothing merges unless every slice loaded. */
export async function extendResidentDictionaries(load: SliceLoader): Promise<void> {
  const locales = (Object.keys(SLICES) as CatalogLocale[]).filter((locale) => localeDictionary(locale));
  const slices = await Promise.all(locales.map(load));
  locales.forEach((locale, index) => registerLocaleDictionary(locale, { ...localeDictionary(locale), ...slices[index]!.default }));
}

let request: Promise<void> | null = null;

/** Make the Studio's strings resident; a failed chunk fetch stays retryable. */
export function ensureStudioStrings(): Promise<void> {
  if (!import.meta.env) return Promise.resolve();
  return request ??= extendResidentDictionaries((locale) => SLICES[locale]()).catch((error: unknown) => {
    request = null;
    throw error;
  });
}
