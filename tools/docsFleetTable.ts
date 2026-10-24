// The fleet rows the Field Manual's chapters print, read from the asset manifest (public/icons/tank-assets.json, a
// tool-only file the build drops: tools/tool-only-public-files.mjs). Copyright © 2026 Kevin B. Liu.
// The manifest is 48 MB, so it is read once per process; src/docs/chapters/fleet.ts takes the rows from here and the
// prerender (tools/docs-prerender.mjs) is the only thing that runs it. Node only.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface DocsFleetRow {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly nation: string;
  readonly tier: number;
  readonly tierNumeral: string;
  readonly shells: ReadonlyArray<{ readonly name: string; readonly type: string; readonly pen100Mm: number; readonly pen1000Mm: number; readonly pen2000Mm: number | null }>;
}

type ManifestRow = Omit<DocsFleetRow, 'shells'> & { readonly gun?: { readonly shells?: DocsFleetRow['shells'] } };

let rows: readonly DocsFleetRow[] | null = null;
/** Every playable tank's name, nation, tier and shells, in manifest order. */
export function docsFleetRows(): readonly DocsFleetRow[] {
  if (rows) return rows;
  const table = JSON.parse(readFileSync(join(ROOT, 'public/icons/tank-assets.json'), 'utf8')).tanks as Record<string, ManifestRow>;
  rows = Object.values(table).map(({ id, name, countryCode, nation, tier, tierNumeral, gun }) => ({ id, name, countryCode, nation, tier, tierNumeral, shells: gun?.shells ?? [] }));
  return rows;
}
