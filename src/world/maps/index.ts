// src/world/maps/index.ts — map registry. Each map is a pure config module
// consumed by createMap(engineCtx, {mapId}); see verdant.ts for the schema.

import {
  MAP_IDS,
  isMapId,
  type MapId,
} from './catalog.ts';
export {
  DEFAULT_GARAGE_SKY,
  MAP_IDS,
  RANDOM_BATTLE_MAP_IDS,
  getMapName,
  isMapId,
  resolveMapId,
  type MapId,
} from './catalog.ts';

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

const CONFIGS = {
  verdant, desert, winter, urban, coastal, autumn, steppe, railyard,
  frontier, fjord, delta, badlands, monsoon, alpine, caldera, foundry,
  ruinspires, blackglass, titan_gorge: titanGorge, skybridge,
} satisfies Record<MapId, object>;

export type BattlefieldMapConfig = (typeof CONFIGS)[MapId];

/**
 * Look up a map config by id.
 * Falls back to Verdant Fields for an unknown id.
 */
export function getMapConfig(mapId: string): BattlefieldMapConfig {
  return isMapId(mapId) ? CONFIGS[mapId] : CONFIGS.verdant;
}
