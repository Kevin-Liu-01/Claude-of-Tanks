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
 *
 * A chunk the meta names loads through `importCatalogChunk`, which only a Vite document resolves to the URL import
 * (i18nChunkImport.browser.ts): this module holds no computed import(), so every receipt that imports the locale
 * runtime stays reusable (src/ui/i18nChunkImport.selftest.mjs).
 */
import { importCatalogChunk } from './i18nChunkImport.ts';

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
  return lazyLoads[locale] ??= importCatalogChunk(url).then((module) => {
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
  return pending[locale] ??= (url ? importCatalogChunk(url) : FULL_CATALOGS[locale]())
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

type Vars = Readonly<Record<string, string | number>>;
const plurals: Record<string, Intl.PluralRules> = {};

/** The index of the brace closing the one at `open`, else -1. */
function closing(source: string, open: number): number {
  for (let depth = 0, at = open; at < source.length; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}' && !--depth) return at;
  }
  return -1;
}

/**
 * The ICU MessageFormat subset the catalogs use (BUI-F8, SPEC 11.3): `{name}`; `{n, plural, =0 {…} one {# kill} other
 * {# kills}}` (`#` is n through Intl.NumberFormat, the category from Intl.PluralRules); `{v, select, a {…} other {…}}`;
 * `{d, date}` / `{d, date, long}` (an ISO date or epoch ms, formatted in UTC so a calendar date never shifts by time
 * zone; an unreadable one stays as written). A placeholder without a value stays as written; text that is not a
 * placeholder passes through. Plain numbers format in code (formatNumber) before they reach a message.
 */
function formatMessage(source: string, vars: Vars, locale: string, hash?: string): string {
  let out = '';
  for (let at = 0; at < source.length;) {
    const end = source[at] === '{' ? closing(source, at) : -1;
    if (end < 0) {
      out += source[at] === '#' && hash != null ? hash : source[at];
      at++;
      continue;
    }
    const raw = source.slice(at, end + 1);
    const [, name, type, rest = ''] = /^\{\s*(\w+)\s*(?:,\s*(\w+)\s*(?:,([\s\S]*))?)?\}$/.exec(raw) ?? [];
    const value = name && Object.hasOwn(vars, name) ? vars[name] : null;
    at = end + 1;
    if (value == null) out += raw;
    else if (!type) out += String(value);
    else if (type === 'date') {
      try {
        out += new Intl.DateTimeFormat(locale, { dateStyle: (rest.trim() || 'medium') as 'medium', timeZone: 'UTC' })
          .format(new Date(Number.isNaN(+value) ? value : +value));
      } catch (_) {
        out += raw;
      }
    } else {
      const options: Record<string, string> = {};
      for (let i = 0, m; (m = /^\s*(=?[\w-]+)\s*\{/.exec(rest.slice(i)));) {
        const open = i + m[0].length - 1, close = closing(rest, open);
        if (close < 0) break;
        options[m[1]] = rest.slice(open + 1, close);
        i = close + 1;
      }
      const n = Number(value);
      const pick = type === 'plural'
        ? options[`=${n}`] ?? options[(plurals[locale] ??= new Intl.PluralRules(locale)).select(n)]
        : options[String(value)];
      out += formatMessage(pick ?? options.other ?? '', vars, locale,
        type === 'plural' ? new Intl.NumberFormat(locale).format(n) : hash);
    }
  }
  return out;
}

/**
 * Look a key up in the resident dictionaries — the locale's, then English, then the key itself —
 * and fill its placeholders (ICU plural/select/number/date included; formatMessage).
 */
export function catalogText(locale: CatalogLocale, key: string, vars?: Vars): string {
  const source = loaded[locale]?.[key] ?? loaded['en-US']?.[key] ?? key;
  return vars && source.includes('{') ? formatMessage(source, vars, locale) : source;
}
