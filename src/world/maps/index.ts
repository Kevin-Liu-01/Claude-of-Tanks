// src/world/maps/index.ts — map registry. Each map is a pure config module
// consumed by createMap(engineCtx, {mapId}); see verdant.ts for the schema.

import verdant from './verdant.ts';
import desert from './desert.ts';
import winter from './winter.ts';
import urban from './urban.ts';
// maps r1 — the second four battlefields
import coastal from './coastal.ts';
import autumn from './autumn.ts';
import steppe from './steppe.ts';
import railyard from './railyard.ts';
// Map-quality expansion — eight additional battlefields, each kept as a pure
// config so headless simulation and the browser renderer consume one source.
import frontier from './frontier.ts';
import fjord from './fjord.ts';
import delta from './delta.ts';
import badlands from './badlands.ts';
import monsoon from './monsoon.ts';
import alpine from './alpine.ts';
import caldera from './caldera.ts';
import foundry from './foundry.ts';
// Extreme-environment expansion — vertical ruins and canyon-scale terrain.
import ruinspires from './ruinspires.ts';
import blackglass from './blackglass.ts';
import titanGorge from './titanGorge.ts';
import skybridge from './skybridge.ts';

/** Ordered map ids (garage picker order). */
export const MAP_IDS = Object.freeze(['verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard',
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
  'ruinspires', 'blackglass', 'titan_gorge', 'skybridge'] as const);

export type MapId = (typeof MAP_IDS)[number];

// Random Battle deliberately aliases the complete canonical registry. Keeping
// one immutable list makes a newly registered battlefield immediately eligible
// in solo, private/LAN, rematch, and ranked selection instead of requiring a
// second hand-maintained pool.
export const RANDOM_BATTLE_MAP_IDS = MAP_IDS;

const CONFIGS = {
  verdant, desert, winter, urban, coastal, autumn, steppe, railyard,
  frontier, fjord, delta, badlands, monsoon, alpine, caldera, foundry,
  ruinspires, blackglass, titan_gorge: titanGorge, skybridge,
} satisfies Record<MapId, object>;

export type BattlefieldMapConfig = (typeof CONFIGS)[MapId];

export function isMapId(mapId: string): mapId is MapId {
  return Object.prototype.hasOwnProperty.call(CONFIGS, mapId);
}

/**
 * Look up a map config by id.
 * Falls back to Verdant Fields for an unknown id.
 */
export function getMapConfig(mapId: string): BattlefieldMapConfig {
  return isMapId(mapId) ? CONFIGS[mapId] : CONFIGS.verdant;
}

/**
 * Resolve 'random' to a concrete map id.
 * Resolve `random` or an unknown value to a concrete registered map id.
 */
export function resolveMapId(mapId: string, rand: () => number = Math.random): MapId {
  if (mapId === 'random' || !isMapId(mapId)) {
    const sample = Number(rand());
    const unit = Number.isFinite(sample)
      ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
    return RANDOM_BATTLE_MAP_IDS[Math.floor(unit * RANDOM_BATTLE_MAP_IDS.length)];
  }
  return mapId;
}
