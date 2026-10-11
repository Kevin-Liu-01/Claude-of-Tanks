// Shared browser acquisition for resource and frame comparisons. These
// functions must remain standalone: Puppeteer/agent-browser serialize them.
import { readFileSync } from 'node:fs';

/**
 * The battlefields' camouflage pools, read from the game's own table (src/vehicles/materials.ts BIOME_PATTERN, the
 * pools the bots' AUTO paint draws from on each map) with the per-tank selection key (materials.ts CAMO_LS_PREFIX).
 * (2026-10-09, fix/camo-defaults: production's camouflage system is restored, so the pools are read from materials.ts
 * again rather than from PR #9's camoPolicy.ts AUTO_CAMO_BIOMES.) Null when the source cannot be read (a copied tools
 * directory): the pin is then a no-op and the tank wears its stored selection.
 */
export function readMapCamoPools(materialsSource = new URL('../src/vehicles/materials.ts', import.meta.url)) {
  let materials;
  try { materials = readFileSync(materialsSource, 'utf8'); } catch { return null; }
  const table = /const BIOME_PATTERN[^=]*=\s*\{([\s\S]*?)\n\};/.exec(materials);
  const prefix = /const CAMO_LS_PREFIX = '([^']+)';/.exec(materials);
  if (!table || !prefix) return null;
  const pools = {};
  for (const row of table[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    const schemes = [...row[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (schemes.length) pools[row[1]] = Object.freeze(schemes);
  }
  return pools.verdant ? Object.freeze({ storagePrefix: prefix[1], pools: Object.freeze(pools) }) : null;
}

/** The scheme the pinned tank wears on a map: the first of the pool its bots draw from (Verdant's where the map has
 * none of its own, as the game's setCamoBiome falls back). */
export function pinnedCamoScheme(mapId, camo = PINNED_SCENE.camo) {
  if (!camo) return null;
  return (Object.prototype.hasOwnProperty.call(camo.pools, mapId) ? camo.pools[mapId] : camo.pools.verdant)[0];
}

export const PINNED_SCENE = Object.freeze({
  protocol: 'm1a2-fixed-roster-v1',
  storageKey: 'cot.lastTank.v1',
  playerSpecId: 'm1a2',
  roster: Object.freeze([
    'm1a2', 'm1a3', 'm1a1', 'm1a1ha',
    'm1a2_tusk', 'm1a2_sepv2', 'm1a2_sepv3', 'abramsx',
  ]),
  // (2026-10-06, the coordinator: the pinned M1A2 wore its factory sand on every map, a desert tank in the snow) the
  // camouflage the pinned tank wears on each staged battlefield — configurePinnedScene sets it before every
  // battlefield shot, on both sides of a pair
  camo: readMapCamoPools(),
});

/** Install with evaluateOnNewDocument BEFORE navigation, not after hero bake. */
export function primePinnedSceneStorage(specification) {
  globalThis.localStorage.setItem(specification.storageKey, specification.playerSpecId);
}

/** Call after __DEBUG readiness and before the first __SHOTS.set. */
export function configurePinnedScene(specification) {
  const D = window.__DEBUG;
  if (!D?.flags || D.selectedSpecId !== specification.playerSpecId) {
    throw new Error('Pinned scene boot selection unavailable or mismatched');
  }
  D.flags.forceRoster = [...specification.roster];
  D.flags.rosterExact = true;
  // The map's camouflage: before every battlefield shot ('battlefield' is Verdant, 'battlefield_<mapId>' the rest) the
  // pinned tank's stored selection becomes the first scheme of that map's pool, which the shot's own camo pass then
  // paints (shotRuntime: setCamoBiome, applyCamoPatterns, setupBattle). Wrapped once; other shots pass through.
  const shots = window.__SHOTS, camo = specification.camo;
  if (camo && shots && typeof shots.set === 'function' && !shots.pinnedCamo) {
    const set = shots.set;
    shots.set = function pinnedCamoSet(name) {
      const match = /^battlefield(?:_(.+))?$/.exec(String(name));
      if (match) {
        const mapId = match[1] || 'verdant';
        const pool = Object.prototype.hasOwnProperty.call(camo.pools, mapId) ? camo.pools[mapId] : camo.pools.verdant;
        globalThis.localStorage.setItem(camo.storagePrefix + specification.playerSpecId, pool[0]);
      }
      return set.call(this, name);
    };
    shots.pinnedCamo = true;
  }
}

/** Actual entity order, teams and visual identity; no retained scene handles. */
export function capturePinnedScene(specification) {
  const D = window.__DEBUG;
  const game = D?.game;
  if (!game?.player || !Array.isArray(game.tanks)) throw new Error('Pinned scene roster unavailable');
  const receipt = {
    protocol: specification.protocol,
    selectedSpecId: D.selectedSpecId,
    playerEntityId: game.player.id,
    playerSpecId: game.player.specId,
    entities: game.tanks.map(entity => ({
      entityId: entity.id, team: entity.team, specId: entity.specId,
      isPlayer: entity.isPlayer, visualSpecId: entity.visual?.specId ?? null,
    })),
  };
  const expected = {
    protocol: specification.protocol,
    selectedSpecId: specification.playerSpecId,
    playerEntityId: specification.playerSpecId,
    playerSpecId: specification.playerSpecId,
    entities: specification.roster.map((specId, index) => ({
      entityId: specId, team: index < 4 ? 'player' : 'enemy', specId,
      isPlayer: index === 0, visualSpecId: specId,
    })),
  };
  if (JSON.stringify(receipt) !== JSON.stringify(expected)) {
    throw new Error(`Pinned scene identity mismatch: ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

function entityMatches(entity, specId, index) {
  return entity?.entityId === specId && entity.specId === specId
    && entity.visualSpecId === specId && entity.isPlayer === (index === 0)
    && entity.team === (index < 4 ? 'player' : 'enemy');
}

/** Validate against the fixed contract, never expectations copied from a report. */
export function isPinnedSceneReceipt(receipt) {
  return receipt?.protocol === PINNED_SCENE.protocol
    && receipt.selectedSpecId === PINNED_SCENE.playerSpecId
    && receipt.playerEntityId === PINNED_SCENE.playerSpecId
    && receipt.playerSpecId === PINNED_SCENE.playerSpecId
    && Array.isArray(receipt.entities) && receipt.entities.length === PINNED_SCENE.roster.length
    && receipt.entities.every((entity, index) => entityMatches(entity, PINNED_SCENE.roster[index], index));
}
