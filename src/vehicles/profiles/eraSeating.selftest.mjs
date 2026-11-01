import assert from 'node:assert/strict';
import { TANK_SPECS } from '../specs.ts';
import { KNOWN_ERA_DISAGREEMENTS, drawnEraOf, eraAgreement, eraDisagreement, eraPlateNames } from './eraAgreement.test-support.mjs';

// 267 (Main's tanks-suite triage, ruled "armour and visuals agree in both directions"): an id's gameplay ERA plates and
// the ERA clusters its build draws are the same set. A spec ERA plate with nothing drawn on it is armour a player cannot
// see (the T-90AM carried the Proryv's skirt and turret-flank Relikt plates over a T-90SM build that draws neither);
// drawn ERA with no plate under it is armour that stops nothing (the T-90MS obr. 2011's turret-flank K-5 boxes).
// t90MarkFrames.ts agreeDrawnEra settles both. Default tier (Main 2026-11-01, the owner's lean default): the two negative
// controls and the held disagreements; the whole fleet is the manual fleet suite's (eraSeatingFleet.selftest.mjs), and
// lane mode runs the per-tank pins naming a changed id (eraSeatingPins.selftest.mjs).

// The two ids this rule was written for agree now.
const drawn = { t90am: drawnEraOf('t90am'), t90ms_2011: drawnEraOf('t90ms_2011') };
for (const id of Object.keys(drawn)) assert.equal(eraDisagreement(id, drawn[id]), null, `${id}: its ERA plates and its drawn ERA agree`);

// Negative controls, one per direction, on those two disagreements as they stood: the check must name them. The
// T-90AM's plates before the ruling were its donor record's (armorT90M; the T-90M Proryv still carries it whole),
// against the T-90SM build the T-90AM draws; the obr. 2011's plates without the Tagil flank pair, against the flank boxes
// it draws.
assert.deepEqual(eraAgreement(eraPlateNames(TANK_SPECS.t90m_proryv), drawn.t90am),
  { specUndrawn: ['side_era_L', 'side_era_R', 'skirt_era_L', 'skirt_era_R'], drawnUnspecced: [] },
  'control: the T-90AM\'s former Proryv plates are four spec plates with nothing drawn on them');
assert.deepEqual(eraAgreement(eraPlateNames(TANK_SPECS.t90ms_2011).filter((name) => !/^side_era_/.test(name)), drawn.t90ms_2011),
  { specUndrawn: [], drawnUnspecced: ['side_era_L', 'side_era_R'] },
  'control: the obr. 2011 without its flank plates draws two ERA sectors with no plate under them');

// The ratchet: every held id still disagrees exactly as held (a fixed one must leave the list; none may grow).
for (const [id, held] of Object.entries(KNOWN_ERA_DISAGREEMENTS)) {
  assert.deepEqual(eraDisagreement(id), held, `${id}: held ERA disagreement unchanged (remove it once fixed)`);
}

console.log(`eraSeating.selftest: t90am and t90ms_2011 agree; negative controls (spec-undrawn on the T-90AM's former plates, `
  + `drawn-unspecced on the obr. 2011 without its flank plates) fail as they must; ${Object.keys(KNOWN_ERA_DISAGREEMENTS).length} held`);
