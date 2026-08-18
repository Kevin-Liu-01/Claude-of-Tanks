import assert from 'node:assert/strict';
import {
  COLD_WAR_IDS,
  RETAINED_COLD_WAR_IDS,
  RETAINED_WW2_IDS,
  historicalRosterClass,
  isRetiredHistoricalTank,
} from './rosterPolicy.js';

const retainedWw2 = new Set(RETAINED_WW2_IDS);
const retainedColdWar = new Set(RETAINED_COLD_WAR_IDS);

assert.ok(
  retainedColdWar.has('vickers_mk1'),
  'Vickers MBT Mk 1 remains in the playable Cold War runtime roster',
);

for (const id of retainedWw2) {
  assert.equal(isRetiredHistoricalTank({ id, era: 'ww2' }), false, `${id} stays selectable`);
}
for (const id of COLD_WAR_IDS) {
  assert.equal(
    isRetiredHistoricalTank({ id, era: id === 't95' ? 'ww2' : 'modern' }),
    !retainedColdWar.has(id),
    `${id} follows the Cold War exception policy`,
  );
}

assert.equal(isRetiredHistoricalTank({ id: 'm4a3e8', era: 'ww2' }), true);
assert.equal(isRetiredHistoricalTank({ id: 'tiger2', era: 'ww2' }), true);
assert.equal(isRetiredHistoricalTank({ id: 'm1a2', era: 'modern' }), false);
assert.equal(isRetiredHistoricalTank({ id: 't80u', era: 'modern' }), false);
assert.equal(historicalRosterClass({ id: 't95', era: 'ww2' }), 'coldwar');
assert.equal(historicalRosterClass({ id: 'tiger1', era: 'ww2' }), 'ww2');
assert.equal(historicalRosterClass({ id: 't90m', era: 'modern' }), 'modern');

console.log(
  `rosterPolicy.selftest: ${retainedWw2.size} WWII and ${retainedColdWar.size} Cold War exceptions retained`,
);
