// Battlefield rosters that frozen receipts were pinned against (2026-10-01). MAP_IDS grows: Olympus Basin (mars)
// joined on 2026-09-18, Earthrise Basin (moon) and Aegis Crossing (cliffbridge) on 2026-09-29 (0e5fc79e2). A digest
// or snapshot taken over "every registered map" silently changes meaning whenever a battlefield is added, so a frozen
// receipt names the roster its pins cover. A battlefield registered later is outside every earlier pin; the live
// invariant loops (which keep reading MAP_IDS) and the battlefield's own receipts guard it.
import assert from 'node:assert/strict';
import { MAP_IDS } from './maps/mapIds.ts';

/** MAP_IDS from Mars (2026-09-18) until the lunar/bridge pair (0e5fc79e2^), in registry order. */
export const PRE_LUNAR_MAP_IDS = Object.freeze([
  'verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard',
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
  'ruinspires', 'blackglass', 'titan_gorge', 'skybridge',
  'polders', 'copper_mesa', 'airfield', 'oasis', 'whiteout',
  'orchard', 'longleaf', 'mangrove', 'saltwind', 'reservoir',
  'mars',
]);

/** The thirty battlefields registered before Mars (2026-09-18), in registry order. */
export const PRE_MARS_MAP_IDS = Object.freeze(PRE_LUNAR_MAP_IDS.filter(id => id !== 'mars'));

/** Battlefields registered after the pre-lunar roster, in registry order (moon and cliffbridge as of 2026-10-01). */
export const POST_LUNAR_MAP_IDS = Object.freeze(MAP_IDS.filter(id => !PRE_LUNAR_MAP_IDS.includes(id)));

// A frozen roster names only registered battlefields, in registry order: retiring or reordering one must surface in
// every receipt that pins it, never fall back silently to Verdant's config (getMapConfig's default for an unknown id).
assert.deepEqual(MAP_IDS.filter(id => PRE_LUNAR_MAP_IDS.includes(id)), [...PRE_LUNAR_MAP_IDS],
  'every pre-lunar battlefield is still registered, in its original registry order');
