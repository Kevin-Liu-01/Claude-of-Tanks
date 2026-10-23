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
 *   so zh-CN no longer shows English commas in the HUD or end overlay; units go
 *   through `formatNumber(value, { style: 'unit', unit })`.
 * - Messages may use the ICU subset (`{n, plural, one {# kill} other {# kills}}`,
 *   `select`, `{d, date, long}`), formatted through Intl by
 *   i18nDictionaries.ts; tools/i18n-catalog-shape.mjs keeps the catalogs in that
 *   shape. Names that SPEC 11.2 fixes come from src/ui/glossary.json
 *   (tools/glossary-sync.mjs), and tools/i18n-literal-lint.mjs bans English
 *   literals at player-facing sinks (BUI-F8).
 * - A dev-server document with `?pseudo=1` reads the pseudo-locale (English
 *   about 40 % longer and accented, i18nPseudo.ts) for the layout probes;
 *   production builds compile that branch out.
 *
 * This module never writes the DOM or storage at import time: `getLocale()`
 * persists and mirrors the locale when first called. Module evaluation only
 * reads the boot locale (route, storage, navigator) and awaits the document's
 * dictionaries (top-level await below), so `t()` stays synchronous for every
 * module that imports this one: English documents never download the zh-CN
 * catalog, Chinese ones never flash English (FE-P3), and a public page loads
 * only its own page catalog (i18nDictionaries.ts).
 */

import { catalogText, loadLocaleDictionary, localeDictionary, registerLocaleDictionary } from './i18nDictionaries.ts';
import {
  DEFAULT_LOCALE as FALLBACK_LOCALE,
  resolveLocalePath,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './localeRouting.ts';

const STORAGE_KEY = 'cot.locale';
export type { SupportedLocale } from './localeRouting.ts';

interface LocaleChangeDetail {
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
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || (navigator as { userLanguage?: string }).userLanguage || ''];
  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    if (lower.startsWith('zh')) return 'zh-CN';
    if (lower.startsWith('en')) return 'en-US';
  }
  return null;
}

function detectLocale(): SupportedLocale {
  if (typeof window !== 'undefined') {
    const routeLocale = resolveLocalePath(window.location?.pathname || '/').locale;
    if (routeLocale) return routeLocale;
  }
  return readStoredLocale() ?? readNavigatorLocale() ?? FALLBACK_LOCALE;
}

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;
  currentLocale = detectLocale();
  // An explicit locale route is also an explicit user preference. Persist it
  // so later navigation from a copied `/cn/...` URL stays Chinese.
  if (typeof window !== 'undefined' && resolveLocalePath(window.location?.pathname || '/').locale) {
    persist(currentLocale);
  }
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

/**
 * Switch the active locale and broadcast `cot:locale-changed` on `window`.
 * Product switches reload the document right after (screens own translated DOM)
 * and the next document awaits its catalog. An in-place switch to a catalog that
 * is not resident yet broadcasts again once it is; the promise settles then.
 */
export function setLocale(locale: SupportedLocale): Promise<void> {
  ensureInitialised();
  const previous = currentLocale;
  currentLocale = locale;
  persist(locale);
  syncLocaleCssVariables();
  broadcast(previous, locale);
  if (localeDictionary(locale)) return Promise.resolve();
  return loadLocaleDictionary(locale).then(() => {
    if (currentLocale !== locale) return;
    syncLocaleCssVariables();
    broadcast(previous, locale);
  }, () => { /* offline or removed chunk: English until the next document retries */ });
}

/** Mirror the locale onto the document (`lang`, `dir`); the next setLocale() retries if the DOM is unavailable. Locale
 *  text in CSS reads an attribute the surface writes (`content: attr(data-heading)`), never a root variable. */
function syncLocaleCssVariables(): void {
  if (typeof document === 'undefined') return;
  try {
    document.documentElement.lang = currentLocale;
    document.documentElement.dir = 'ltr';
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
  return catalogText(currentLocale, key, vars);
}

/** Format a number using the active locale (replaces `toLocaleString('en-US')`). */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  ensureInitialised();
  try {
    return new Intl.NumberFormat(currentLocale, options).format(value);
  } catch (_) {
    return String(value); // no Intl (a ReferenceError) or options this engine rejects
  }
}

/** Format a date using the active locale. */
export function formatDate(
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  ensureInitialised();
  try {
    return new Intl.DateTimeFormat(currentLocale, options).format(value);
  } catch (_) {
    // No Intl (a ReferenceError) or options this engine rejects: ISO keeps the value legible.
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }
}

// In a browser document English and the boot locale's dictionary are resident before
// any module that imports this one evaluates. English is the fallback of every lookup:
// a document whose English chunk fails stops like one whose static chunk failed (the
// game's inline watchdog recovers by reloading). Another locale's failed chunk degrades
// to English, never a stalled boot. Module workers reach this module through shared code
// (the map catalog) and never wait while evaluating: one that awaited here could miss
// messages posted during the gap. Outside Vite (`import.meta.env` is undefined: Node
// servers, tools and receipts) the full English catalog stays resident, as before.
if (typeof window !== 'undefined') {
  await Promise.all([
    loadLocaleDictionary(FALLBACK_LOCALE),
    loadLocaleDictionary(detectLocale()).catch(() => { /* English fallback (an English boot shares one request) */ }),
  ]);
  // The pseudo-locale (BUI-F8): a dev-server document with ?pseudo=1 reads English about 40 % longer and accented
  // (i18nPseudo.ts), for the layout probes. Production builds drop this branch (import.meta.env.DEV is false there).
  if (import.meta.env?.DEV && /[?&]pseudo=1\b/.test(window.location?.search || '')) {
    const { pseudoDictionary } = await import('./i18nPseudo.ts');
    registerLocaleDictionary(FALLBACK_LOCALE, pseudoDictionary(localeDictionary(FALLBACK_LOCALE) ?? {}));
  }
} else if (!import.meta.env) {
  await loadLocaleDictionary(FALLBACK_LOCALE);
}

