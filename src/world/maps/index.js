// src/world/maps/index.js — map registry. Each map is a pure config module
// consumed by createMap(engineCtx, {mapId}); see verdant.js for the schema.

import verdant from './verdant.js';
import desert from './desert.js';
import winter from './winter.js';
import urban from './urban.js';
// maps r1 — the second four battlefields
import coastal from './coastal.js';
import autumn from './autumn.js';
import steppe from './steppe.js';
import railyard from './railyard.js';
// Map-quality expansion — eight additional battlefields, each kept as a pure
// config so headless simulation and the browser renderer consume one source.
import frontier from './frontier.js';
import fjord from './fjord.js';
import delta from './delta.js';
import badlands from './badlands.js';
import monsoon from './monsoon.js';
import alpine from './alpine.js';
import caldera from './caldera.js';
import foundry from './foundry.js';
// Extreme-environment expansion — vertical ruins and canyon-scale terrain.
import ruinspires from './ruinspires.js';
import blackglass from './blackglass.js';
import titanGorge from './titanGorge.js';
import skybridge from './skybridge.js';

/** Ordered map ids (garage picker order). @type {readonly string[]} */
export const MAP_IDS = Object.freeze(['verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard',
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
  'ruinspires', 'blackglass', 'titan_gorge', 'skybridge']);

// Random Battle deliberately aliases the complete canonical registry. Keeping
// one immutable list makes a newly registered battlefield immediately eligible
// in solo, private/LAN, rematch, and ranked selection instead of requiring a
// second hand-maintained pool.
export const RANDOM_BATTLE_MAP_IDS = MAP_IDS;

const CONFIGS = {
  verdant, desert, winter, urban, coastal, autumn, steppe, railyard,
  frontier, fjord, delta, badlands, monsoon, alpine, caldera, foundry,
  ruinspires, blackglass, titan_gorge: titanGorge, skybridge,
};

/**
 * Look up a map config by id.
 * @param {string} mapId one of MAP_IDS
 * @returns {object} map config (falls back to verdant on unknown ids)
 */
export function getMapConfig(mapId) {
  return CONFIGS[mapId] || CONFIGS.verdant;
}

/**
 * Resolve 'random' to a concrete map id.
 * @param {string} mapId map id or 'random'
 * @param {?function():number} [rand] RNG (defaults to Math.random)
 * @returns {string} concrete map id
 */
export function resolveMapId(mapId, rand = Math.random) {
  if (mapId === 'random' || !CONFIGS[mapId]) {
    const sample = Number(rand());
    const unit = Number.isFinite(sample)
      ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
    return RANDOM_BATTLE_MAP_IDS[Math.floor(unit * RANDOM_BATTLE_MAP_IDS.length)];
  }
  return mapId;
}
