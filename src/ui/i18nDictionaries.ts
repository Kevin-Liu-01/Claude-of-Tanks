/**
 * i18nDictionaries.ts — the locale dictionaries this document has loaded (FE-P3).
 *
 * English ships in the module graph: it is the fallback of every lookup. Chinese is
 * a separate chunk loaded on demand: the i18n runtime awaits it before any module
 * that imports `i18n.ts` evaluates when a browser document boots in zh-CN, and the
 * `/cn/` documents modulepreload it (src/presentation/localizedHtml.ts), so English
 * visitors never download it and Chinese pages never flash English.
 *
 * Server and build code that needs both catalogs synchronously imports
 * `i18nCatalog.ts`, which registers zh-CN here; browser code must not
 * (src/ui/i18nLazyCatalog.selftest.mjs).
 *
 * Module scope stays side-effect free and only the lookups reference English, so a
 * graph that reaches this module through shared code without translating anything
 * (the match-host worker builds maps) tree-shakes the English data away.
 */
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };

export type CatalogLocale = 'en-US' | 'zh-CN';
type LazyLocale = Exclude<CatalogLocale, 'en-US'>;
type Dictionary = Readonly<Record<string, string>>;

const english: Dictionary = enUS;

const LOADERS: Readonly<Record<LazyLocale, () => Promise<{ default: Dictionary }>>> = {
  'zh-CN': () => import('./i18nCatalogZhCN.ts'),
};

const loaded: Partial<Record<LazyLocale, Dictionary>> = {};
const pending: Partial<Record<LazyLocale, Promise<void>>> = {};

/** Make a dictionary resident (the server-side full catalog registers zh-CN on import). */
export function registerLocaleDictionary(locale: LazyLocale, dictionary: Dictionary): void {
  loaded[locale] = dictionary;
}

/** The resident dictionary of a locale, if it has loaded. English always has. */
export function localeDictionary(locale: CatalogLocale): Dictionary | undefined {
  return locale === 'en-US' ? english : loaded[locale];
}

/**
 * Load a locale's dictionary once. Concurrent callers share one request; a failed
 * request (a missing or offline chunk) rejects and leaves the next call free to retry.
 */
export function loadLocaleDictionary(locale: CatalogLocale): Promise<void> {
  if (locale === 'en-US' || loaded[locale]) return Promise.resolve();
  let request = pending[locale];
  if (!request) {
    request = LOADERS[locale]().then((module) => {
      loaded[locale] = module.default;
    }).finally(() => {
      delete pending[locale];
    });
    pending[locale] = request;
  }
  return request;
}

/** Look a key up in a resident dictionary, falling back to English and then to the key itself. */
export function catalogText(
  locale: CatalogLocale,
  key: string,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const source = localeDictionary(locale)?.[key] ?? english[key] ?? key;
  if (!vars) return source;
  return source.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}
