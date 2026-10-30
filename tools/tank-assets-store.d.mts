// Types for tools/tank-assets-store.mjs (the per-tank asset manifest, 266) where TypeScript tools import it.
export interface TankAssetManifest<Row = Record<string, unknown>> {
  readonly schemaVersion: number;
  readonly partial: boolean;
  readonly generator: string;
  readonly requiredViews: readonly string[];
  readonly tanks: Readonly<Record<string, Row>>;
}
export const TANK_ASSET_FILE_CAP_BYTES: number;
export function compareTankIds(a: string, b: string): number;
export function tankAssetsDir(iconsDir: string): string;
export function tankAssetIndexPath(iconsDir: string): string;
export function tankAssetRowsDir(iconsDir: string): string;
export function tankAssetRowPath(iconsDir: string, id: string): string;
export function serializeTankAssetJson(value: unknown): string;
export function tankAssetsMonolithText(manifest: TankAssetManifest<unknown>): string;
export function tankAssetIds(iconsDir: string): string[];
export function readTankAssetRow<Row = Record<string, unknown>>(iconsDir: string, id: string): Row | null;
export function readTankAssets<Row = Record<string, unknown>>(iconsDir: string): TankAssetManifest<Row> | null;
export function tankAssetsLayoutProblems(iconsDir: string, options?: { capBytes?: number }): string[];
export function writeTankAssets(iconsDir: string, manifest: TankAssetManifest<unknown>,
  options?: { prune?: boolean; dryRun?: boolean }): { changed: string[]; removed: string[] };
