// The sim-floor drift receipt (227, the guards stream; tools/anatomy-floor-ledger.mjs tells the 226 story).
// 1. The committed combat-anatomy calibration holds every tank's belly pan, track bottom and combat hull box within
//    5 cm of docs/geometry-gate/sim-floors.json, and the ledger covers exactly the calibrated ids. Data only: no tank
//    is built unless one drifted, and then only that one, to name the parts responsible in the failure.
// 2. The rules, on the 226 defect class seeded into t90am's committed row: the blade's regen (floor and belly pan
//    0.42 -> ~0.2) fails on exactly those two fields; the MP lane's half fix (belly pan only) fails on the pan; 5 cm
//    passes and 5.1 cm fails; every hull face, the turret floor and the track bottom is gated; accepts need a reason
//    and record the old values; new and retired ids fail until recorded; a calibrated tank whose row went missing is
//    never re-seeded as a "first measurement" (the round-1 critic's laundering case).
// 3. Culprit ranking and author sites on a synthetic 226 blade: the structural blade is named for the hull floor,
//    the centre-spanning visible parts for the belly pan, never a one-sided bracket or a hidden proxy.
// 4. gen-combat-anatomy runs the same gate on its fresh measurement in both modes (a wiring check on its source).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLOOR_DRIFT_TOLERANCE_M, FLOOR_FIELDS, SIM_FLOOR_LEDGER, acceptFloorRows, authorSite, compareFloorRows, fieldValue,
  floorRowOf, formatFloorDrift, parseFloorAccepts, parseStackFrames, rankFloorCulprits, readCommittedCalibrations,
  readFloorLedger, seedFloorRows, serializeFloorLedger,
} from './anatomy-floor-ledger.mjs';

// ---------------------------------------------------------------- 1. the committed fleet against its ledger
const calibrations = readCommittedCalibrations();
const fleetIds = Object.keys(calibrations).sort();
const ledger = readFloorLedger();
assert.equal(serializeFloorLedger(ledger), readFileSync(SIM_FLOOR_LEDGER, 'utf8'),
  `${SIM_FLOOR_LEDGER} is in its canonical one-row-per-id form (write it only through tools/anatomy-floor-drift.mjs)`);
assert.equal(ledger.toleranceM, FLOOR_DRIFT_TOLERANCE_M, 'the ledger states the gate\'s tolerance');
const current = Object.fromEntries(fleetIds.map((id) => [id, floorRowOf(calibrations[id], id)]));
const fleet = compareFloorRows(ledger.rows, current, { ids: fleetIds, fleetIds });
if (!fleet.ok) {
  const lines = [];
  if (fleet.drifts.size) {
    const { blameFloorDrift } = await import('./anatomy-floor-blame.mjs');
    for (const [id, moved] of fleet.drifts) {
      let culprits = null;
      try { culprits = blameFloorDrift(id, moved); } catch (error) { lines.push(`  ${id}: blame build failed: ${error.message}`); }
      lines.push(...formatFloorDrift(id, moved, culprits));
    }
  }
  if (fleet.missing.length) lines.push(`  no ledger row: ${fleet.missing.join(', ')}`);
  if (fleet.extra.length) lines.push(`  rows for ids no longer calibrated: ${fleet.extra.join(', ')}`);
  assert.fail(`the committed combat anatomy moved a sim floor or hull face over ${FLOOR_DRIFT_TOLERANCE_M * 100} cm, `
    + `or the ledger does not cover the fleet:\n${lines.join('\n')}\n  Fix the geometry, or record an intended move: `
    + 'node tools/anatomy-floor-drift.mjs --accept=<ids>:<what moved and why>');
}
assert.ok(fleetIds.length >= 200, `the calibration covers the fleet (${fleetIds.length} ids)`);

// ---------------------------------------------------------------- 2. the rules, on the 226 defect class
const BASE_ID = 't90am';
const base = current[BASE_ID];
assert.ok(base && base.panYM > 0.35 && base.hullMin[1] > 0.35, `${BASE_ID} keeps its belly above 0.35 m in the committed tree`);
assert.ok(Number.isFinite(base.turretMinY), `${BASE_ID} has a fighting turret whose floor the ledger holds`);
const clone = (value) => JSON.parse(JSON.stringify(value));
const variant = (patch) => {
  const row = clone(base);
  if ('panYM' in patch) row.panYM = patch.panYM;
  if ('bottomYM' in patch) row.bottomYM = patch.bottomYM;
  for (const [axis, value] of Object.entries(patch.hullMin ?? {})) row.hullMin[axis] = value;
  for (const [axis, value] of Object.entries(patch.hullMax ?? {})) row.hullMax[axis] = value;
  if ('turretMinY' in patch) row.turretMinY = patch.turretMinY;
  return row;
};
const recordedOnly = { [BASE_ID]: base };
const moved = (row) => {
  const result = compareFloorRows(recordedOnly, { [BASE_ID]: row }, { ids: [BASE_ID] });
  return (result.drifts.get(BASE_ID) ?? []).map(({ field }) => field.key).sort();
};
const y = base.hullMin[1];
const cases = [
  ['the committed row itself', {}, []],
  ['the 226 regen (bacd46c57 blade in \'hull\'): floor 0.42 -> 0.1995, pan 0.42 -> 0.198',
    { panYM: 0.198, hullMin: { 1: 0.1995 } }, ['hullFloorY', 'panYM']],
  ['the MP lane\'s half fix (blade in \'hullEquipment\'): the pan alone', { panYM: 0.198 }, ['panYM']],
  ['the floor 4.9 cm lower', { hullMin: { 1: y - 0.049 } }, []],
  ['the floor exactly 5 cm lower', { hullMin: { 1: y - 0.05 } }, []],
  ['the floor 5.1 cm lower', { hullMin: { 1: y - 0.051 } }, ['hullFloorY']],
  ['the floor 5.1 cm higher (a belly plate removed)', { hullMin: { 1: y + 0.051 } }, ['hullFloorY']],
  ['the pan 6 cm higher', { panYM: base.panYM + 0.06 }, ['panYM']],
  ['the pan gone (null)', { panYM: null }, ['panYM']],
  ['the track bottom 6 cm lower', { bottomYM: base.bottomYM - 0.06 }, ['bottomYM']],
  ['the roof 6 cm higher', { hullMax: { 1: base.hullMax[1] + 0.06 } }, ['hullRoofY']],
  ['the -x side 6 cm out', { hullMin: { 0: base.hullMin[0] - 0.06 } }, ['hullMinX']],
  ['the +x side 6 cm in', { hullMax: { 0: base.hullMax[0] - 0.06 } }, ['hullMaxX']],
  ['the tail 6 cm out', { hullMin: { 2: base.hullMin[2] - 0.06 } }, ['hullTailZ']],
  ['the bow 6 cm out', { hullMax: { 2: base.hullMax[2] + 0.06 } }, ['hullBowZ']],
  ['a part hung 6 cm under the turret (its combat box floor drops)', { turretMinY: base.turretMinY - 0.06 }, ['turretFloorY']],
  ['the turret floor exactly 5 cm lower', { turretMinY: base.turretMinY - 0.05 }, []],
  ['the turret box gone (a casemate helper: null)', { turretMinY: null }, ['turretFloorY']],
];
for (const [label, patch, expected] of cases) assert.deepEqual(moved(variant(patch)), expected, label);
assert.deepEqual(FLOOR_FIELDS.map((field) => field.key).sort(),
  ['bottomYM', 'hullBowZ', 'hullFloorY', 'hullMaxX', 'hullMinX', 'hullRoofY', 'hullTailZ', 'panYM', 'turretFloorY'],
  'every gated field has a case above');
{
  const within = compareFloorRows(recordedOnly, { [BASE_ID]: variant({ hullMin: { 1: y - 0.02 } }) }, { ids: [BASE_ID] });
  assert.ok(within.ok && within.within.includes(BASE_ID), 'a move under the tolerance passes and is reported');
}

// coverage: a new id without a row, a row whose id left the fleet; a subset check never judges the rest
{
  const result = compareFloorRows({ [BASE_ID]: base, retired_tank: base }, { [BASE_ID]: base, new_tank: base },
    { ids: [BASE_ID, 'new_tank'], fleetIds: [BASE_ID, 'new_tank'] });
  assert.deepEqual([result.ok, result.missing, result.extra], [false, ['new_tank'], ['retired_tank']], 'new and retired ids fail');
  const subset = compareFloorRows({ [BASE_ID]: base, retired_tank: base }, { [BASE_ID]: base }, { ids: [BASE_ID] });
  assert.ok(subset.ok, 'a per-id check (--ids) judges only its ids');
}

// accept: a reason is required; the row takes the new values and keeps the old ones in its note
assert.throws(() => parseFloorAccepts(['--accept=t90am:blade'], {}), /at least 12 characters/, 'a one-word reason is refused');
assert.throws(() => parseFloorAccepts(['--accept=:blade re-seated above the belly'], {}), /write <id>/, 'an accept names its ids');
assert.deepEqual(parseFloorAccepts(['--accept-floor=t90am,t90m_proryv:blade re-seated above the belly'], {
  COT_ACCEPT_FLOOR_DRIFT: 'leo2_improved:hull rebuilt to the 2026 survey; ; abramsx:skirt line lowered on purpose',
}, '--accept-floor='), [
  { ids: ['t90am', 't90m_proryv'], reason: 'blade re-seated above the belly' },
  { ids: ['leo2_improved'], reason: 'hull rebuilt to the 2026 survey' },
  { ids: ['abramsx'], reason: 'skirt line lowered on purpose' },
], 'flags and the environment both reach the gate');
{
  const drifted = clone(calibrations[BASE_ID]);
  drifted.trackContact.panYM = 0.198;
  drifted.hull.min[1] = 0.1995;
  const book = { rows: { [BASE_ID]: clone(base) } };
  const accepts = [{ ids: [BASE_ID], reason: 'the 226 blade, accepted for this proof' }];
  const first = acceptFloorRows(book, { [BASE_ID]: drifted }, accepts, { by: 'selftest', date: '2026-10-16' });
  assert.deepEqual(first, { changed: [BASE_ID], unchanged: [] });
  const row = book.rows[BASE_ID];
  assert.equal(fieldValue(row, FLOOR_FIELDS.find((f) => f.key === 'hullFloorY')), 0.1995);
  assert.deepEqual(row.accepted, { reason: 'the 226 blade, accepted for this proof', by: 'selftest', date: '2026-10-16',
    from: { panYM: base.panYM, hullFloorY: base.hullMin[1] } }, 'the note keeps the old values of the fields that moved');
  assert.ok(compareFloorRows(book.rows, { [BASE_ID]: floorRowOf(drifted) }, { ids: [BASE_ID] }).ok, 'an accepted move passes');
  assert.deepEqual(acceptFloorRows(book, { [BASE_ID]: drifted }, accepts), { changed: [], unchanged: [BASE_ID] },
    'accepting a current row changes nothing');
  const committed = { [BASE_ID]: calibrations[BASE_ID] };
  const seeded = seedFloorRows(book, { [BASE_ID]: calibrations[BASE_ID], new_tank: calibrations[BASE_ID] }, [BASE_ID, 'new_tank'],
    { committed, by: 'selftest', date: '2026-10-16' });
  assert.deepEqual(seeded, { seeded: ['new_tank'], refused: [] }, 'only a new id is seeded');
  assert.equal(book.rows[BASE_ID].accepted.reason, 'the 226 blade, accepted for this proof', 'seeding never touches a row');
  assert.equal(book.rows.new_tank.accepted.reason, 'first measurement');
  // The round-1 critic's laundering case: t90am's row removed, then a regen carrying the 226 blade. The calibration on
  // disk has measured t90am, so the write mode refuses to seed it; the row stays missing and the regen fails.
  const lost = { rows: {} };
  const refusal = seedFloorRows(lost, { [BASE_ID]: drifted }, [BASE_ID], { committed, by: 'selftest', date: '2026-10-19' });
  assert.deepEqual(refusal, { seeded: [], refused: [BASE_ID] }, 'a calibrated tank without a row is refused, never seeded');
  assert.equal(lost.rows[BASE_ID], undefined, 'the refused row is not written');
  const judged = compareFloorRows(lost.rows, { [BASE_ID]: floorRowOf(drifted) }, { ids: [BASE_ID] });
  assert.deepEqual([judged.ok, judged.missing], [false, [BASE_ID]], 'the missing row fails the regen');
  const against = compareFloorRows({ [BASE_ID]: floorRowOf(calibrations[BASE_ID]) }, { [BASE_ID]: floorRowOf(drifted) }, { ids: [BASE_ID] });
  assert.deepEqual((against.drifts.get(BASE_ID) ?? []).map(({ field }) => field.key).sort(), ['hullFloorY', 'panYM'],
    'and the comparison with the committed calibration names the blade\'s drift');
  assert.throws(() => seedFloorRows(lost, {}, [], {}), /committed calibration/, 'the seed cannot run without the committed rows');
}

// ---------------------------------------------------------------- 3. culprits and author sites
{
  const part = (bucket, min, max, flags) => ({ bucket, module: null, min, max, site: `${bucket}@profiles/t90.ts:1`, caller: null,
    structural: false, primary: false, centreSpanning: true, visible: true, ...flags });
  const parts = [
    part('hull', [-1.0, 0.42, -3.9], [1.0, 1.6, 3.9], { structural: true, primary: true }),          // the belly and body
    part('hull', [-1.12, 0.1995, 2.95], [1.12, 0.336, 3.0], { structural: true }),                     // the 226 blade
    part('hullEquipment', [-1.12, 0.199, 2.9], [1.12, 0.46, 2.99], {}),                                // the half-fixed blade
    part('gearSkirtL', [-1.8, 0.15, -3.0], [-1.6, 0.9, 3.0], { centreSpanning: false }),               // one-sided
    part('hullShadow', [-1.0, 0.0, -3.0], [1.0, 0.4, 3.0], { visible: false }),                        // hidden proxy
    part('hull', [-0.2, 1.6, 0.0], [0.2, 1.75, 0.3], { structural: true }),                            // a small roof box
  ];
  const field = (key) => FLOOR_FIELDS.find((f) => f.key === key);
  const floor = rankFloorCulprits(field('hullFloorY'), 0.42, 0.1995, parts);
  assert.deepEqual(floor.parts.map((p) => p.bucket), ['hull'], 'the hull floor names the structural blade only');
  assert.equal(floor.parts[0].min[1], 0.1995);
  const pan = rankFloorCulprits(field('panYM'), 0.42, 0.199, parts);
  assert.deepEqual(pan.parts.map((p) => p.bucket), ['hullEquipment', 'hull'],
    'the belly pan names the visible centre-spanning parts below it, lowest first; never a skirt or a hidden proxy');
  const risen = rankFloorCulprits(field('hullFloorY'), 0.30, 0.42, parts);
  assert.ok(risen.note && risen.parts.length === 1 && risen.parts[0].min[1] === 0.42,
    'a floor that rose names what it rests on now, with a note that the old floor part left');
  const turretParts = [
    part('turret', [-1.1, 0.0, -1.5], [1.1, 0.75, 1.4], { turretStructural: true }),                  // the turret shell
    part('turret', [-0.4, -0.31, -1.2], [0.4, 0.0, -0.9], { turretStructural: true }),                // hung under it
    part('turretEquipment', [-0.6, -0.4, 1.0], [0.6, -0.1, 1.2], {}),                                 // not structural
  ];
  const turretFloor = rankFloorCulprits(field('turretFloorY'), 0.0, -0.31, turretParts);
  assert.deepEqual(turretFloor.parts.map((p) => p.min[1]), [-0.31], 'the turret floor names the structural turret part below it only');
  const roof = rankFloorCulprits(field('hullRoofY'), 1.5, 1.6, parts);
  assert.deepEqual(roof.parts.map((p) => p.max[1]), [1.6], 'the roof reads only the primary parts (the roof cap), never a small box');
  const text = formatFloorDrift(BASE_ID, [{ field: field('hullFloorY'), from: 0.42, to: 0.1995, delta: -0.2205 }],
    new Map([['hullFloorY', floor]])).join('\n');
  assert.match(text, /combat hull floor \(hull\.min\[1\]\) 0\.42 -> 0\.1995 \(-0\.2205 m\)/);
  assert.match(text, /hull part, y 0\.200, .* at hull@profiles\/t90\.ts:1/, 'the failure names the part and its author site');
}
{
  const stack = [
    'Error',
    '    at partCensus (file:///repo/tools/anatomy-floor-blame.mjs:60:5)',
    '    at Object.add (file:///repo/src/vehicles/tankFactoryCore.ts:7448:7)',
    '    at plateSlab (file:///repo/src/vehicles/profiles/t90.ts:7685:9)',
    '    at buildT90MProryvNative2026 (file:///repo/src/vehicles/profiles/t90.ts:7691:5)',
    '    at build (file:///repo/src/vehicles/profiles/t90.ts:166:3)',
    '    at createTank (file:///repo/src/vehicles/tankFactoryCore.ts:7600:3)',
  ].join('\n');
  assert.deepEqual(authorSite(parseStackFrames(stack)), {
    site: 'plateSlab@profiles/t90.ts:7685', caller: 'buildT90MProryvNative2026@profiles/t90.ts:7691',
  }, 'the author is the innermost profile frame past the factory plumbing');
  assert.deepEqual(authorSite(parseStackFrames('Error\n    at x (file:///repo/src/vehicles/tankFactoryCore.ts:1:1)')),
    { site: null, caller: null }, 'no profile frame, no site');
}

// ---------------------------------------------------------------- 4. the regen and its --check run the gate
{
  const generator = readFileSync(new URL('./gen-combat-anatomy.mjs', import.meta.url), 'utf8');
  for (const [needle, why] of [
    ['compareFloorRows(', 'compares its fresh measurement with the ledger'],
    ["parseFloorAccepts(process.argv, process.env, '--accept-floor=')", 'takes accepts from its flag and the environment'],
    ['seedFloorRows(floorLedger, rows, measuredIds, { committed: committedFloorRows', 'seeds only a never-calibrated id in the write mode'],
    ['const committedFloorRows = readCommittedCalibrations()', 'reads the calibration on disk before it writes'],
    ["await import('./anatomy-floor-blame.mjs')", 'names the parts behind a drift'],
    ['process.exit(3)', 'stops the regen chain after writing when a floor moved'],
    ['if (floorReport.length) process.exit(2)', 'fails its --check when a floor moved'],
  ]) assert.ok(generator.includes(needle), `gen-combat-anatomy ${why}`);
}

console.log(`anatomy-floor-drift.selftest: ${fleetIds.length} ids within ${FLOOR_DRIFT_TOLERANCE_M * 100} cm of ${SIM_FLOOR_LEDGER}; `
  + `${cases.length} seeded drift cases (the 226 blade fails on the floor and the belly pan; the turret floor is gated); `
  + 'accept, coverage, no-laundering seed, culprit and author-site rules hold; gen-combat-anatomy gates both modes');
