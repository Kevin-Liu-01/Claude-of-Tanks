export const PAGE_CATALOG_META: string;
export const FULL_CATALOG: string;

export interface PageCatalog {
  readonly pages: readonly string[];
  readonly modules: readonly string[];
  readonly keys: readonly string[];
}

export interface PageCatalogScan {
  readonly catalogs: Readonly<Record<string, PageCatalog>>;
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
