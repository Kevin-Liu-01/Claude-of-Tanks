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
// Inhabited-environment expansion — ten individually authored route graphs.
import polders from './polders.ts';
import copperMesa from './copperMesa.ts';
import airfield from './airfield.ts';
import oasis from './oasis.ts';
import whiteout from './whiteout.ts';
import orchard from './orchard.ts';
import longleaf from './longleaf.ts';
import mangrove from './mangrove.ts';
import saltwind from './saltwind.ts';
import reservoir from './reservoir.ts';

const CONFIGS = {
  verdant, desert, winter, urban, coastal, autumn, steppe, railyard,
  frontier, fjord, delta, badlands, monsoon, alpine, caldera, foundry,
  ruinspires, blackglass, titan_gorge: titanGorge, skybridge,
  polders, copper_mesa: copperMesa, airfield, oasis, whiteout,
  orchard, longleaf, mangrove, saltwind, reservoir,
} satisfies Record<MapId, object>;

export type BattlefieldMapConfig = (typeof CONFIGS)[MapId];

/**
 * Look up a map config by id.
 * Falls back to Verdant Fields for an unknown id.
 */
export function getMapConfig(mapId: string): BattlefieldMapConfig {
  return isMapId(mapId) ? CONFIGS[mapId] : CONFIGS.verdant;
}
