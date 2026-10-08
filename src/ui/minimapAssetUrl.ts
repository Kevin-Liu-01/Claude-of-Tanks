/**
 * Raster revision shared by every battlefield: bump it when the bake changes for
 * all maps (tactical map 2026-09-15: cartographic tone curve, hillshade, union
 * shorelines — every raster was re-baked, so every cache entry invalidates).
 */
export const MINIMAP_RASTER_REVISION = 'north-up-v17-revival-mr1'; // 2026-10-05: the map-revival lane's plates (Suzhou Creek: the creek and its four bridges through the old Blackglass district); v16 2026-10-03: maps lane B's gauntlet wave 28 plates on the merged head (Tarkhan Steppe's sors, Amberford's smooth river bank, Kestrel Airfield's cargo hangar under the Hostomel kit, Nordhavn Fjord's harbour town and headland lighthouse); v15: maps lane A's twenty plates baked on the merged head (b93af1a16, with Blackglass's civic hall off road 3): batch 4's seven, Redrock's jebels, batches 2-3 (never re-baked after their redesigns) and the pilot's and batch 1's under the ground lane's land use; v14: maps lane B's gauntlet wave 11 plates (Copper Mesa without its north shelf, Amberford's meandering river, Tarkhan Steppe's takyr flats, Whiteout Station's wind berms, Kestrel Airfield's hangars; v13: lane B's batches 7 and 8; v12: batches 5 and 6; v11: Frontier Basin, Saltwind Narrows, Saltmere Bay and Verdant Fields; v10: Sirocco Wadi, Steinburg and Cinder Junction; round 48: Frosthollow, Amberford, Tarkhan Steppe)

/** Shared by intent prefetch and world activation; keep unchanged maps cached. */
export function minimapAssetUrl(mapId: string, baseUrl = '/', version?: string): string {
  const assetVersion = version || MINIMAP_RASTER_REVISION;
  return `${baseUrl || '/'}minimaps/${encodeURIComponent(mapId)}.webp?v=${assetVersion}`;
}
