import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAP_IDS, getMapName, isMapId, resolveMapId } from './maps/catalog.ts';
import { getMapConfig, RANDOM_BATTLE_MAP_IDS } from './maps/index.ts';
import { MAP_THUMBS, MAP_HEROES } from '../ui/mapThumbs.ts';
import { PRODUCT_STATS, renderProductStats } from '../productStats.ts';
import { resolvePrivateMatchMap } from '../net/privateMatchHandoff.ts';
import { rankedBattleMapForSequence } from '../../server/rankedMatchmaker.ts';
import { randomMapPreviewEntries } from '../ui/randomPreviews.ts';

// Mars mode (2026-09-18): Olympus Basin joins the catalog (31 maps); the random draw excludes it
assert.equal(MAP_IDS.length, 31);
assert.equal(PRODUCT_STATS.battlefields, MAP_IDS.length, 'public product totals follow the complete roster');
assert.equal(renderProductStats('{{COT_BATTLEFIELDS}} battlefields'), '31 battlefields');
assert.deepEqual(Object.keys(MAP_THUMBS), MAP_IDS, 'picker metadata covers every map in canonical order');
assert.deepEqual(Object.keys(MAP_HEROES), MAP_IDS, 'loading/hero metadata covers every map in canonical order');
const previews = MAP_IDS.map((id) => ({ id, thumb: MAP_THUMBS[id] }));
assert.deepEqual(randomMapPreviewEntries(previews, 31).map(({ id }) => id).sort(), [...MAP_IDS].sort(),
  'the random mosaic accepts the whole catalog without a twenty-map truncation');
const lobby = { phase: 'starting', matchSeed: 42, players: [], mapId: 'random' };
for (const [index, id] of MAP_IDS.entries()) {
  assert.ok(isMapId(id), `${id}: lightweight admission`);
  assert.equal(getMapConfig(id).id, id, `${id}: full world lookup does not silently fall back`);
  assert.equal(getMapName(id), getMapConfig(id).name, `${id}: display name is canonical`);
  assert.equal(resolveMapId(id), id, `${id}: explicit solo selection is retained`);
  assert.equal(resolvePrivateMatchMap({ ...lobby, mapId: id }), id, `${id}: private/LAN handoff retains selection`);
  // Mars mode (2026-09-18): the ranked rotation is the random rotation — the galaxy basin plays by choice
  if (id !== 'mars') {
    const rotationIndex = RANDOM_BATTLE_MAP_IDS.indexOf(id);
    assert.equal(rankedBattleMapForSequence(rotationIndex), id, `${id}: ranked rotation reaches every rotation map`);
    assert.equal(rankedBattleMapForSequence(rotationIndex + RANDOM_BATTLE_MAP_IDS.length), id, `${id}: ranked wrap uses the rotation length`);
  }
}
const source = await readFile(new URL('./props.ts', import.meta.url), 'utf8');
// Keep this tiny routing guard source-based: building props would allocate
// textures and fleet geometry merely to inspect four constant ID predicates.
const routedIds = (name) => [...source.match(new RegExp(`const ${name} = ([\\s\\S]*?);`))[1]
  .matchAll(/mapId === '([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(routedIds('isIndustrial'), ['urban', 'railyard', 'foundry', 'caldera', 'copper_mesa', 'airfield', 'whiteout'],
  'mine, airfield and polar logistics use the existing sleeping industrial clutter bodies');
assert.deepEqual(routedIds('isDry'), ['desert', 'badlands', 'frontier', 'oasis'],
  'oasis compounds use the existing dry-country clutter palette');
assert.match(source, /const looseCap = richCount\(inh\.looseClutter,/, 'biome routing preserves the configured population ceiling (tier richness applied at the read)');
console.log('mapIntegration.selftest: thirty solo/private/ranked/UI identities and existing clutter profile routing passed');
