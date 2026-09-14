import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAP_IDS } from '../world/maps/catalog.ts';
import {
  CAMPAIGN_OPERATIONS, CAMPAIGN_OBJECTIVE_KEYS, campaignLadder, campaignOperationById,
  campaignOperationForMap, campaignOperationStatus, campaignSummary,
} from './campaignOperations.ts';

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
assert.deepEqual(campaignSummary(all), { cleared: 6, total: 6, next: CAMPAIGN_OPERATIONS[5] });
assert.deepEqual(campaignSummary(two), { cleared: 2, total: 6, next: CAMPAIGN_OPERATIONS[2] });
assert.deepEqual(campaignSummary(empty), { cleared: 0, total: 6, next: CAMPAIGN_OPERATIONS[0] });
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
