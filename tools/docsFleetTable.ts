// The fleet rows the Field Manual's chapters print, read from the asset manifest (public/icons/tank-assets/, tool-only
// files the build drops: tools/tool-only-public-files.mjs). Copyright © 2026 Kevin B. Liu.
// The manifest is a row file per tank (27 MB in all), so it is read once per process; src/docs/chapters/fleet.ts takes
// the rows from here and the prerender (tools/docs-prerender.mjs) is the only thing that runs it. Node only.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayTier, tierNumeral } from '../src/techTree/tiers.ts';
import { readTankAssets } from './tank-assets-store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface DocsFleetRow {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly nation: string;
  readonly tier: number;
  readonly tierNumeral: string;
  readonly shells: ReadonlyArray<{ readonly name: string; readonly type: string; readonly pen100Mm: number; readonly pen1000Mm: number; readonly pen2000Mm: number | null }>;
  /** The name players read (the label's displayName, never the id), the era and the search aliases. */
  readonly displayName: string;
  readonly era: string;
  readonly aliases: readonly string[];
  /** The first 8 hex of each view render's sha256 (the files' cache keys): the angle render, its 256 px thumb and the
   *  side render (public/icons/<id>_angle.webp, thumbs/<id>_angle.webp, <id>_side.webp). */
  readonly views: { readonly angle: string; readonly angleThumb: string; readonly side: string };
}

interface ManifestFile { readonly sha256?: string; readonly thumbnail?: ManifestFile }
type ManifestRow = Pick<DocsFleetRow, 'id' | 'name' | 'countryCode' | 'nation' | 'era'> & {
  readonly gun?: { readonly shells?: DocsFleetRow['shells'] };
  readonly label?: { readonly displayName?: string; readonly searchAliases?: readonly string[] };
  readonly assets?: { readonly angle?: ManifestFile; readonly side?: ManifestFile };
};
const sha8 = (file: ManifestFile | undefined): string => (file?.sha256 ?? '').slice(0, 8);

let rows: readonly DocsFleetRow[] | null = null;
/** Every playable tank's name, nation, shown tier (src/techTree/tiers.ts, not the manifest's), shells, era and view
 *  renders, in manifest order. */
export function docsFleetRows(): readonly DocsFleetRow[] {
  if (rows) return rows;
  const table = readTankAssets<ManifestRow>(join(ROOT, 'public/icons'))?.tanks ?? {};
  rows = Object.values(table).map(({ id, name, countryCode, nation, era, gun, label, assets }) => ({
    id, name, countryCode, nation, tier: displayTier(id), tierNumeral: tierNumeral(id), shells: gun?.shells ?? [],
    displayName: label?.displayName || name, era, aliases: label?.searchAliases ?? [],
    views: { angle: sha8(assets?.angle), angleThumb: sha8(assets?.angle?.thumbnail), side: sha8(assets?.side) },
  }));
  return rows;
}
