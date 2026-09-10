/** Shared by intent prefetch and world activation; keep unchanged maps cached. */
export function minimapAssetUrl(mapId: string, baseUrl = '/', version?: string): string {
  const assetVersion = version || ((mapId === 'frontier' || mapId === 'alpine')
    ? 'north-up-v7-regional-relief-v1' : mapId === 'oasis'
    ? 'north-up-v7-oasis-shoreline-v2' : mapId === 'autumn'
      ? 'north-up-v7-autumn-headlands' : mapId === 'foundry'
        ? 'north-up-v7-foundry-localized-soil' : 'north-up-v7');
  return `${baseUrl || '/'}minimaps/${encodeURIComponent(mapId)}.webp?v=${assetVersion}`;
}
