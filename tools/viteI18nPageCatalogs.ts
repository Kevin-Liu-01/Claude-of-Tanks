// Page catalogs (2026-10-02): a public page loads only the translation strings it can show.
//
// Every HTML entry names its catalog (`<meta name="cot-i18n-catalog" content="home">`; the game's is `game`, the full
// catalogs) and tools/i18n-page-catalogs.mjs scans each page catalog's module graph for the keys it can reach. This
// plugin turns the scan into chunks and names them in each page:
//  - build: one emitted chunk per page catalog and locale (`assets/i18n.<catalog>.<locale>-<hash>.js`, the subset as
//    its default export). A public page's catalog meta gains the chunks' URLs (`data-en-us`, `data-zh-cn`), which
//    src/ui/i18nDictionaries.ts imports; the game's names none and loads the full catalogs (i18nCatalogEnUS.ts,
//    i18nCatalogZhCN.ts) through the runtime's own imports. Every page preloads its English chunk beside the module
//    entry and names its Chinese chunk in `<meta name="cot-locale-catalog" data-locale="zh-CN">`, which
//    localizeHtmlDocument turns into a modulepreload on /cn/ documents.
//  - serve: the same subsets as virtual modules at /@cot-i18n/<catalog>.<locale>.js, re-scanned after an edit.
// The build fails on a scan issue (a key a page could show raw) and on a catalog chunk it cannot find; the dev server
// warns and serves what it has.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OutputBundle, OutputChunk } from 'rolldown';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import {
  catalogSubset, documentCatalog, FULL_CATALOG, htmlInputs, PAGE_CATALOG_META, scanPageCatalogs, type PageCatalogCache,
  type PageCatalogScan,
} from './i18n-page-catalogs.mjs';
import { LOCALE_CATALOG_META } from '../src/presentation/localizedHtml.ts';
import type { CatalogLocale } from '../src/ui/i18nDictionaries.ts';

const LOCALES: readonly CatalogLocale[] = ['en-US', 'zh-CN'];
const URL_PREFIX = '/@cot-i18n/';
const VIRTUAL_PREFIX = '\0cot-i18n:';
const CATALOG_FILES: Readonly<Record<CatalogLocale, string>> = {
  'en-US': 'src/ui/i18nCatalog.en-US.json',
  'zh-CN': 'src/ui/i18nCatalog.zh-CN.json',
};
type Dictionary = Readonly<Record<string, string>>;

/** The dev URL, and the emitted chunk's module id, of one page catalog's dictionary. */
export function pageCatalogModuleUrl(catalog: string, locale: CatalogLocale): string {
  return `${URL_PREFIX}${catalog}.${locale}.js`;
}

function virtualTarget(id: string): { catalog: string; locale: CatalogLocale } | null {
  if (!id.startsWith(VIRTUAL_PREFIX)) return null;
  const match = /^([a-z][A-Za-z0-9]*)\.(en-US|zh-CN)$/.exec(id.slice(VIRTUAL_PREFIX.length));
  return match ? { catalog: match[1]!, locale: match[2] as CatalogLocale } : null;
}

/** A modulepreload link beside the module entry (else at the end of head), where localizeHtmlDocument puts zh-CN's. */
export function insertModulePreload(html: string, href: string): string {
  const link = `<link rel="modulepreload" crossorigin href="${href}">`;
  if (html.includes(link)) return html;
  const entry = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/i.exec(html);
  if (!entry) return html.replace(/<\/head>/i, `${link}\n</head>`);
  const at = entry.index + entry[0].length;
  return `${html.slice(0, at)}\n${link}${html.slice(at)}`;
}

const zhCatalogMeta = (href: string): HtmlTagDescriptor => ({
  tag: 'meta', attrs: { name: LOCALE_CATALOG_META, 'data-locale': 'zh-CN', content: href }, injectTo: 'head',
});

/** The page's catalog meta with each locale's chunk URL (`data-en-us`, `data-zh-cn`), which the runtime imports. */
export function nameCatalogChunks(html: string, files: Readonly<Record<CatalogLocale, string>>): string {
  let named = false;
  const out = html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (named || !new RegExp(`\\bname\\s*=\\s*["']${PAGE_CATALOG_META}["']`, 'i').test(tag)) return tag;
    named = true;
    const urls = LOCALES.map((locale) => ` data-${locale.toLowerCase()}="${files[locale]}"`).join('');
    return tag.replace(/\s*\/?>$/, (end) => `${urls}${end.trim() === '/>' ? ' />' : '>'}`);
  });
  if (!named) throw new Error(`cot-i18n-page-catalogs: no <meta name="${PAGE_CATALOG_META}"> to name the catalog chunks in`);
  return out;
}

const chunks = (bundle: OutputBundle): OutputChunk[] =>
  Object.values(bundle).filter((output): output is OutputChunk => output.type === 'chunk');

/** The built chunk of each locale for a catalog: the emitted subsets, or the game's full catalog chunks. */
export function catalogChunkFiles(bundle: OutputBundle, catalog: string): Record<CatalogLocale, string> {
  const all = chunks(bundle);
  const files = {} as Record<CatalogLocale, string>;
  for (const locale of LOCALES) {
    const chunk = catalog === FULL_CATALOG
      ? all.find((output) => output.moduleIds.some((id) => id.split('?', 1)[0]!.endsWith(`/${CATALOG_FILES[locale]}`)))
      : all.find((output) => output.facadeModuleId === `${VIRTUAL_PREFIX}${catalog}.${locale}`);
    if (!chunk) throw new Error(`cot-i18n-page-catalogs: the ${catalog} ${locale} catalog chunk is missing from the bundle`);
    if (catalog === FULL_CATALOG) {
      // The runtime must import the full catalog by its emitted name: an unrewritten specifier would request a file
      // that does not exist.
      const name = chunk.fileName.split('/').pop() ?? chunk.fileName;
      const loaders = all.filter((output) => output.dynamicImports.includes(chunk.fileName));
      if (!loaders.length || loaders.some((output) => !output.code.includes(name))) {
        throw new Error(`cot-i18n-page-catalogs: no chunk imports ${chunk.fileName} by its emitted name`);
      }
    }
    files[locale] = `/${chunk.fileName}`;
  }
  return files;
}

export function i18nPageCatalogs(): Plugin {
  let root = process.cwd();
  let pages: string[] = [];
  let build = false;
  let scan: PageCatalogScan | null = null;
  const analyses: PageCatalogCache = new Map();
  const dictionaries = new Map<CatalogLocale, Dictionary>();
  const dictionary = (locale: CatalogLocale): Dictionary => {
    let value = dictionaries.get(locale);
    if (!value) {
      value = JSON.parse(readFileSync(resolve(root, CATALOG_FILES[locale]), 'utf8')) as Dictionary;
      dictionaries.set(locale, value);
    }
    return value;
  };
  const scanned = (): PageCatalogScan => {
    scan ??= scanPageCatalogs({ root, pages, english: dictionary('en-US'), cache: analyses });
    return scan;
  };
  return {
    name: 'cot-i18n-page-catalogs',
    configResolved(config) {
      root = config.root;
      build = config.command === 'build';
      pages = htmlInputs(config, { root });
    },
    buildStart() {
      if (!build) return;
      scan = null;
      dictionaries.clear();
      const { catalogs, issues } = scanned();
      if (issues.length) {
        this.error(`cot-i18n-page-catalogs: ${issues.length} way(s) for a public page to show a raw key `
          + `(node tools/i18n-page-catalogs.mjs --check):\n  - ${issues.join('\n  - ')}`);
      }
      for (const catalog of Object.keys(catalogs)) {
        if (catalog === FULL_CATALOG) continue;
        for (const locale of LOCALES) {
          this.emitFile({
            type: 'chunk', id: pageCatalogModuleUrl(catalog, locale), name: `i18n.${catalog}.${locale}`, preserveSignature: 'strict',
          });
        }
      }
    },
    resolveId(id) {
      return id.startsWith(URL_PREFIX) ? `${VIRTUAL_PREFIX}${id.slice(URL_PREFIX.length).replace(/\.js$/, '')}` : null;
    },
    load(id) {
      const target = virtualTarget(id);
      if (!target) return null;
      const catalog = target.catalog === FULL_CATALOG ? undefined : scanned().catalogs[target.catalog];
      if (!catalog) throw new Error(`cot-i18n-page-catalogs: no page declares the page catalog "${target.catalog}"`);
      return `export default ${JSON.stringify(catalogSubset(dictionary(target.locale), catalog.keys))};\n`;
    },
    configureServer(server) {
      // A source, markup or catalog edit re-scans on the next request (unchanged modules keep their analysis) and
      // drops the served subsets; the next page load imports fresh ones.
      const reset = (file: string): void => {
        if (!/\.(?:[cm]?[jt]s|json|html)$/.test(file)) return;
        scan = null;
        if (Object.values(CATALOG_FILES).some((catalogFile) => file.endsWith(catalogFile))) dictionaries.clear();
        const graph = server.environments.client?.moduleGraph;
        for (const [id, module] of graph?.idToModuleMap ?? []) if (id.startsWith(VIRTUAL_PREFIX)) graph?.invalidateModule(module);
      };
      server.watcher.on('change', reset);
      server.watcher.on('add', reset);
      server.watcher.on('unlink', reset);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const catalog = documentCatalog(html);
        if (!catalog) return html;
        if (!build) {
          if (catalog === FULL_CATALOG) return html;
          const { issues } = scanned();
          if (issues.length) ctx.server?.config.logger.warn(`cot-i18n-page-catalogs: ${issues.join('; ')}`);
          return nameCatalogChunks(html, {
            'en-US': pageCatalogModuleUrl(catalog, 'en-US'), 'zh-CN': pageCatalogModuleUrl(catalog, 'zh-CN'),
          });
        }
        const files = catalogChunkFiles(ctx.bundle ?? {}, catalog);
        const named = catalog === FULL_CATALOG ? html : nameCatalogChunks(html, files);
        return { html: insertModulePreload(named, files['en-US']), tags: [zhCatalogMeta(files['zh-CN'])] };
      },
    },
  };
}
