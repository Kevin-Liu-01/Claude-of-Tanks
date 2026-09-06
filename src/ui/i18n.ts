/**
 * i18n.ts — minimal, deterministic localization for Claude of Tanks.
 *
 * Design goals:
 * - One tiny `t(key, vars?)` function plus a string-key dictionary.
 * - Two-locale baseline: `en-US` (fallback) and `zh-CN`.
 * - Locale persists in `localStorage` under `cot.locale`.
 * - First boot reads `navigator.language`, falls back to `en-US`.
 * - Missing translations silently fall back to English (no throws).
 * - Locale changes broadcast a `cot:locale-changed` CustomEvent on `window`.
 * - `formatNumber` / `formatDate` route through `Intl` with the active locale,
 *   so zh-CN no longer shows English commas in the HUD or end overlay.
 *
 * This module is intentionally DOM-free at import time: `getLocale()` only
 * touches `localStorage` and `navigator` when first called, not at module load.
 */

const STORAGE_KEY = 'cot.locale';
const FALLBACK_LOCALE = 'en-US';
const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export interface LocaleChangeDetail {
  readonly locale: SupportedLocale;
  readonly previous: SupportedLocale;
}

let currentLocale: SupportedLocale = FALLBACK_LOCALE;
let initialised = false;

function readStoredLocale(): SupportedLocale | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)) {
      return raw as SupportedLocale;
    }
  } catch (_) {
    /* private mode / disabled storage — silently fall through */
  }
  return null;
}

function readNavigatorLocale(): SupportedLocale | null {
  if (typeof navigator === 'undefined') return null;
  const raw = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en-US';
  return null;
}

function detectLocale(): SupportedLocale {
  return readStoredLocale() ?? readNavigatorLocale() ?? FALLBACK_LOCALE;
}

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;
  currentLocale = detectLocale();
  // CSS variables must mirror the resolved locale on first boot; subsequent
  // setLocale() calls will re-run this through syncLocaleCssVariables().
  syncLocaleCssVariables();
}

function persist(locale: SupportedLocale): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch (_) {
    /* ignore quota / private mode errors */
  }
}

function broadcast(previous: SupportedLocale, locale: SupportedLocale): void {
  if (typeof window === 'undefined' || previous === locale) return;
  const detail: LocaleChangeDetail = { locale, previous };
  try {
    window.dispatchEvent(new CustomEvent<LocaleChangeDetail>('cot:locale-changed', { detail }));
  } catch (_) {
    /* CustomEvent unsupported (very old browsers) — nothing to do */
  }
}

/** Resolve the active locale, initialising from storage/navigator on first call. */
export function getLocale(): SupportedLocale {
  ensureInitialised();
  return currentLocale;
}

/** Switch the active locale and broadcast `cot:locale-changed` on `window`. */
export function setLocale(locale: SupportedLocale): void {
  ensureInitialised();
  const previous = currentLocale;
  currentLocale = locale;
  persist(locale);
  syncLocaleCssVariables();
  broadcast(previous, locale);
}

/**
 * Mirror locale-dependent CSS variables onto `document.documentElement` so
 * CSS `content: var(--cot-garage-variant-label, ...)` pseudo-elements follow
 * the active locale. Kept here so the sync runs once per setLocale() rather
 * than requiring every consumer to subscribe.
 */
function syncLocaleCssVariables(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  try {
    root.style.setProperty('--cot-garage-variant-label', t('garage.tools.stagingAreas'));
  } catch (_) {
    /* DOM may be temporarily unavailable; the next setLocale() will retry. */
  }
}

/** Subscribe to locale changes. Returns an unsubscribe function. */
export function onLocaleChange(handler: (detail: LocaleChangeDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event): void => {
    const custom = event as CustomEvent<LocaleChangeDetail>;
    handler(custom.detail);
  };
  window.addEventListener('cot:locale-changed', listener);
  return () => window.removeEventListener('cot:locale-changed', listener);
}

export function getSupportedLocales(): readonly SupportedLocale[] {
  return SUPPORTED_LOCALES;
}

function formatTemplate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key];
      return value === undefined || value === null ? match : String(value);
    }
    return match;
  });
}

/**
 * Translate a key. Falls back to the key itself when no English entry exists
 * (this keeps developer-facing strings legible during incremental rollout) and
 * to the English value when a key is missing in the active locale.
 *
 * @param key  dictionary key, e.g. `garage.battle`
 * @param vars optional placeholder substitutions (`{name}` → value)
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  ensureInitialised();
  // Lazy require keeps the import graph free of cycles with the catalog.
  const dict = loadDictionary();
  const bundle = dict[currentLocale] ?? dict[FALLBACK_LOCALE];
  const fallback = dict[FALLBACK_LOCALE];
  const raw = bundle[key] ?? fallback?.[key] ?? key;
  return formatTemplate(raw, vars);
}

/** Format a number using the active locale (replaces `toLocaleString('en-US')`). */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  ensureInitialised();
  if (typeof Intl === 'undefined') return String(value);
  try {
    return new Intl.NumberFormat(currentLocale, options).format(value);
  } catch (_) {
    return String(value);
  }
}

/** Format a date using the active locale. */
export function formatDate(
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  ensureInitialised();
  if (typeof Intl === 'undefined') {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString();
  }
  try {
    return new Intl.DateTimeFormat(currentLocale, options).format(value);
  } catch (_) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString();
  }
}

// Dictionary cache; populated lazily so test harnesses can stub loadDictionary.
type Dictionary = Readonly<Record<string, string>>;
let cached: Readonly<Record<SupportedLocale, Dictionary>> | null = null;

function loadDictionary(): Readonly<Record<SupportedLocale, Dictionary>> {
  if (cached) return cached;
  // Dynamic require keeps the catalog out of the synchronous import graph of
  // every UI module that only needs `t()` for a handful of strings.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = loadCatalog();
  cached = mod.CATALOG;
  return cached!;
}

/**
 * Indirection so the catalog module can be swapped in tests. Default behaviour
 * imports `./i18nCatalog.ts`. The catalog owns the full English/Chinese tables.
 */
export function loadCatalog(): { readonly CATALOG: Readonly<Record<SupportedLocale, Dictionary>> } {
  // Synchronous dynamic import is unavailable in TS without `await`; instead
  // we lean on a cached module reference the catalog registers on first load.
  if (catalogRef) return catalogRef;
  throw new Error('i18nCatalog has not been loaded; import it once at module graph top.');
}

let catalogRef: { readonly CATALOG: Readonly<Record<SupportedLocale, Dictionary>> } | null = null;

export function __setCatalogForTests(
  ref: { readonly CATALOG: Readonly<Record<SupportedLocale, Dictionary>> } | null,
): void {
  catalogRef = ref;
  cached = ref ? ref.CATALOG : null;
  if (cached && !cached[currentLocale]) currentLocale = FALLBACK_LOCALE;
}

/** Register the production catalog. Called once by `./i18nCatalog.ts` at module
 *  load time. The function name is reused by the test hook for symmetry. */
export function registerCatalog(
  ref: { readonly CATALOG: Readonly<Record<SupportedLocale, Dictionary>> },
): void {
  catalogRef = ref;
  cached = ref.CATALOG;
  if (!cached[currentLocale]) currentLocale = FALLBACK_LOCALE;
}

/** Reset module state for test isolation. */
export function __resetForTests(): void {
  currentLocale = FALLBACK_LOCALE;
  initialised = false;
  cached = null;
  catalogRef = null;
}
