// The config a world build runs on (2026-10-08, the time-to-battle lane): the map's own, or its Frontline Assault trench
// variant. Shared by the world build (map.ts) and the horizon ring worker (horizonRingWorker.ts), which rebuilds the
// same config from the map id and the variant, so both build the ring on the same data.
import { getMapConfig, type BattlefieldMapConfig } from './maps/index.ts';

export type BuildMapConfig = BattlefieldMapConfig & { assaultTrenches?: boolean };

export function worldBuildConfig(mapId: string, terrainVariant?: string | null): BuildMapConfig {
  return terrainVariant === 'assault-trenches'
    ? { ...getMapConfig(mapId), assaultTrenches: true }
    : getMapConfig(mapId);
}
