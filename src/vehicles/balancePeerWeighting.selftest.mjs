import assert from 'node:assert/strict';
import { auditFleetBalance } from './balanceAudit.ts';

const row = (id, fireControl, balancePeerOf) => ({
  id, era: 'modern', role: 'mbt', balancePeerOf,
  hp: 2000, enginePowerHp: 1000, weightTons: 50,
  gun: { reloadS: 6, baseAccuracy: 1 / fireControl, aimTimeS: 1,
    shells: [{ dmg: 400, pen100Mm: 600 }] },
});
const specs = Object.fromEntries([1.4, 1.8, 2, 2.2].map((value, i) => [`p${i}`, row(`p${i}`, value)]));
const baseIds = Object.keys(specs), tier = () => 10;
const baseline = auditFleetBalance(baseIds, specs, tier);
assert.deepEqual(baseline, []);
for (let i = 0; i < 40; i++) specs[`visual${i}`] = row(`visual${i}`, 2.2, 'p3');
assert.deepEqual(auditFleetBalance(Object.keys(specs), specs, tier), baseline,
  'any number of equivalent visual rebuilds preserves the original peer median');

specs.visual0.gun.baseAccuracy = 5;
const drift = auditFleetBalance(Object.keys(specs), specs, tier);
assert.ok(drift.some(issue => issue.id === 'visual0' && issue.metric === 'fireControl' && issue.direction === 'low'),
  'an equivalence hint cannot hide changed combat output');
delete specs.visual0;
specs.p0.gun.baseAccuracy = 5;
specs.badCopy = structuredClone(specs.p0);
Object.assign(specs.badCopy, { id: 'badCopy', balancePeerOf: 'p0' });
const badIds = auditFleetBalance(Object.keys(specs), specs, tier).map(issue => issue.id);
assert.ok(badIds.includes('p0') && badIds.includes('badCopy'), 'both copies of an outlier are individually reported');

const small = { a: row('a', .2), b: row('b', 2), c: row('c', 2.2), alias: row('alias', 2.2, 'c') };
assert.deepEqual(auditFleetBalance(Object.keys(small), small, tier), [],
  'visual copies do not manufacture the four-independent-peer minimum');
small.alias.balancePeerOf = 'missing';
assert.ok(auditFleetBalance(Object.keys(small), small, tier).some(issue => issue.id === 'a'),
  'a missing peer cannot remove a vote');
small.alias.balancePeerOf = 'c';
small.c.balancePeerOf = 'alias';
assert.ok(auditFleetBalance(Object.keys(small), small, tier).some(issue => issue.id === 'a'),
  'cycles cannot remove votes');
console.log('balancePeerWeighting: verified visual equivalence preserves medians without hiding individual outliers');
