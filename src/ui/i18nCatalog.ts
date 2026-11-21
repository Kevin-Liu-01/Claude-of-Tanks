/**
 * i18nCatalog.ts — every locale catalog, synchronously, for server and build-time code.
 *
 * Each locale lives in a General Translation-compatible JSON file under
 * `src/ui/i18nCatalog.<locale>.json`. The middleware, the Vite config,
 * localizedHtml.ts, tools and selftests import this module. Browser code must
 * not (src/ui/i18nLazyCatalog.selftest.mjs): a document loads its own
 * dictionaries on demand through i18nDictionaries.ts (the game the full
 * catalogs, a public page its page catalog). Importing this module registers
 * every locale with that registry, so shared helpers (siteMetadata.ts) resolve
 * them all on the server.
 */
import enUS from './i18nCatalog.en-US.json' with { type: 'json' };
import zhCN from './i18nCatalog.zh-CN.json' with { type: 'json' };
import es from './i18nCatalog.es.json' with { type: 'json' };
import ja from './i18nCatalog.ja.json' with { type: 'json' };
import de from './i18nCatalog.de.json' with { type: 'json' };
import ptBR from './i18nCatalog.pt-BR.json' with { type: 'json' };
import ru from './i18nCatalog.ru.json' with { type: 'json' };
import { registerLocaleDictionary, type CatalogLocale } from './i18nDictionaries.ts';

/** One formatter for server and browser (i18nDictionaries.ts: placeholders and the ICU subset); every locale is resident. */
export { catalogText } from './i18nDictionaries.ts';

export { enUS, zhCN };

export const CATALOG: Readonly<Record<CatalogLocale, Readonly<Record<string, string>>>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  es,
  ja,
  de,
  'pt-BR': ptBR,
  ru,
} as const;

for (const [locale, dictionary] of Object.entries(CATALOG)) registerLocaleDictionary(locale as CatalogLocale, dictionary);
