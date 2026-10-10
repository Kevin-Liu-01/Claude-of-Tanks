// The Scene Studio's strings load with its chunk (2026-10-05). The media Studio's film, picture, light and cinematic
// controls added 125 strings per locale that the game's boot catalogs must not carry. They stay in the one translated
// catalog per locale (gt.config.json), and this plugin splits it where the browser loads it:
//  - the game's catalog modules (src/ui/i18nCatalog.<locale>.json, loaded through i18nCatalogEnUS.ts and
//    i18nCatalogZhCN.ts) are served without the keys src/ui/i18nStudioKeys.ts matches;
//  - `virtual:cot-i18n-studio/<locale>` is each locale's Studio slice, which src/ui/studioStrings.ts imports beside the
//    Studio's chunk (main.ts) and merges into the resident dictionaries.
// The build and the dev server split alike. Node code (the Vite config, the middleware, tools and selftests) imports
// the JSON directly and keeps the full catalogs; public pages load their own page catalogs, which hold no Studio key.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { CatalogLocale } from '../src/ui/i18nDictionaries.ts';
import { isStudioCatalogKey } from '../src/ui/i18nStudioKeys.ts';

type Dictionary = Readonly<Record<string, string>>;
const SPECIFIER_PREFIX = 'virtual:cot-i18n-studio/';
// the id's file name names the emitted chunk (assets/i18n.studio.<locale>-<hash>.js; without the .js the locale
// would read as an extension and both chunks as i18n.studio)
const VIRTUAL_ID = /^\0cot-i18n-studio\/i18n\.studio\.(en-US|zh-CN)\.js$/;
const CATALOG_FILE = /[\\/]src[\\/]ui[\\/]i18nCatalog\.(en-US|zh-CN)\.json$/;

/** One locale's catalog split into the game's keys and the Studio's slice. */
export function splitStudioCatalog(dictionary: Dictionary): { game: Record<string, string>; studio: Record<string, string> } {
  const game: Record<string, string> = {};
  const studio: Record<string, string> = {};
  for (const [key, value] of Object.entries(dictionary)) (isStudioCatalogKey(key) ? studio : game)[key] = value;
  return { game, studio };
}

export function i18nStudioCatalog(): Plugin {
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
      if (!id.startsWith(SPECIFIER_PREFIX)) return null;
      const locale = id.slice(SPECIFIER_PREFIX.length);
      if (locale !== 'en-US' && locale !== 'zh-CN') this.error(`cot-i18n-studio-catalog: no catalog for the locale "${locale}"`);
      return `\0cot-i18n-studio/i18n.studio.${locale}.js`;
    },
    load(id) {
      const slice = VIRTUAL_ID.exec(id);
      if (slice) {
        const locale = slice[1] as CatalogLocale;
        this.addWatchFile(catalogFile(locale));
        return `export default ${JSON.stringify(split(locale).studio)};\n`;
      }
      const catalog = CATALOG_FILE.exec(id.split('?', 1)[0]!);
      return catalog ? JSON.stringify(split(catalog[1] as CatalogLocale).game) : null;
    },
  };
}
