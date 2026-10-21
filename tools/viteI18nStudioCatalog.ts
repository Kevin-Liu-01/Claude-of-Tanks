// The Scene Studio's strings load with its chunk (2026-10-05). The media Studio's film, picture, light and cinematic
// controls added 125 strings per locale that the game's boot catalogs must not carry. They stay in the one translated
// catalog per locale (gt.config.json), and this plugin splits it where the browser loads it:
//  - the game's catalog modules (src/ui/i18nCatalog.<locale>.json, loaded through i18nCatalogEnUS.ts and
//    i18nCatalogZhCN.ts) are served without the keys src/ui/i18nStudioKeys.ts matches;
//  - `virtual:cot-i18n-studio/<locale>` is each locale's Studio slice, which src/ui/studioStrings.ts imports beside the
//    Studio's chunk (main.ts) and merges into the resident dictionaries.
// The build and the dev server split alike. Node code (the Vite config, the middleware, tools and selftests) imports
// the JSON directly and keeps the full catalogs; public pages load their own page catalogs, which hold no Studio key.
// 2026-10-15 (the perf lane): in the build the game's catalog modules also leave out every key the game's document and
// its workers cannot show (`gameKeys`, the page catalog scan's `game` key set, tools/viteI18nPageCatalogs.ts): the page
// and the worker builds serve the same subset, so both still emit the same catalog files. The dev server (gameKeys null)
// serves them whole.
// 230 (i18n-fleet-slice): the Garage Filter panel's strings are a second slice. The roster's class and role filters
// added 46 strings per locale that only the panel shows (src/ui/i18nFleetKeys.ts); `virtual:cot-i18n-fleet/<locale>`
// is each locale's fleet slice, which src/ui/fleetStrings.ts loads beside the panel (garage.ts), and the game's catalog
// modules leave those keys out too.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { CatalogLocale } from '../src/ui/i18nDictionaries.ts';
import { isFleetCatalogKey } from '../src/ui/i18nFleetKeys.ts';
import { isStudioCatalogKey } from '../src/ui/i18nStudioKeys.ts';

type Dictionary = Readonly<Record<string, string>>;
/** The demand-loaded slices, each served as `virtual:cot-i18n-<slice>/<locale>`, and the keys each holds. */
const SLICES = Object.freeze({ studio: isStudioCatalogKey, fleet: isFleetCatalogKey });
type CatalogSlice = keyof typeof SLICES;
const SPECIFIER = /^virtual:cot-i18n-(studio|fleet)\/(.*)$/;
// the id's file name names the emitted chunk (assets/i18n.<slice>.<locale>-<hash>.js; without the .js the locale
// would read as an extension and both chunks as i18n.<slice>)
const VIRTUAL_ID = /^\0cot-i18n-(studio|fleet)\/i18n\.\1\.(en-US|zh-CN)\.js$/;
const CATALOG_FILE = /[\\/]src[\\/]ui[\\/]i18nCatalog\.(en-US|zh-CN)\.json$/;

/** One locale's catalog split into the game's keys and the demand-loaded slices (the Studio's, the Filter panel's). */
export function splitStudioCatalog(dictionary: Dictionary): Record<'game' | CatalogSlice, Record<string, string>> {
  const split: Record<'game' | CatalogSlice, Record<string, string>> = { game: {}, studio: {}, fleet: {} };
  for (const [key, value] of Object.entries(dictionary)) {
    const slice = (Object.keys(SLICES) as CatalogSlice[]).find((name) => SLICES[name](key));
    split[slice ?? 'game'][key] = value;
  }
  return split;
}

/** A catalog restricted to a key set, in the catalog's own order. */
function restrictCatalog(dictionary: Readonly<Record<string, string>>, keys: Iterable<string>): Record<string, string> {
  const keep = new Set(keys);
  return Object.fromEntries(Object.entries(dictionary).filter(([key]) => keep.has(key)));
}

interface StudioCatalogOptions {
  /** The keys the game's document and workers can show (the build's page catalog scan); null or absent keeps every key. */
  readonly gameKeys?: () => readonly string[] | null;
}

export function i18nStudioCatalog(options: StudioCatalogOptions = {}): Plugin {
  let root = process.cwd();
  const catalogFile = (locale: CatalogLocale): string => resolve(root, `src/ui/i18nCatalog.${locale}.json`);
  const split = (locale: CatalogLocale) => splitStudioCatalog(JSON.parse(readFileSync(catalogFile(locale), 'utf8')) as Dictionary);
  return {
    name: 'cot-i18n-studio-catalog',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      const specifier = SPECIFIER.exec(id);
      if (!specifier) return null;
      const [, slice, locale] = specifier;
      if (locale !== 'en-US' && locale !== 'zh-CN') this.error(`cot-i18n-studio-catalog: no ${slice} catalog for the locale "${locale}"`);
      return `\0cot-i18n-${slice}/i18n.${slice}.${locale}.js`;
    },
    load(id) {
      const slice = VIRTUAL_ID.exec(id);
      if (slice) {
        const locale = slice[2] as CatalogLocale;
        this.addWatchFile(catalogFile(locale));
        return `export default ${JSON.stringify(split(locale)[slice[1] as CatalogSlice])};\n`;
      }
      const catalog = CATALOG_FILE.exec(id.split('?', 1)[0]!);
      if (!catalog) return null;
      const { game } = split(catalog[1] as CatalogLocale);
      const shown = options.gameKeys?.() ?? null;
      return JSON.stringify(shown ? restrictCatalog(game, shown) : game);
    },
  };
}
