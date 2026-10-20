// Named carries for the fleet watertight gate (tools/watertight-carry.mjs, test-speed R7c 2026-10-16), without a build:
// the shipped list (docs/geometry-gate/watertight-carry.json) is well formed against the fleet roster, each malformed
// row is caught, and the judge passes a listed leak only at exactly its row and fails a new leak, a grown leak and a
// stale row. The same rules on a real measured build are in src/vehicles/watertightAudit.selftest.mjs; fleetPassDefault
// applies them to the whole fleet.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';
import {
  WATERTIGHT_CARRY_FILE, judgeWatertightCarries, readWatertightCarries, validateWatertightCarries,
} from './watertight-carry.mjs';

const roster = Object.keys(FLEET_GROUP_BY_ID);
const row = (leakL, extra = {}) => ({ cause: 'a negative control row for the carry selftest', date: '2026-10-16', leakL, owner: 'VEHICLES', ...extra });

// 1. the shipped list: every row a fleet id, sorted, at the measurement's resolution, with owner, date and cause
const shipped = readWatertightCarries();
assert.deepEqual(validateWatertightCarries(shipped, roster), [], 'the shipped carry list is well formed');
assert.ok(WATERTIGHT_CARRY_FILE.endsWith('docs/geometry-gate/watertight-carry.json'));

// 2. each malformed row is named (one seeded defect per row)
{
  const problems = validateWatertightCarries({
    t80b: row(6.63),
    ajax: row(0.06),
    no_such_tank: row(1),
    type59: row(0.05),
    k2b: row(5.171),
    leo2a2: row(5.58, { owner: ' ' }),
    leo2a5: row(0.14, { date: '2026-02-30' }),
    m6_linebacker: row(0.31, { cause: 'short' }),
    strv81: row(1.61, { gaps: 11 }),
    bmp3: { leakL: 0.33, owner: 'VEHICLES', date: '2026-10-16' },
    k1e1: [],
  }, roster);
  for (const expected of [
    /^rows are not sorted by id$/, /^no_such_tank: not a fleet id/, /^type59: leakL 0\.05 must be a number of litres above the 0\.05 L gate$/,
    /^k2b: leakL 5\.171 is finer than the measurement's 0\.01 L$/, /^leo2a2: no owner$/, /^leo2a5: date 2026-02-30 is not YYYY-MM-DD$/,
    /^m6_linebacker: no cause$/, /^strv81: fields are cause, date, gaps, leakL, owner/, /^bmp3: fields are date, leakL, owner;/, /^bmp3: no cause$/,
    /^k1e1: the row is not an object$/,
  ]) assert.ok(problems.some((problem) => expected.test(problem)), `${expected} among:\n${problems.join('\n')}`);
  assert.equal(problems.filter((problem) => /^(t80b|ajax):/.test(problem)).length, 0, 'well-formed rows raise nothing');
}

// 3. the judge
const leak = (id, leakL) => ({ id, leakL, text: `${id}: ${leakL} L reaches the deep interior in 1 gap(s)` });
const carries = { leo2a4m: row(7.48), t80b: row(6.63), type59: row(9.78) };
{
  // exactly the row: carried, nothing fails
  const { failures, carried } = judgeWatertightCarries({ leaks: [leak('t80b', 6.63)], watertight: ['jpz_e100'], carries });
  assert.deepEqual(failures, []);
  assert.deepEqual(carried, [{ id: 't80b', leakL: 6.63, carriedL: 6.63 }]);
}
{
  // below the row (229 ratchet): the row must come down to the measurement, so its slack never excuses a regrowth
  const { failures, carried } = judgeWatertightCarries({ leaks: [leak('type59', 9.5), leak('t80b', 6.62)], watertight: [], carries });
  assert.deepEqual(failures, ['type59: 9.5 L reaches the deep interior in 1 gap(s) [below its named carry of 9.78 L: lower its row to 9.5 L]',
    't80b: 6.62 L reaches the deep interior in 1 gap(s) [below its named carry of 6.63 L: lower its row to 6.62 L]']);
  assert.deepEqual(carried, []);
}
{
  // one step (0.01 L) above the row: grew
  const { failures, carried } = judgeWatertightCarries({ leaks: [leak('t80b', 6.64)], watertight: [], carries });
  assert.deepEqual(failures, ['t80b: 6.64 L reaches the deep interior in 1 gap(s) [grew past its named carry of 6.63 L]']);
  assert.deepEqual(carried, []);
}
{
  // a leak with no row (an own-property lookup: an id that names an Object.prototype member is still unlisted)
  const { failures } = judgeWatertightCarries({ leaks: [leak('ajax', 0.06), leak('constructor', 0.1)], watertight: [], carries });
  assert.deepEqual(failures, ['ajax: 0.06 L reaches the deep interior in 1 gap(s) [no named carry]',
    'constructor: 0.1 L reaches the deep interior in 1 gap(s) [no named carry]']);
}
{
  // a listed hull that holds water: stale row; a listed hull the pass did not measure is not judged
  const { failures } = judgeWatertightCarries({ leaks: [], watertight: ['leo2a4m', 'jpz_e100'], carries });
  assert.deepEqual(failures, ['leo2a4m: holds water now [stale named carry of 7.48 L: delete its row]']);
}
{
  // a NaN measurement never passes as carried
  const { failures } = judgeWatertightCarries({ leaks: [leak('t80b', Number.NaN)], watertight: [], carries });
  assert.equal(failures.length, 1);
}

// 4. a missing list or one without a tanks table throws (the gate never silently runs without its list)
{
  const dir = mkdtempSync(join(tmpdir(), 'watertight-carry-'));
  assert.throws(() => readWatertightCarries(join(dir, 'missing.json')), /ENOENT/);
  writeFileSync(join(dir, 'bad.json'), '{"rows": {}}');
  assert.throws(() => readWatertightCarries(join(dir, 'bad.json')), /no "tanks" table/);
}

console.log(`watertight-carry.selftest: ${Object.keys(shipped).length} named carries well formed against ${roster.length} fleet ids; `
  + 'malformed rows named; carried at exactly the row, failed above or below it, unlisted or stale');
