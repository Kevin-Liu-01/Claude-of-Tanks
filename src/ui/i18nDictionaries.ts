/**
 * i18nDictionaries.ts — the locale dictionaries this document has loaded (FE-P3).
 *
 * No catalog ships in this module. The i18n runtime awaits its document's dictionaries
 * before any module that imports `i18n.ts` evaluates: English, the fallback of every
 * lookup, and the active locale when it is another. Which dictionaries those are is the
 * document's choice:
 *   - the game (`<meta name="cot-i18n-catalog" content="game">`) loads the full catalogs,
 *     `i18nCatalogEnUS.ts` and `i18nCatalogZhCN.ts`, as does any document that names no
 *     page catalog chunk (a source page outside the build, a Node test);
 *   - a public page declares a page catalog (`home`, `docs`, `docsTopic`, `notFound`,
 *     `gallery`) and the build adds the URL of each locale's chunk, which holds only the
 *     keys the page's code and markup can show, to that meta (`data-en-us`, `data-zh-cn`;
 *     tools/viteI18nPageCatalogs.ts, tools/i18n-page-catalogs.mjs).
 * Built pages preload their English chunk beside the module entry and `/cn/` documents
 * their Chinese one (src/presentation/localizedHtml.ts), so the await stays off the
 * critical path; English visitors never download Chinese.
 *
 * Server and build code that needs both full catalogs synchronously imports
 * `i18nCatalog.ts`, which registers them here; browser code must not
 * (src/ui/i18nLazyCatalog.selftest.mjs).
 */
export type CatalogLocale = 'en-US' | 'zh-CN';
type Dictionary = Readonly<Record<string, string>>;

const FULL_CATALOGS: Readonly<Record<CatalogLocale, () => Promise<{ default: Dictionary }>>> = {
  'en-US': () => import('./i18nCatalogEnUS.ts'),
  'zh-CN': () => import('./i18nCatalogZhCN.ts'),
};

const loaded: Partial<Record<CatalogLocale, Dictionary>> = {};
const pending: Partial<Record<CatalogLocale, Promise<void>>> = {};

/** The page catalog chunk this document names for a locale (a same-origin path), else null: the full catalog loads. */
export function pageCatalogUrl(locale: CatalogLocale): string | null {
  try {
    const url = globalThis.document?.querySelector?.('meta[name="cot-i18n-catalog"]')?.getAttribute(`data-${locale.toLowerCase()}`);
    return url && /^\/[^/\\]/.test(url) ? url : null;
  } catch (_) {
    return null; // a Node test's stand-in document
  }
}

/** Make a dictionary resident (the server-side full catalog registers both locales on import). */
export function registerLocaleDictionary(locale: CatalogLocale, dictionary: Dictionary): void {
  loaded[locale] = dictionary;
}

/** The resident dictionary of a locale, if it has loaded. */
export function localeDictionary(locale: CatalogLocale): Dictionary | undefined {
  return loaded[locale];
}

/**
 * Load a locale's dictionary once. Concurrent callers share one request; a failed request
 * (a missing or offline chunk) rejects and leaves the next call free to retry.
 */
export function loadLocaleDictionary(locale: CatalogLocale): Promise<void> {
  if (loaded[locale]) return Promise.resolve();
  const url = pageCatalogUrl(locale);
  return pending[locale] ??= (url ? import(/* @vite-ignore */ url) as Promise<{ default: Dictionary }> : FULL_CATALOGS[locale]())
    .then((module) => {
      loaded[locale] = module.default;
    })
    .finally(() => {
      delete pending[locale];
    });
}

/**
 * Look a key up in the resident dictionaries — the locale's, then English, then the key itself —
 * and fill its `{name}` placeholders. A placeholder without a value (or with null) stays as written.
 */
export function catalogText(
  locale: CatalogLocale,
  key: string,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const source = loaded[locale]?.[key] ?? loaded['en-US']?.[key] ?? key;
  return vars
    ? source.replace(/\{(\w+)\}/g, (match, name: string) => (Object.hasOwn(vars, name) ? String(vars[name] ?? match) : match))
    : source;
}
