import assert from 'node:assert/strict';
import { ALL_TANK_IDS } from '../specs.ts';
import { KNOWN_ERA_DISAGREEMENTS, eraDisagreement } from './eraAgreement.test-support.mjs';

// 267 (Main's ruling "armour and visuals agree in both directions"; the rule, its negative controls and the held list
// are eraSeating.selftest.mjs's, default tier): every id's gameplay ERA plates and drawn ERA clusters agree both ways,
// or the id is held in KNOWN_ERA_DISAGREEMENTS exactly. Every playable id is built (low quality, about 10 CPU-min), so
// this is the manual fleet suite's (npm run test:heavy -- fleet), not the default tier's.
const found = {};
for (const id of ALL_TANK_IDS) {
  const disagreement = eraDisagreement(id);
  if (disagreement) found[id] = disagreement;
}
const report = Object.entries(found).map(([id, { specUndrawn, drawnUnspecced }]) =>
  `  ${id}: spec plate(s) with nothing drawn [${specUndrawn.join(', ')}]; drawn ERA with no plate [${drawnUnspecced.join(', ')}]`);
assert.deepEqual(found, KNOWN_ERA_DISAGREEMENTS,
  `gameplay ERA and drawn ERA disagree (held: ${Object.keys(KNOWN_ERA_DISAGREEMENTS).length}):\n${report.join('\n')}`);
console.log(`eraSeatingFleet.selftest: ${ALL_TANK_IDS.length} ids' gameplay ERA plates and drawn ERA clusters agree both ways `
  + `(${Object.keys(found).length} held)`);
