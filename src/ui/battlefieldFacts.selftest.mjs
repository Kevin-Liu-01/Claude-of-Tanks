// The battlefield picker's facts (src/ui/battlefieldFacts.ts): every map has a name, a landscape, at least one hour,
// every battle mode and three pictures that exist on disk; Random draws every map but the space ones; the space maps
// light only by day; an unknown id reads as Verdant Fields; the placeholder table answers for every map.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { battlefieldFacts, battlefieldList, battlefieldPlaceholder } from './battlefieldFacts.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import { BATTLE_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { BATTLE_TIMES } from '../engine/battleWeatherPolicy.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const list = battlefieldList();
assert.deepEqual(list.map((facts) => facts.id), [...MAP_IDS], 'one entry per map, in the catalog order');
for (const facts of list) {
  assert.ok(facts.name, `${facts.id} has a name`);
  assert.ok(facts.regions.length > 0, `${facts.id} has a landscape`);
  assert.ok(facts.hours.length > 0 && facts.hours.every((hour) => BATTLE_TIMES.includes(hour)), `${facts.id} plays at real hours`);
  assert.deepEqual([...facts.modes], [...BATTLE_MODE_IDS], `${facts.id} hosts every battle mode`);
  for (const [kind, path] of Object.entries(facts.poster)) {
    assert.ok(path && existsSync(join(ROOT, 'public', path)), `${facts.id} ${kind} picture exists (${path})`);
  }
  assert.equal(facts.random, facts.id !== 'mars' && facts.id !== 'moon', `${facts.id} Random eligibility`);
  if (facts.id === 'mars' || facts.id === 'moon') assert.deepEqual([...facts.hours], ['day'], `${facts.id} lights by day only`);
  else assert.deepEqual([...facts.hours], [...BATTLE_TIMES], `${facts.id} plays every hour`);
}
assert.equal(battlefieldFacts('nowhere').id, 'verdant', 'an unknown id reads as Verdant Fields');
for (const id of MAP_IDS) assert.match(await battlefieldPlaceholder(id), /^data:image\//, `${id} has a placeholder`);
assert.equal(await battlefieldPlaceholder('nowhere'), '', 'an unknown id has no placeholder');
console.log(`battlefieldFacts.selftest: ${list.length} battlefields, each with its landscape, hours, modes and three pictures`);
