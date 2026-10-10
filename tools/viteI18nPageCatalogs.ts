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
//  - lazy (2026-10-08, the perf lane): a page's keys that only modules it reaches through import() can show are its
//    lazy chunk (`assets/i18n.<catalog>~lazy.<locale>-<hash>.js`, named in the meta as `data-en-us-lazy`,
//    `data-zh-cn-lazy`, the English one prefetched). Every literal import() of a module whose graph can show one of
//    those keys is rewritten to load the lazy chunk first (src/ui/i18nDictionaries.ts loadLazyCatalog, reached through
//    `globalThis.__cotI18nLazy` so a module shared with a worker imports nothing more); a document without a lazy chunk
//    (the game's full catalogs) passes straight through.
//  - serve: each page catalog's boot and lazy keys together (one subset, as before the split: the dev server rewrites
//    no import(), so no module request waits on a scan) as virtual modules at /@cot-i18n/<catalog>.<locale>.js,
//    re-scanned after an edit.
// The build fails on a scan issue (a key a page could show raw) and on a catalog chunk it cannot find; the dev server
// warns and serves what it has.
//
// The boot runtime every document runs (the locale runtime and routing, static-markup localization, responsive layout,
// Vite's modulepreload polyfill) is one chunk (vite.config.ts `codeSplitting`): the game's English catalog left the
// shared runtime chunk, and one boot chunk keeps the game at its request count. Vite's preload helper keeps its own
// chunk because the shared workers load it and the polyfill needs a document; the build fails when the boot chunk holds
// another module or a worker entry reaches it.
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import type { OutputBundle, OutputChunk } from 'rolldown';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import {
  catalogSubset, documentCatalog, FULL_CATALOG, htmlInputs, PAGE_CATALOG_META, scanPageCatalogs, type PageCatalogCache,
  type PageCatalogScan,
} from './i18n-page-catalogs.mjs';
import { LOCALE_CATALOG_META } from '../src/presentation/localizedHtml.ts';
import type { CatalogLocale } from '../src/ui/i18nDictionaries.ts';

/** The modules every document runs at boot, bundled as one chunk. */
export const BOOT_RUNTIME_MODULES = /(?:[\\/]src[\\/]ui[\\/](?:i18n|i18nDictionaries|localeRouting|responsiveLayout)\.ts|[\\/]src[\\/]presentation[\\/]staticI18n\.ts|^\0vite\/modulepreload-polyfill\.js)$/;
/** Vite's dynamic-import preload helper, which keeps a chunk of its own. */
export const VITE_PRELOAD_HELPER = /^\0vite\/preload-helper\.js$/;
const LOCALES: readonly CatalogLocale[] = ['en-US', 'zh-CN'];
const URL_PREFIX = '/@cot-i18n/';
const VIRTUAL_PREFIX = '\0cot-i18n:';
const CATALOG_FILES: Readonly<Record<CatalogLocale, string>> = {
  'en-US': 'src/ui/i18nCatalog.en-US.json',
  'zh-CN': 'src/ui/i18nCatalog.zh-CN.json',
};
type Dictionary = Readonly<Record<string, string>>;

/** The dev URL, and the emitted chunk's module id, of one page catalog's dictionary (its boot or its lazy chunk). */
export function pageCatalogModuleUrl(catalog: string, locale: CatalogLocale, lazy = false): string {
  return `${URL_PREFIX}${catalog}${lazy ? '~lazy' : ''}.${locale}.js`;
}

function virtualTarget(id: string): { catalog: string; locale: CatalogLocale; lazy: boolean } | null {
  if (!id.startsWith(VIRTUAL_PREFIX)) return null;
  const match = /^([a-z][A-Za-z0-9]*)(~lazy)?\.(en-US|zh-CN)$/.exec(id.slice(VIRTUAL_PREFIX.length));
  return match ? { catalog: match[1]!, locale: match[3] as CatalogLocale, lazy: !!match[2] } : null;
}

/** The call that loads a page's lazy chunk before an import() of a lazily reached module (none outside a document). */
const LAZY_LOAD = '((globalThis.__cotI18nLazy?.() ?? Promise.resolve()).catch(() => {}))';

type ImportNode = {
  type?: string; start?: number; end?: number;
  source?: { type?: string; value?: unknown; expressions?: unknown[]; quasis?: Array<{ value: { cooked?: string } }> };
};
const IMPORT_CALL_RE = /\bimport\s*\(/;

/**
 * Every literal import() in `code` whose specifier is in `specifiers` rewritten to load the page's lazy chunk first:
 * `import('./x.ts')` -> `LAZY.then(() => import('./x.ts'))`. Returns null when nothing changed.
 */
export function rewriteLazyImports(code: string, file: string, specifiers: ReadonlySet<string>): string | null {
  if (!specifiers.size || !IMPORT_CALL_RE.test(code)) return null;
  const program = parseAst(code, { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const sites: Array<{ start: number; end: number }> = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const { type, source, start, end } = node as ImportNode;
    if (type === 'ImportExpression' && source) {
      const literal = source.type === 'Literal' && typeof source.value === 'string' ? source.value
        : source.type === 'TemplateLiteral' && !source.expressions?.length ? source.quasis?.[0]?.value.cooked : null;
      if (literal && specifiers.has(literal)) sites.push({ start: start!, end: end! });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) walk(child);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(program);
  if (!sites.length) return null;
  let out = code;
  for (const { start, end } of sites.sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, start)}${LAZY_LOAD}.then(() => ${out.slice(start, end)})${out.slice(end)}`;
  }
  return out;
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

/**
 * The page's catalog meta with each locale's chunk URL (`data-en-us`, `data-zh-cn`), which the runtime imports, and its
 * lazy chunks' (`data-en-us-lazy`, `data-zh-cn-lazy`) when the page has one.
 */
export function nameCatalogChunks(
  html: string,
  files: Readonly<Record<CatalogLocale, string>>,
  lazyFiles: Readonly<Record<CatalogLocale, string>> | null = null,
): string {
  let named = false;
  const out = html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (named || !new RegExp(`\\bname\\s*=\\s*["']${PAGE_CATALOG_META}["']`, 'i').test(tag)) return tag;
    named = true;
    const urls = LOCALES.map((locale) => ` data-${locale.toLowerCase()}="${files[locale]}"`).join('')
      + LOCALES.map((locale) => (lazyFiles ? ` data-${locale.toLowerCase()}-lazy="${lazyFiles[locale]}"` : '')).join('');
    return tag.replace(/\s*\/?>$/, (end) => `${urls}${end.trim() === '/>' ? ' />' : '>'}`);
  });
  if (!named) throw new Error(`cot-i18n-page-catalogs: no <meta name="${PAGE_CATALOG_META}"> to name the catalog chunks in`);
  return out;
}

const chunks = (bundle: OutputBundle): OutputChunk[] =>
  Object.values(bundle).filter((output): output is OutputChunk => output.type === 'chunk');

/** Each locale's built chunk of a catalog: the emitted subsets (or the lazy ones), or the game's full catalogs. */
export function catalogChunkFiles(bundle: OutputBundle, catalog: string, lazy = false): Record<CatalogLocale, string> {
  const all = chunks(bundle);
  const files = {} as Record<CatalogLocale, string>;
  for (const locale of LOCALES) {
    const chunk = catalog === FULL_CATALOG
      ? all.find((output) => output.moduleIds.some((id) => id.split('?', 1)[0]!.endsWith(`/${CATALOG_FILES[locale]}`)))
      : all.find((output) => output.facadeModuleId === `${VIRTUAL_PREFIX}${catalog}${lazy ? '~lazy' : ''}.${locale}`);
    if (!chunk) {
      throw new Error(`cot-i18n-page-catalogs: the ${catalog}${lazy ? ' lazy' : ''} ${locale} catalog chunk is missing from the bundle`);
    }
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

/**
 * Problems with the boot chunk of a bundle: a module outside the boot runtime inside it, or a non-HTML entry (a shared
 * worker) that statically reaches it. Empty when the bundle is sound.
 */
export function bootChunkProblems(bundle: OutputBundle): string[] {
  const all = chunks(bundle);
  const boot = all.find((output) => output.moduleIds.some((id) => /[\\/]src[\\/]ui[\\/]i18n\.ts$/.test(id)));
  if (!boot) return ['the locale runtime (src/ui/i18n.ts) is in no chunk'];
  const problems = boot.moduleIds.filter((id) => !BOOT_RUNTIME_MODULES.test(id))
    .map((id) => `${boot.fileName} holds ${id.replace(/\0/g, '\\0')}, which is not boot runtime`);
  const byName = new Map(all.map((output) => [output.fileName, output]));
  for (const entry of all) {
    if (!entry.isEntry || !entry.facadeModuleId || entry.facadeModuleId.endsWith('.html')) continue;
    const seen = new Set<string>();
    const queue = [...entry.imports];
    while (queue.length) {
      const file = queue.shift()!;
      if (seen.has(file)) continue;
      seen.add(file);
      queue.push(...(byName.get(file)?.imports ?? []));
    }
    if (seen.has(boot.fileName)) problems.push(`${entry.fileName} (a worker or emitted entry) statically loads the boot chunk ${boot.fileName}`);
  }
  return problems;
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
      for (const [catalog, { lazyKeys }] of Object.entries(catalogs)) {
        if (catalog === FULL_CATALOG) continue;
        for (const locale of LOCALES) {
          this.emitFile({
            type: 'chunk', id: pageCatalogModuleUrl(catalog, locale), name: `i18n.${catalog}.${locale}`, preserveSignature: 'strict',
          });
          if (!lazyKeys.length) continue;
          this.emitFile({
            type: 'chunk', id: pageCatalogModuleUrl(catalog, locale, true), name: `i18n.${catalog}~lazy.${locale}`,
            preserveSignature: 'strict',
          });
        }
      }
    },
    transform: {
      // (the build's: an import() of a lazily reached module loads the page's lazy chunk first; buildStart scanned)
      filter: { id: { include: /\.[cm]?[jt]s(?:\?|$)/, exclude: /[\\/]node_modules[\\/]/ }, code: IMPORT_CALL_RE },
      handler(code, id) {
        if (!build || id.startsWith('\0')) return null;
        const module = relative(root, id.split('?', 1)[0]!).split(sep).join('/');
        const specifiers = scanned().lazySites[module];
        if (!specifiers?.length) return null;
        const out = rewriteLazyImports(code, module, new Set(specifiers));
        return out === null ? null : { code: out, map: null };
      },
    },
    resolveId(id) {
      return id.startsWith(URL_PREFIX) ? `${VIRTUAL_PREFIX}${id.slice(URL_PREFIX.length).replace(/\.js$/, '')}` : null;
    },
    load(id) {
      const target = virtualTarget(id);
      if (!target) return null;
      const catalog = target.catalog === FULL_CATALOG ? undefined : scanned().catalogs[target.catalog];
      if (!catalog) throw new Error(`cot-i18n-page-catalogs: no page declares the page catalog "${target.catalog}"`);
      // (the dev server's page subset holds the lazy keys too: it names no lazy chunk and rewrites no import())
      const keys = target.lazy ? catalog.lazyKeys : build ? catalog.keys : [...catalog.keys, ...catalog.lazyKeys];
      return `export default ${JSON.stringify(catalogSubset(dictionary(target.locale), keys))};\n`;
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
    generateBundle(_options, bundle) {
      if (!build) return;
      const problems = bootChunkProblems(bundle);
      if (problems.length) this.error(`cot-i18n-page-catalogs: the boot chunk is unsound:\n  - ${problems.join('\n  - ')}`);
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
        const lazy = catalog !== FULL_CATALOG && !!scanned().catalogs[catalog]?.lazyKeys.length;
        const files = catalogChunkFiles(ctx.bundle ?? {}, catalog);
        const lazyFiles = lazy ? catalogChunkFiles(ctx.bundle ?? {}, catalog, true) : null;
        const named = catalog === FULL_CATALOG ? html : nameCatalogChunks(html, files, lazyFiles);
        // (the English lazy chunk is prefetched: at idle, so the first lazily reached module seldom waits on it)
        const prefetch: HtmlTagDescriptor[] = lazyFiles
          ? [{ tag: 'link', attrs: { rel: 'prefetch', href: lazyFiles['en-US'], as: 'script', crossorigin: '' }, injectTo: 'head' }] : [];
        return { html: insertModulePreload(named, files['en-US']), tags: [zhCatalogMeta(files['zh-CN']), ...prefetch] };
      },
    },
  };
}
