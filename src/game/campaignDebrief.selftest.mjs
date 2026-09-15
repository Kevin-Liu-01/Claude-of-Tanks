import assert from 'node:assert/strict';
import { campaignDebrief } from './campaignDebrief.ts';
import { CAMPAIGN_OPERATIONS } from './campaignOperations.ts';

// Batch 19 (2026-09-14): the end screen's campaign block is a pure view of the battle:ended payload.
assert.equal(campaignDebrief(null), null);
assert.equal(campaignDebrief({ gameMode: 'standard', result: 'victory' }), null, 'other modes have no campaign debrief');
assert.equal(campaignDebrief({ gameMode: 'frontline_assault', mapId: 'desert', result: 'victory' }), null, 'a free sortie off the ladder has none');

const held = campaignDebrief({
  gameMode: 'frontline_assault', campaignOperationId: 'iron_ridge', result: 'victory',
  line: { index: 2, total: 3, holdS: 20 }, durationS: 400, timeLimitS: 750, alliesLost: 0,
});
assert.equal(held.operation.id, 'iron_ridge');
assert.equal(held.cleared, true);
assert.equal(held.sectorsTaken, 3, 'a held line counts every sector');
assert.equal(held.sectorsTotal, 3);
assert.equal(held.stars, 3); assert.equal(held.underPar, true); assert.equal(held.noAllyLost, true);
assert.equal(held.parTimeS, Math.round(750 * 0.55));
assert.equal(held.next.id, 'steinburg', 'clearing an operation points at the next one');

const lost = campaignDebrief({
  gameMode: 'frontline_assault', mapId: 'alpine', result: 'defeat', line: { index: 1, total: 3 }, durationS: 750, timeLimitS: 750, alliesLost: 2,
});
assert.equal(lost.operation.id, 'iron_ridge', 'a free sortie on a ladder map resolves the operation by map');
assert.equal(lost.cleared, false); assert.equal(lost.sectorsTaken, 1); assert.equal(lost.stars, 0);
assert.equal(lost.underPar, false); assert.equal(lost.noAllyLost, false);
assert.equal(lost.next.id, 'iron_ridge', 'a lost sortie offers the same operation again');

const last = campaignDebrief({ gameMode: 'frontline_assault', campaignOperationId: CAMPAIGN_OPERATIONS[5].id, result: 'victory', line: { index: 2, total: 3 } });
assert.equal(last.next, null, 'the last operation has no successor');
assert.equal(last.stars, 1, 'no clock or losses known: the held star only');
assert.equal(last.durationS, null); assert.equal(last.alliesLost, null);

const slow = campaignDebrief({ gameMode: 'frontline_assault', campaignOperationId: 'first_light', result: 'victory', line: { index: 2, total: 3 }, durationS: 700, alliesLost: 1 });
assert.equal(slow.stars, 1, 'the operation clock stands in when the payload has none');
assert.equal(slow.underPar, false);
console.log('campaignDebrief.selftest: operation resolution, sectors, stars, par and the ladder successor PASS');
