/** Shared by intent prefetch and world activation; keep unchanged maps cached. */
export function minimapAssetUrl(mapId: string, baseUrl = '/', version?: string): string {
  const assetVersion = version || (mapId === 'oasis'
    ? 'north-up-v7-oasis-shoreline-v2' : mapId === 'autumn'
      ? 'north-up-v7-autumn-headlands' : mapId === 'foundry'
        ? 'north-up-v7-foundry-service-court' : 'north-up-v7');
  return `${baseUrl || '/'}minimaps/${encodeURIComponent(mapId)}.webp?v=${assetVersion}`;
}
