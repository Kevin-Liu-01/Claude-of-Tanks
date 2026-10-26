// The battlefield picker's facts (src/ui/battlefieldFacts.ts): every map has a name, a landscape, at least one hour,
// every battle mode and pictures that exist on disk; Random draws every map but the space ones; the space maps light only
// by day; an unknown id reads as Verdant Fields; the placeholder table answers for every map. Its still list is the maps-r1
// manifest's, rung for rung, its hover loops the manifest's, and a map without stills reads the generated art table's own paths.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { battlefieldFacts, battlefieldList, battlefieldPlaceholder } from './battlefieldFacts.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import { BATTLE_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { BATTLE_TIMES } from '../engine/battleWeatherPolicy.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';
import { readFileSync } from 'node:fs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/media/maps-r1/manifest.json'), 'utf8'));
const stills = new Map(manifest.maps.map((entry) => [entry.id, entry.poster.rungs.map((rung) => rung.path)]));
const loops = new Map(manifest.maps.filter((entry) => entry.loop).map((entry) => [entry.id, entry.loop.path]));
const list = battlefieldList();
assert.deepEqual(list.map((facts) => facts.id), [...MAP_IDS], 'one entry per map, in the catalog order');
for (const facts of list) {
  assert.ok(facts.name, `${facts.id} has a name`);
  assert.ok(facts.regions.length > 0, `${facts.id} has a landscape`);
  assert.ok(facts.hours.length > 0 && facts.hours.every((hour) => BATTLE_TIMES.includes(hour)), `${facts.id} plays at real hours`);
  assert.deepEqual([...facts.modes], [...BATTLE_MODE_IDS], `${facts.id} hosts every battle mode`);
  const { src, srcset, hero, thumb } = facts.poster;
  const rungs = srcset.split(', ').map((rung) => rung.split(' ')[0]);
  for (const path of new Set([src, hero, thumb, ...rungs])) {
    assert.ok(path && existsSync(join(ROOT, 'public', path)), `${facts.id} picture exists (${path})`);
  }
  assert.equal(thumb, MAP_THUMBS[facts.id], `${facts.id} thumb is the generated table's`);
  const still = stills.get(facts.id);
  if (still) {
    assert.deepEqual(rungs, still, `${facts.id} srcset is the manifest's rungs`);
    assert.equal(src, still[0], `${facts.id} card picture is its smallest still`);
    assert.equal(hero, still.at(-1), `${facts.id} preview takes its largest still`);
  } else {
    assert.equal(hero, MAP_HEROES[facts.id], `${facts.id} hero is the generated table's`);
    assert.equal(src, MAP_THUMBS[facts.id], `${facts.id} card picture falls back to the thumb`);
  }
  assert.equal(facts.poster.loop, loops.get(facts.id), `${facts.id} hover loop is the manifest's`);
  if (facts.poster.loop) assert.ok(existsSync(join(ROOT, 'public', facts.poster.loop)), `${facts.id} loop exists`);
  assert.equal(facts.random, facts.id !== 'mars' && facts.id !== 'moon', `${facts.id} Random eligibility`);
  if (facts.id === 'mars' || facts.id === 'moon') assert.deepEqual([...facts.hours], ['day'], `${facts.id} lights by day only`);
  else assert.deepEqual([...facts.hours], [...BATTLE_TIMES], `${facts.id} plays every hour`);
}
assert.equal(battlefieldFacts('nowhere').id, 'verdant', 'an unknown id reads as Verdant Fields');
for (const id of MAP_IDS) assert.match(await battlefieldPlaceholder(id), /^data:image\//, `${id} has a placeholder`);
assert.equal(await battlefieldPlaceholder('nowhere'), '', 'an unknown id has no placeholder');
assert.deepEqual(list.filter((facts) => facts.poster.srcset.includes('/media/maps-r1/')).map((facts) => facts.id).sort(), [...stills.keys()].sort(),
  'the still list is the maps-r1 manifest\'s');
console.log(`battlefieldFacts.selftest: ${list.length} battlefields (${stills.size} on maps-r1 stills, ${loops.size} with hover loops), each with its landscape, hours, modes and pictures`);
