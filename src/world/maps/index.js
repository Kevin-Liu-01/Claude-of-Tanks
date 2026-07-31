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

/** Ordered map ids (garage picker order). @type {string[]} */
export const MAP_IDS = ['verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard'];

const CONFIGS = { verdant, desert, winter, urban, coastal, autumn, steppe, railyard };

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
    return MAP_IDS[Math.min(MAP_IDS.length - 1, Math.floor(rand() * MAP_IDS.length))];
  }
  return mapId;
}
