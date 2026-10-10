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
 * A page catalog holds the keys of the page's boot graph; the keys only its lazy modules
 * (reached through import()) can show are the page's lazy chunk (`data-en-us-lazy`,
 * `data-zh-cn-lazy`), which the build loads before the module at every such import()
 * (loadLazyCatalog, 2026-10-08): the page boots on the strings it can show at boot.
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

/** The chunk the page catalog meta names under `data-<locale>` (or `-lazy`): a same-origin path, else null. */
function catalogUrl(locale: CatalogLocale, suffix: '' | '-lazy'): string | null {
  try {
    const url = globalThis.document?.querySelector?.('meta[name="cot-i18n-catalog"]')
      ?.getAttribute(`data-${locale.toLowerCase()}${suffix}`);
    return url && /^\/[^/\\]/.test(url) ? url : null;
  } catch (_) {
    return null; // a Node test's stand-in document
  }
}

/** The page catalog chunk this document names for a locale, else null: the full catalog loads. */
export const pageCatalogUrl = (locale: CatalogLocale): string | null => catalogUrl(locale, '');
/** The page's lazy chunk for a locale (the keys only its import() targets can show), else null. */
export const lazyCatalogUrl = (locale: CatalogLocale): string | null => catalogUrl(locale, '-lazy');

const lazyLoads: Partial<Record<CatalogLocale, Promise<void>>> = {};
let lazyWanted = false;

function loadLazyLocale(locale: CatalogLocale): Promise<void> {
  const url = lazyCatalogUrl(locale);
  if (!url || !loaded[locale]) return Promise.resolve();
  return lazyLoads[locale] ??= (import(/* @vite-ignore */ url) as Promise<{ default: Dictionary }>).then((module) => {
    loaded[locale] = { ...loaded[locale], ...module.default };
  }, (error: unknown) => {
    delete lazyLoads[locale]; // a later import() retries
    throw error;
  });
}

/**
 * Make the page's lazy chunk resident for every resident locale (the build calls this before each import() of a module
 * the page reaches only through import(); a document without a lazy chunk — the game's full catalogs — resolves at
 * once). A locale that loads later takes its lazy chunk with it.
 */
export function loadLazyCatalog(): Promise<unknown> {
  lazyWanted = true;
  return Promise.all((Object.keys(loaded) as CatalogLocale[]).map(loadLazyLocale));
}

// The build's import() sites reach the loader through the global (no static import: a module shared with a worker must
// not pull the boot runtime into it). Workers, Node and documents without a lazy chunk find nothing to load.
if (typeof document !== 'undefined') {
  (globalThis as { __cotI18nLazy?: () => Promise<unknown> }).__cotI18nLazy = loadLazyCatalog;
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
      // (a locale switched to in place after a lazy module loaded takes the page's lazy chunk too; English for those
      // keys until a retry when it fails)
      return lazyWanted ? loadLazyLocale(locale).catch(() => {}) : undefined;
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
