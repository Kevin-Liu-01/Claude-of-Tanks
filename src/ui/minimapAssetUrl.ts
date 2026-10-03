/**
 * Raster revision shared by every battlefield: bump it when the bake changes for
 * all maps (tactical map 2026-09-15: cartographic tone curve, hillshade, union
 * shorelines — every raster was re-baked, so every cache entry invalidates).
 */
export const MINIMAP_RASTER_REVISION = 'north-up-v12-layouts-b'; // 2026-10-03: maps lane B's batches 5 and 6 (Aegis Crossing, Ruinspires, Kestrel Airfield, Copper Mesa, Earthrise Basin, Orchard Valley, Longleaf Crossing) re-baked for their layout redesigns (v11: Frontier Basin, Saltwind Narrows, Saltmere Bay and Verdant Fields; v10: Sirocco Wadi, Steinburg and Cinder Junction; round 48: Frosthollow, Amberford, Tarkhan Steppe)

/** Shared by intent prefetch and world activation; keep unchanged maps cached. */
export function minimapAssetUrl(mapId: string, baseUrl = '/', version?: string): string {
  const assetVersion = version || MINIMAP_RASTER_REVISION;
  return `${baseUrl || '/'}minimaps/${encodeURIComponent(mapId)}.webp?v=${assetVersion}`;
}
