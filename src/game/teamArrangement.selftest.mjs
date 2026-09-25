import assert from 'node:assert/strict';
import { TANK_SPECS, ALL_TANK_IDS } from '../vehicles/specs.ts';
import {
  ENEMY_NATION_OPTIONS, SIDES_MODES, TEAM_ARRANGEMENT_STORAGE_KEY, enemyNationSpecNations, isEnemyNationId,
  readSides, readTeamArrangement, writeSides, writeTeamArrangement,
  readMarsSettings, writeMarsSettings,
  BRAIN_STORAGE_KEY, DEFAULT_BRAIN_SETTINGS, isBotBrainId, readBrainSettings, writeBrainSettings,
} from './teamArrangement.ts';
import { BATTLE_FIELD_LIMIT } from '../sim/matchRuleset.ts';
import { CAMPAIGN_ENEMY_NATIONS } from './campaignOperations.ts';

// Team arrangement (owner 2026-09-15): every fleet nation is an option, the option table agrees with
// the campaign's nation spellings, and the per-mode store round-trips clamped values.
const fleetNations = new Set(ALL_TANK_IDS.map((id) => String(TANK_SPECS[id]?.nation || '')));
const covered = new Set(ENEMY_NATION_OPTIONS.flatMap((option) => option.specNations));
for (const nation of fleetNations) assert.ok(covered.has(nation), `${nation}: a fleet nation is an arrangement option`);
assert.equal(new Set(ENEMY_NATION_OPTIONS.map((option) => option.id)).size, ENEMY_NATION_OPTIONS.length, 'ids are unique');
for (const [id, nations] of Object.entries(CAMPAIGN_ENEMY_NATIONS)) {
  assert.deepEqual([...enemyNationSpecNations(id)], [...nations], `${id}: the campaign and the arrangement spell the nation the same way`);
}
assert.ok(isEnemyNationId('ukraine') && !isEnemyNationId('mars') && !isEnemyNationId(null));
assert.deepEqual(enemyNationSpecNations('mars'), []);

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
assert.equal(readTeamArrangement('endless_horde', storage), null, 'nothing stored yet');
assert.deepEqual(writeTeamArrangement('endless_horde', { allies: 1, enemies: 99, waveSize: 6, enemyNation: 'japan' }, storage),
  { allies: 1, enemies: 20, waveSize: 6, enemyNation: 'japan' }, 'the store clamps like the ruleset');
assert.deepEqual(readTeamArrangement('endless_horde', storage), { allies: 1, enemies: 20, waveSize: 6, enemyNation: 'japan' });
assert.equal(readTeamArrangement('frontline_assault', storage), null, 'modes are stored apart');
assert.deepEqual(writeTeamArrangement('frontline_assault', { enemyNation: 'germany', waveSize: 3 }, storage),
  { allies: null, enemies: null, waveSize: null, enemyNation: 'germany' }, 'Frontline has no wave size');
assert.equal(writeTeamArrangement('endless_horde', null, storage), null, 'clearing removes the mode entry');
assert.equal(readTeamArrangement('endless_horde', storage), null);
assert.deepEqual(Object.keys(JSON.parse(memory.get(TEAM_ARRANGEMENT_STORAGE_KEY))), ['frontline_assault']);
// sides (owner 2026-09-18): Standard arranges its sides too, and one sides setting serves every symmetric mode
assert.deepEqual(writeTeamArrangement('standard', { allies: 0 }, storage), { allies: 0, enemies: null, waveSize: null, enemyNation: null },
  'Standard arranges its sides');
assert.deepEqual([...SIDES_MODES], ['standard', 'capture_the_flag', 'zone_control', 'turbo_ball', 'mars'], 'Mars mode (2026-09-18) is a symmetric mode: the sides switch applies');
writeTeamArrangement('turbo_ball', { enemyNation: 'japan' }, storage);
assert.deepEqual(writeSides({ allies: 13, enemies: 14 }, storage), { allies: 13, enemies: 14 });
for (const mode of SIDES_MODES) assert.equal(readTeamArrangement(mode, storage).allies, 13, `${mode}: shares the sides setting`);
assert.equal(readTeamArrangement('turbo_ball', storage).enemyNation, 'japan', 'a mode keeps its own nation');
assert.equal(readTeamArrangement('endless_horde', storage), null, 'the wave modes are untouched by the sides switch');
assert.deepEqual(readSides(storage), { allies: 13, enemies: 14 });
assert.deepEqual(writeSides(null, storage), { allies: 6, enemies: 7 }, 'clearing the sides restores 7 v 7');
assert.equal(readTeamArrangement('standard', storage), null);
assert.deepEqual(readTeamArrangement('turbo_ball', storage), { allies: null, enemies: null, waveSize: null, enemyNation: 'japan' });
assert.deepEqual(writeSides({ allies: 0, enemies: 99 }, storage), { allies: 0, enemies: BATTLE_FIELD_LIMIT - 1 }, 'the sides clamp like the ruleset');
assert.deepEqual(readSides(null), { allies: 6, enemies: 7 }, 'no storage reads as 7 v 7');
// Mars settings (owner 2026-09-18): stored on the mars arrangement, kept across a sides change, never on other modes
assert.deepEqual(readMarsSettings(storage), { gravity: 'mars', caches: 'standard' }, 'Mars settings default to the mode rules');
assert.deepEqual(writeMarsSettings({ gravity: 'moon', caches: 'frequent' }, storage), { gravity: 'moon', caches: 'frequent' });
assert.deepEqual(readTeamArrangement('mars', storage),
  { allies: 0, enemies: BATTLE_FIELD_LIMIT - 1, waveSize: null, enemyNation: null, marsGravity: 'moon', marsCaches: 'frequent' });
writeSides({ allies: 13, enemies: 14 }, storage);
assert.deepEqual(readMarsSettings(storage), { gravity: 'moon', caches: 'frequent' }, 'a sides change keeps the Mars settings');
assert.deepEqual(writeMarsSettings({ gravity: 'bogus' }, storage), { gravity: 'moon', caches: 'frequent' }, 'unknown ids keep the current choice');
assert.deepEqual(writeMarsSettings({ caches: 'off' }, storage), { gravity: 'moon', caches: 'off' }, 'one field at a time');
assert.equal(readTeamArrangement('standard', storage)?.marsGravity, undefined, 'the other symmetric modes never carry Mars settings');
assert.deepEqual(writeMarsSettings(null, storage), { gravity: 'mars', caches: 'standard' }, 'null clears both');
assert.deepEqual(readTeamArrangement('mars', storage), { allies: 13, enemies: 14, waveSize: null, enemyNation: null }, 'clearing the settings keeps the sides');
assert.deepEqual(readMarsSettings(null), { gravity: 'mars', caches: 'standard' }, 'no storage reads as the mode rules');
writeSides(null, storage);
memory.set(TEAM_ARRANGEMENT_STORAGE_KEY, '{bad json');
assert.equal(readTeamArrangement('frontline_assault', storage), null, 'a corrupt store reads as defaults');
assert.equal(readTeamArrangement('endless_horde', null), null, 'no storage at all reads as defaults');
// Opponent brain (owner 2026-09-25): one solo setting for every mode, Classic by default, Jev with an optional
// allied side; unknown values keep the current choice, null restores the defaults, a corrupt store reads as defaults
{
  const brainMemory = new Map();
  const brainStorage = { getItem: (key) => brainMemory.get(key) ?? null, setItem: (key, value) => brainMemory.set(key, value) };
  assert.deepEqual(DEFAULT_BRAIN_SETTINGS, { opponent: 'classic', allies: false });
  assert.deepEqual(readBrainSettings(brainStorage), DEFAULT_BRAIN_SETTINGS, 'nothing stored reads as the classic brain');
  assert.deepEqual(readBrainSettings(null), DEFAULT_BRAIN_SETTINGS, 'no storage at all reads as the classic brain');
  assert.ok(isBotBrainId('jev') && isBotBrainId('classic') && !isBotBrainId('gpt') && !isBotBrainId(null));
  assert.deepEqual(writeBrainSettings({ opponent: 'jev' }, brainStorage), { opponent: 'jev', allies: false });
  assert.deepEqual(writeBrainSettings({ allies: true }, brainStorage), { opponent: 'jev', allies: true }, 'one field at a time');
  assert.deepEqual(JSON.parse(brainMemory.get(BRAIN_STORAGE_KEY)), { opponent: 'jev', allies: true });
  assert.deepEqual(writeBrainSettings({ opponent: 'skynet' }, brainStorage), { opponent: 'jev', allies: true }, 'unknown ids keep the current choice');
  assert.deepEqual(writeBrainSettings({ opponent: 'classic' }, brainStorage), { opponent: 'classic', allies: false },
    'the classic brain never commands the allies: the flag reads false while classic is chosen');
  assert.deepEqual(JSON.parse(brainMemory.get(BRAIN_STORAGE_KEY)), { opponent: 'classic', allies: true }, 'the stored flag survives for the next Jev choice');
  assert.deepEqual(writeBrainSettings({ opponent: 'jev' }, brainStorage), { opponent: 'jev', allies: true });
  assert.deepEqual(writeBrainSettings(null, brainStorage), DEFAULT_BRAIN_SETTINGS, 'null restores the defaults');
  brainMemory.set(BRAIN_STORAGE_KEY, '{bad json');
  assert.deepEqual(readBrainSettings(brainStorage), DEFAULT_BRAIN_SETTINGS, 'a corrupt store reads as the classic brain');
  assert.equal(TEAM_ARRANGEMENT_STORAGE_KEY !== BRAIN_STORAGE_KEY, true, 'the brain has its own key');
}
console.log(`teamArrangement: ${ENEMY_NATION_OPTIONS.length} nation options cover ${fleetNations.size} fleet nations; per-mode store round-trips clamped values PASS`);
