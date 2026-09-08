/** Shared by intent prefetch and world activation; keep unchanged maps cached. */
export function minimapAssetUrl(mapId: string, baseUrl = '/', version?: string): string {
  const assetVersion = version || (mapId === 'oasis'
    ? 'north-up-v7-oasis-shoreline-v2' : 'north-up-v7');
  return `${baseUrl || '/'}minimaps/${encodeURIComponent(mapId)}.webp?v=${assetVersion}`;
}
