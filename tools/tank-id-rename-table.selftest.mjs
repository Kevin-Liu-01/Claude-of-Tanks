// Receipt for the tank id rename table's slug engine (SSOT 2.19, ID.01).
// Pure: no fleet load. The owner's example (leo2a6m shows "Leopard 2A4 OTCO",
// the Leopard 2A6M is leo2a6m_x) and the house id style are pinned here.
import assert from 'node:assert/strict';
import { canonicalSlug, nameProblems, planRenames, slugCandidates } from './tank-id-rename-table.mjs';

// Canonical slugs follow the existing id style.
const canonical = {
  'Leopard 2A6M': 'leo2a6m',
  'Leopard 2A4 OTCO': 'leo2a4_otco',
  'T-90AM': 't90am',
  'T-90A obr. 2004': 't90a_2004',
  'T-62MV-1': 't62mv1',
  'T-84BM Oplot-M': 't84bm_oplot_m',
  'ZTZ-85-III': 'ztz85_iii',
  'Type 96-72 Lóng (Concept)': 'type96_72_long',
  'T-72B3M Hetman II (Concept)': 't72b3m_hetman_ii',
  'Challenger 2 (Ukraine)': 'ua_challenger2',
  'PL-01 (105)': 'pl01_105',
  'Merkava Mk 3C': 'merkava_mk3c',
  'Stridsvagn 103B': 'strv103b',
  'Schützenpanzer Puma': 'spz_puma',
  'Upiór IFV': 'upior_ifv',
  'Griffin 50 mm': 'griffin50mm',
};
for (const [name, slug] of Object.entries(canonical)) {
  assert.equal(canonicalSlug(name), slug, `canonical slug of ${name}`);
}

// Accepted spellings: dropped descriptive words, house abbreviations, glued Mk numbers.
const accepts = (name, id) => slugCandidates(name).has(id);
assert.ok(accepts('M60A1 Patton', 'm60a1'));
assert.ok(accepts('Merkava Mk 3C', 'merkava3c'));
assert.ok(accepts('Vickers MBT Mk 1', 'vickers_mk1'));
assert.ok(accepts('Leopard 2 Prototype', 'leopard2_proto'));
assert.ok(accepts('M1A1 SA (Ukraine)', 'ua_m1a1'));
assert.ok(accepts('BMP-3 (ROK)', 'bmp3_rok'));
assert.ok(!accepts('Sabra Mk 2', 'mk2'), 'an Mk number never stands without its family word');
assert.ok(!accepts('Challenger 1 Mk 2', 'challenger1_2'), 'a bare number glues only to a family word');
assert.ok(!accepts('T-80U Bars-M (Concept)', 't80u_m'), 'a hyphenated name is one word');

// The owner's Leopard example, its swap and the claim rule.
const fleet = [
  { id: 'leo2a4_otco', displayName: 'Leopard 2A3' },
  { id: 'leo2a6', displayName: 'Leopard 2A4' },
  { id: 'leo2a6m', displayName: 'Leopard 2A4 OTCO' },
  { id: 'leo2a6m_x', displayName: 'Leopard 2A6M' },
  { id: 'leo2a6_x', displayName: 'Leopard 2A6' },
  { id: 'leo1a5', displayName: 'Leopard 1A5' },
  { id: 'm1a1', displayName: 'M1A1 Abrams' },
  { id: 'm1a2', displayName: 'M1A1 Abrams HC' },
  { id: 't90a', displayName: 'T-90A obr. 2004' },
  { id: 't90a_x', displayName: 'T-90A' },
  { id: 'kf51', displayName: 'KF51 EVO' },
  { id: 'kf51_x', displayName: 'KF51 Panther' },
];
const plan = new Map(planRenames(fleet).map((row) => [row.id, row]));
assert.equal(plan.get('leo2a6m').proposed, 'leo2a4_otco');
assert.equal(plan.get('leo2a6m').reusesRetiredId, 'leo2a4_otco');
assert.equal(plan.get('leo2a6m_x').proposed, 'leo2a6m');
assert.equal(plan.get('leo2a4_otco').proposed, 'leo2a3');
assert.equal(plan.get('leo2a6').proposed, 'leo2a4');
assert.equal(plan.get('leo2a6_x').proposed, 'leo2a6');
assert.equal(plan.get('leo1a5').changes, false);
assert.equal(plan.get('m1a1').changes, false, 'M1A1 Abrams keeps m1a1 (Abrams is a dropped word nobody else claims better)');
assert.equal(plan.get('m1a2').proposed, 'm1a1_abrams_hc');
assert.equal(plan.get('t90a').proposed, 't90a_2004', 'a model year cannot be dropped when the bare id names another vehicle');
assert.equal(plan.get('t90a_x').proposed, 't90a');
assert.equal(plan.get('kf51').proposed, 'kf51_evo', 'a tie between claimants leaves the short id to nobody');

// A proposal never takes an id that stays, and the plan is a bijection.
const rows = [...plan.values()];
const kept = new Set(rows.filter((r) => !r.changes).map((r) => r.id));
const proposed = rows.map((r) => r.proposed);
assert.equal(new Set(proposed).size, proposed.length, 'proposals are unique');
for (const r of rows) if (r.changes) assert.ok(!kept.has(r.proposed), `${r.id} -> ${r.proposed} takes a kept id`);

// Display-name problems.
const problems = nameProblems([
  { id: 'type90', displayName: 'Type 90 (Kyū-maru)', shortName: 'Type 90' },
  { id: 'type90_x', displayName: 'Type 90', shortName: 'Type 90' },
  { id: 'aft10_x', displayName: 'AFT-10 X', shortName: 'AFT-10 X' },
]);
assert.match(problems.get('type90')[0].text, /short name "Type 90" is also the name of type90_x/);
assert.equal(problems.get('aft10_x')[0].suggestedName, 'AFT-10');

console.log('tank-id-rename-table selftest: slug style, claims, the Leopard swap and name problems hold');
