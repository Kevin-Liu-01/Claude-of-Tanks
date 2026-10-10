export const PAGE_CATALOG_META: string;
export const FULL_CATALOG: string;

export interface PageCatalog {
  readonly pages: readonly string[];
  readonly modules: readonly string[];
  /** The boot graph's keys (the page chunk): its scripts, their static imports and its markup. */
  readonly keys: readonly string[];
  /** The further keys the page's lazy graphs reach (the lazy chunk, loaded at the first import() of a boundary). */
  readonly lazyKeys: readonly string[];
  /** The lazy boundaries: literal import() targets outside the boot graph, and theirs in turn. */
  readonly lazy: readonly string[];
}

export interface PageCatalogScan {
  readonly catalogs: Readonly<Record<string, PageCatalog>>;
  /** Per module, the import() specifiers of lazy boundaries that can show a lazy key: the build loads the lazy chunk first. */
  readonly lazySites: Readonly<Record<string, readonly string[]>>;
  readonly issues: readonly string[];
}

export function documentCatalog(html: string): string | null;
export function htmlModuleScripts(html: string): string[];
export function markupKeys(text: string): string[];
export function htmlInputs(config: unknown, options?: { root?: string }): string[];
/** Module analyses kept across scans of the same English catalog (opaque to callers). */
export type PageCatalogCache = Map<string, unknown>;

export function scanPageCatalogs(options: {
  root?: string;
  pages: readonly string[];
  english?: Readonly<Record<string, string>>;
  cache?: PageCatalogCache;
}): PageCatalogScan;
export function catalogSubset(
  dictionary: Readonly<Record<string, string>>,
  keys: readonly string[],
): Record<string, string>;
