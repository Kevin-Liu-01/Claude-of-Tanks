// The envelope census's rules and allowance (264, envelope honesty; tools/envelope-census.mjs tells the OTCO story).
// 1. The rule on synthetic frames: a thin rail or a small fitting more than 5 cm past the authored main plates flags,
//    exactly 5 cm does not, a big thick part never does, and the growth is the box's shrink without the flagged parts
//    on each of side, front and rear.
// 2. The ratchet: an unlisted flagging frame, one more part than its row or growth past its row's 1 cm slack is an
//    offender; fewer parts, less growth or none is a row to lower; lowering never raises a row and keeps its reason.
// 3. The committed allowance is canonical, stamped with the tank id schema and the rule, and names only calibrated
//    tanks; its reasons are words. The four fleet shards partition the roster.
// 4. A live control on the real factory, in measurement mode: one tank's frame with a 40 cm rail drawn into it past
//    its plates flags exactly that rail, and its growth is the rail's reach.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ENVELOPE_ALLOWANCE, ENVELOPE_RULE, GROWTH_SLACK_M, allowanceEntry, frameCensus, judgeEnvelopes, lowerAllowance,
  mainPlateBox, readAllowance, serializeAllowance, shardIds,
} from './envelope-census.mjs';
import { readCommittedCalibrations } from './anatomy-floor-ledger.mjs';
import { TANK_ID_SCHEMA } from '../src/vehicles/tankIdAliases.ts';

// ---------------------------------------------------------------- 1. the rule
const box = (x0, y0, z0, x1, y1, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
// a 2 x 3 m plate box (x +-1, z +-1.5), the turret body drawn exactly on it
const quad = (x0, z0, x1, z1, y = 0) => ({ verts: [[x0, y, z0], [x1, y, z0], [x1, y + 0.8, z1], [x0, y + 0.8, z1]] });
const plates = [quad(-1, -1.5, 1, 1.5), { ...quad(-3, -3, 3, 3), kind: 'era' }];
assert.deepEqual(mainPlateBox(plates), box(-1, 0, -1.5, 1, 0.8, 1.5), 'only main plates make the plate box');
const body = box(-1, 0, -1.5, 1, 0.8, 1.5);
const rail = (reach) => box(-0.4, 0.5, -1.5 - reach, 0.4, 0.55, -1.5);            // a 5 cm rail standing out behind
{
  const census = frameCensus([body, rail(0.40)], plates);
  assert.equal(census.flagged.length, 1, 'a thin rail 40 cm past the plates flags');
  assert.deepEqual(census.growth, { side: 0, front: 0, rear: 0.4 }, 'its growth is its reach, at the rear');
  assert.deepEqual(census.env, [2, 3.4]);
  assert.deepEqual(census.without, [2, 3]);
  assert.deepEqual(allowanceEntry(census), [1, 0.4]);
}
assert.equal(frameCensus([body, rail(0.05)], plates).flagged.length, 0, 'exactly 5 cm past does not flag');
assert.equal(frameCensus([body, rail(0.051)], plates).flagged.length, 1, '5.1 cm past flags');
{
  // a thick block (60 x 50 x 40 cm, 2.5% of the body's volume) at the front: not thin, not small
  const block = box(-0.3, 0.2, 1.5, 0.3, 0.7, 1.9);
  assert.equal(frameCensus([body, block], plates).flagged.length, 0, 'a big thick part is never flagged');
  // a small fitting (10 cm cube, under 2% of the body) at the side
  const fitting = box(1.0, 0.3, 0, 1.1, 0.4, 0.1);
  const census = frameCensus([body, block, fitting], plates);
  assert.equal(census.flagged.length, 1, 'a small fitting past the plates flags');
  assert.deepEqual(census.growth, { side: 0.1, front: 0, rear: 0 }, 'side growth from either flank');
}
assert.equal(frameCensus([body], plates), null, 'a lone part is the frame itself: nothing to judge');
assert.equal(frameCensus([body, rail(0.4)], [{ ...quad(-1, -1, 1, 1), kind: 'era' }]), null, 'no main plates: nothing to judge');

// ---------------------------------------------------------------- 2. the ratchet
const frames = (turret, hull = null) => ({ turret, hull });
const measured = {
  quiet: frames(frameCensus([body, rail(0.02)], plates)),
  railed: frames(frameCensus([body, rail(0.40)], plates)),
};
const allowance = (rows) => ({ schema: 1, tankIdSchema: TANK_ID_SCHEMA, rule: ENVELOPE_RULE, about: 'fixture', rows });
{
  const { offenders, shrinks } = judgeEnvelopes(measured, allowance({}));
  assert.deepEqual(offenders.map((o) => `${o.id}/${o.frame}`), ['railed/turret'], 'an unlisted flagging frame is an offender');
  assert.equal(shrinks.length, 0);
}
assert.equal(judgeEnvelopes(measured, allowance({ railed: { turret: [1, 0.4] } })).offenders.length, 0, 'its row admits it');
assert.equal(judgeEnvelopes(measured, allowance({ railed: { turret: [0, 0.4] } })).offenders.length, 1, 'one more part than the row');
assert.equal(judgeEnvelopes(measured, allowance({ railed: { turret: [1, 0.4 - GROWTH_SLACK_M + 0.001] } })).offenders.length, 0,
  'growth inside the 1 cm slack passes');
assert.equal(judgeEnvelopes(measured, allowance({ railed: { turret: [1, 0.38] } })).offenders.length, 1, 'growth past the slack fails');
{
  const { offenders, shrinks } = judgeEnvelopes(measured, allowance({ railed: { turret: [3, 0.4] }, quiet: { hull: [2, 0.2, 'reason'] } }));
  assert.equal(offenders.length, 0);
  assert.deepEqual(shrinks.map((s) => `${s.id}/${s.frame}`).sort(), ['quiet/hull', 'railed/turret'], 'fewer parts or none: lower the row');
}
assert.equal(judgeEnvelopes(measured, allowance({ railed: { turret: [1, 0.6] } })).shrinks.length, 1, 'less growth: lower the row');
{
  const committed = allowance({ railed: { turret: [3, 0.6, 'real armour'], hull: [1, 0.1] }, quiet: { turret: [2, 0.2] } });
  const changed = lowerAllowance(committed, measured, ['railed', 'quiet']);
  assert.deepEqual(committed.rows, { railed: { turret: [1, 0.4, 'real armour'] } }, 'lowered rows keep their reason; empty ids go');
  assert.equal(changed.length, 3);
  const raised = allowance({ railed: { turret: [0, 0.1] } });
  assert.deepEqual(lowerAllowance(raised, measured, ['railed']), [], 'lowering never raises a row (the offender stays one)');
  assert.deepEqual(raised.rows, { railed: { turret: [0, 0.1] } });
}

// ---------------------------------------------------------------- 3. the committed allowance
const committed = readAllowance();
assert.equal(serializeAllowance(committed), readFileSync(ENVELOPE_ALLOWANCE, 'utf8'),
  `${ENVELOPE_ALLOWANCE} is in its canonical one-row-per-id form (write it only through tools/envelope-census.mjs)`);
assert.equal(committed.tankIdSchema, TANK_ID_SCHEMA, 'keyed by the current tank id schema');
assert.deepEqual(committed.rule, { ...ENVELOPE_RULE }, 'the allowance states the rule it was measured with');
const calibrated = new Set(Object.keys(readCommittedCalibrations()));
for (const [id, row] of Object.entries(committed.rows)) {
  assert.ok(calibrated.has(id), `${id}: an allowance row for a calibrated tank (retired or renamed? drop or re-key it)`);
  for (const [frame, entry] of Object.entries(row)) {
    assert.ok(frame === 'turret' || frame === 'hull', `${id}: frames are turret and hull`);
    const [parts, growth, reason] = entry;
    assert.ok(Number.isInteger(parts) && parts > 0, `${id} ${frame}: a row admits one part or more`);
    assert.ok(Number.isFinite(growth) && growth >= 0, `${id} ${frame}: a growth in metres`);
    if (entry.length > 2) assert.ok(typeof reason === 'string' && reason.trim().length > 10, `${id} ${frame}: a reason in words`);
    assert.ok(entry.length <= 3, `${id} ${frame}: [parts, growth, reason?]`);
  }
}
{
  const roster = [...calibrated].sort();
  const shards = [1, 2, 3, 4].map((index) => shardIds(roster, index, 4));
  assert.deepEqual(shards.flat().sort(), roster, 'the four shards cover the roster exactly once');
  assert.ok(Math.max(...shards.map((s) => s.length)) - Math.min(...shards.map((s) => s.length)) <= 1, 'balanced shards');
}

// ---------------------------------------------------------------- 4. the live control
{
  const { loadMeasurementFleet, measureEnvelope } = await import('./envelope-census.mjs');
  const measurementFleet = await loadMeasurementFleet();
  const id = 't90';
  const plain = measureEnvelope(id, measurementFleet);
  assert.ok(plain.turret && plain.hull, `${id}: both frames measured`);
  // the control: a 40 cm long, 3 cm thick rail added to the turret bucket's receipts, standing 40 cm ahead of the turret's
  // furthest part (the T-90's cast front already stands past its plates; behind, its plates reach 42 cm past the bustle)
  const railed = measureEnvelope(id, measurementFleet, {
    edit: (tank) => {
      const parts = tank.root.userData.combatGeometryParts;
      const turret = parts.filter((part) => part.bucket === 'turret');
      const front = Math.max(...turret.map((part) => part.max[2]));
      parts.push({ bucket: 'turret', parent: 'turretG', min: [-0.2, 0.3, front], max: [0.2, 0.33, front + 0.4], module: null });
    },
  });
  assert.equal(railed.turret.flagged.length, plain.turret.flagged.length + 1, `${id}: the drawn rail flags, and nothing else changes`);
  assert.ok(Math.abs(railed.turret.growth.front - 0.4) < 0.002, `${id}: its growth is the rail's 40 cm reach (${railed.turret.growth.front})`);
  assert.deepEqual(railed.hull, plain.hull, `${id}: the hull frame is untouched`);
}

console.log('envelope-census.selftest: the rule on synthetic frames, the shrinking allowance, the committed allowance and shards, '
  + 'a rail drawn into a real turret PASS');
