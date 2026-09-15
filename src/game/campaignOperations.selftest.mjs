import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAP_IDS } from '../world/maps/catalog.ts';
import {
  CAMPAIGN_OPERATIONS, CAMPAIGN_OBJECTIVE_KEYS, CAMPAIGN_ENEMY_NATIONS, campaignLadder, campaignOperationById,
  campaignOperationForMap, campaignOperationStatus, campaignSummary, campaignRulesetInput, campaignEnemyNations,
  campaignNextOperation, campaignParTimeS,
} from './campaignOperations.ts';
import { CAMPAIGN_PAR_SHARE } from './campaignProgress.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';

// The ladder: six operations, unique ids and maps, catalog maps only, 1-based contiguous indices.
assert.equal(CAMPAIGN_OPERATIONS.length, 6);
assert.deepEqual(CAMPAIGN_OPERATIONS.map((operation) => operation.index), [1, 2, 3, 4, 5, 6]);
assert.equal(new Set(CAMPAIGN_OPERATIONS.map((operation) => operation.id)).size, 6, 'operation ids are unique');
assert.equal(new Set(CAMPAIGN_OPERATIONS.map((operation) => operation.mapId)).size, 6, 'one map per operation');
for (const operation of CAMPAIGN_OPERATIONS) {
  assert.ok(MAP_IDS.includes(operation.mapId), `${operation.id}: ${operation.mapId} is a catalog map`);
  assert.ok(['russia', 'germany', 'china', 'usa'].includes(operation.enemy));
  assert.equal(campaignOperationById(operation.id), operation);
  assert.equal(campaignOperationForMap(operation.mapId), operation);
}
assert.equal(campaignOperationById('nope'), null);
// batch 19: difficulty climbs the ladder, the clock tightens, par is a fixed share of the clock, and the
// operation's formation names real spec nations that the ruleset and the roster read
assert.deepEqual(CAMPAIGN_OPERATIONS.map((operation) => operation.difficulty), [1, 2, 3, 4, 5, 6]);
for (let i = 1; i < CAMPAIGN_OPERATIONS.length; i++) {
  assert.ok(CAMPAIGN_OPERATIONS[i].timeLimitS <= CAMPAIGN_OPERATIONS[i - 1].timeLimitS, 'the clock never loosens up the ladder');
}
assert.ok(CAMPAIGN_OPERATIONS.every((operation) => operation.timeLimitS >= 600 && operation.timeLimitS <= 900));
assert.equal(campaignParTimeS(CAMPAIGN_OPERATIONS[1]), Math.round(750 * CAMPAIGN_PAR_SHARE));
assert.deepEqual(campaignRulesetInput('iron_ridge'), { difficulty: 2, timeLimitS: 750 });
assert.equal(campaignRulesetInput(null), null); assert.equal(campaignRulesetInput('nope'), null);
{
  const ruleset = matchRulesetFor('frontline_assault', campaignRulesetInput('delta_crossing'));
  assert.equal(ruleset.timeLimitS, 660, 'the operation clock is the ruleset clock');
  assert.equal(ruleset.assault.extraDefenders, 2, 'operation 6 fields two extra defenders per sector');
  assert.ok(Math.abs(ruleset.assault.difficultyHp - 0.3) < 1e-9);
}
assert.ok(campaignEnemyNations('first_light').includes('Russia') && campaignEnemyNations('first_light').includes('USSR'));
assert.deepEqual(campaignEnemyNations('steinburg'), CAMPAIGN_ENEMY_NATIONS.germany);
assert.deepEqual(campaignEnemyNations(null), []);
assert.equal(campaignNextOperation(CAMPAIGN_OPERATIONS[0]), CAMPAIGN_OPERATIONS[1]);
assert.equal(campaignNextOperation(CAMPAIGN_OPERATIONS[5]), null); assert.equal(campaignNextOperation(null), null);
assert.equal(campaignOperationForMap('desert'), null, 'maps outside the ladder are free sorties');

// Unlock rule over synthetic records: the first is always ready; a cleared operation (last sector held) opens the next.
const empty = { version: 1, frontline: {} };
assert.deepEqual(campaignLadder(empty).map((entry) => entry.status), ['ready', 'locked', 'locked', 'locked', 'locked', 'locked']);
const progress = (held, bestLine = 3) => ({ attempts: 2, bestLine, total: 3, held, lastResult: held ? 'victory' : 'defeat', updatedAt: 1 });
const two = { version: 1, frontline: { verdant: progress(1), alpine: progress(2) } };
assert.deepEqual(campaignLadder(two).map((entry) => entry.status), ['cleared', 'cleared', 'ready', 'locked', 'locked', 'locked']);
const pushedNotHeld = { version: 1, frontline: { verdant: progress(0, 2) } };
assert.deepEqual(campaignLadder(pushedNotHeld).map((entry) => entry.status), ['ready', 'locked', 'locked', 'locked', 'locked', 'locked'],
  'a push that never held the last sector does not clear the operation');
const outOfOrder = { version: 1, frontline: { alpine: progress(1) } };
assert.deepEqual(campaignLadder(outOfOrder).map((entry) => entry.status), ['ready', 'cleared', 'ready', 'locked', 'locked', 'locked'],
  'a free sortie that held a later map counts as cleared and opens the map after it');
assert.equal(campaignOperationStatus(CAMPAIGN_OPERATIONS[5], two), 'locked');
const all = { version: 1, frontline: Object.fromEntries(CAMPAIGN_OPERATIONS.map((operation) => [operation.mapId, progress(1)])) };
assert.deepEqual(campaignSummary(all), { cleared: 6, total: 6, stars: 0, maxStars: 18, next: CAMPAIGN_OPERATIONS[5] });
assert.deepEqual(campaignSummary(two), { cleared: 2, total: 6, stars: 0, maxStars: 18, next: CAMPAIGN_OPERATIONS[2] });
assert.deepEqual(campaignSummary(empty), { cleared: 0, total: 6, stars: 0, maxStars: 18, next: CAMPAIGN_OPERATIONS[0] });
{
  const starred = { version: 2, frontline: { verdant: { ...progress(1), stars: 3 }, alpine: { ...progress(1), stars: 2 } } };
  assert.deepEqual(campaignLadder(starred).map((entry) => entry.stars), [3, 2, 0, 0, 0, 0]);
  assert.equal(campaignSummary(starred).stars, 5, 'the summary totals the stars');
  assert.equal(campaignLadder({ version: 2, frontline: { verdant: { ...progress(1), stars: 7 } } })[0].stars, 3, 'stars clamp at three');
}
assert.ok(Object.isFrozen(CAMPAIGN_OPERATIONS) && CAMPAIGN_OPERATIONS.every((operation) => Object.isFrozen(operation)));

// Copy: every operation has a title and a brief in both catalogs, plus the shared campaign / brief strings.
const en = JSON.parse(fs.readFileSync(new URL('../ui/i18nCatalog.en-US.json', import.meta.url), 'utf8'));
const zh = JSON.parse(fs.readFileSync(new URL('../ui/i18nCatalog.zh-CN.json', import.meta.url), 'utf8'));
const required = [
  'campaign.heading', 'campaign.sub', 'campaign.progress', 'campaign.status.locked', 'campaign.status.ready',
  'campaign.status.cleared', 'campaign.launch', 'campaign.replay', 'campaign.lockedHint', 'campaign.best', 'campaign.noSortie',
  'missionBrief.kicker', 'missionBrief.objectives', 'missionBrief.enemy', 'missionBrief.freeSortie', ...CAMPAIGN_OBJECTIVE_KEYS,
  ...CAMPAIGN_OPERATIONS.flatMap((operation) => [`campaign.op.${operation.id}.title`, `campaign.op.${operation.id}.brief`, `campaign.enemy.${operation.enemy}`]),
  ...CAMPAIGN_OPERATIONS.map((operation) => `map.${operation.mapId}`),
];
for (const key of required) {
  assert.equal(typeof en[key], 'string', `en ${key}`); assert.ok(en[key].length > 0, `en ${key} non-empty`);
  assert.equal(typeof zh[key], 'string', `zh ${key}`); assert.ok(zh[key].length > 0, `zh ${key} non-empty`);
}
for (const operation of CAMPAIGN_OPERATIONS) {
  assert.notEqual(en[`campaign.op.${operation.id}.title`], zh[`campaign.op.${operation.id}.title`], `${operation.id}: title is translated`);
}
console.log('campaignOperations: six-operation ladder, catalog maps, unlock rule over the Frontline record, summary and bilingual copy PASS');
