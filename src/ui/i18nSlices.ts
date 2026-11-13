/**
 * i18nSlices.ts — a demand-loaded catalog slice, merged into the resident dictionaries.
 *
 * The game's catalog chunks leave out the strings that only a lazily loaded surface shows: the Scene Studio's
 * (studioStrings.ts) and the Garage Filter panel's (fleetStrings.ts). The build serves each locale's slice as its own
 * module (tools/viteI18nStudioCatalog.ts), and the surface opens once each resident locale's slice (English, and the
 * active locale) is merged into its dictionary. A locale switch reloads the document, which loads that locale's slice
 * with the surface; until then a locale switched in place shows the slice's strings in English. Outside Vite (Node tests
 * and tools) the full catalogs are resident and nothing loads.
 */
import { localeDictionary, registerLocaleDictionary, type CatalogLocale } from './i18nDictionaries.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

type Slice = Readonly<Record<string, string>>;
type SliceLoader = (locale: CatalogLocale) => Promise<{ default: Slice }>;
type SliceModules = Readonly<Record<CatalogLocale, () => Promise<{ default: Slice }>>>;

const LOCALES: readonly CatalogLocale[] = ['en-US', 'zh-CN'];

/** Merge each resident locale's slice into its dictionary; nothing merges unless every slice loaded. */
export async function extendResidentDictionaries(load: SliceLoader): Promise<void> {
  const locales = LOCALES.filter((locale) => localeDictionary(locale));
  const slices = await Promise.all(locales.map(load));
  locales.forEach((locale, index) => registerLocaleDictionary(locale, { ...localeDictionary(locale), ...slices[index]!.default }));
}

/** Make a slice resident once (concurrent callers share the request); a failed chunk fetch stays retryable: (2026-11-02
 *  audit R6, round 2 U35) one app/lazyChunk.ts chunk per slice, asked again under the one policy (at once after one failure,
 *  then past its backoff; a removed chunk shows the reload action), not at once by every call. */
export function residentSlice(modules: SliceModules): () => Promise<void> {
  const slice = createLazyChunk(() => extendResidentDictionaries((locale) => modules[locale]()));
  return () => {
    if (!import.meta.env) return Promise.resolve();
    return slice.load();
  };
}
