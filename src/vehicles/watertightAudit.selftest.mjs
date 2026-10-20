// The fleet watertight gate's own controls (watertightAudit.test-support.mjs, run on every tank by fleetPassDefault):
// a hull with its shipped fills holds water, the same hull with its fill record withheld (a stale record) fails with
// the leak named, a fill-policy hull is measured on its policy boundary, and the shared build leaves the audit exactly
// as it arrived (fills attached for the measurement are removed again).
// 2026-10-16 (test-speed R7c): the named carries (docs/geometry-gate/watertight-carry.json) on the same real build: the
// withheld-record leak passes when it is carried at its measured litres, fails when its row is 0.01 L lower (it grew) or higher (lower the row)
// and fails when it is not listed (a new leak); a listed hull that holds water fails as a stale row. The table rules and
// the shipped list's form are proved in tools/watertight-carry.selftest.mjs.
import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { createWatertightAudit } from './watertightAudit.test-support.mjs';

const build = (id) => createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
const shape = (root) => { const rows = []; root.traverse((node) => rows.push(`${node.name}|${node.parent?.name}|${node.children.length}`)); return rows.join('\n'); };
const recordOf = async (id) => (await INTERIOR_FILL_GROUP_LOADERS[FLEET_GROUP_BY_ID[id]]()).INTERIOR_FILLS[id];
const row = (leakL) => ({ leakL, owner: 'VEHICLES', date: '2026-10-16', cause: 'watertightAudit.selftest negative control' });

// One E100 X build serves cases 1 to 4: case 1 proves every audit returns it exactly as it arrived.
const tank = build('jpz_e100');
try {
  // 1. shipped fills: the E100 X holds water, its 2.97 L of lane air reported apart, and the build is restored
  {
    const audit = await createWatertightAudit();
    const before = shape(tank.root);
    audit.check('jpz_e100', tank);
    assert.equal(shape(tank.root), before, 'the measured build is returned without the attached fills');
    let fills = 0; tank.root.traverse((node) => { if (node.userData?.interiorFill) fills++; });
    assert.equal(fills, 0, 'no fill mesh is left on the shared build');
    audit.finish();
  }
  // 2. a withheld (stale) record: the same hull leaks and the gate names it with the regeneration command; it is not on
  //    the shipped carry list, so it fails as a new leak
  let leakL;
  {
    const audit = await createWatertightAudit({ records: {} });
    audit.check('jpz_e100', tank);
    let message = '';
    assert.throws(() => audit.finish(), (error) => { message = error.message; return true; });
    assert.match(message, /gen-interior-fills\.mjs --ids=<id> --rounds=8 --min-fine=1[\s\S]*jpz_e100: [\d.]+ L reaches the deep interior[^\n]*\[no named carry\]/);
    leakL = Number(message.match(/jpz_e100: ([\d.]+) L reaches/)[1]);
    assert.ok(leakL > 0.05, `the withheld record leaks past the gate (${leakL} L)`);
  }
  // 3. named carries on the same leak: carried at its measured litres it passes, one step (0.01 L) lower it fails as
  //    grown, and with no row it fails as new (case 2 with an explicit empty list)
  {
    const audit = await createWatertightAudit({ records: {}, carries: { jpz_e100: row(leakL) } });
    audit.check('jpz_e100', tank);
    audit.finish();
  }
  {
    const lower = +(leakL - 0.01).toFixed(2);
    const audit = await createWatertightAudit({ records: {}, carries: { jpz_e100: row(lower) } });
    audit.check('jpz_e100', tank);
    assert.throws(() => audit.finish(), new RegExp(`1 hull\\(s\\) fail[\\s\\S]*jpz_e100: ${leakL} L reaches the deep interior`
      + `[^\\n]*\\[grew past its named carry of ${lower} L\\]`));
  }
  {
    const higher = +(leakL + 0.01).toFixed(2);
    const audit = await createWatertightAudit({ records: {}, carries: { jpz_e100: row(higher) } });
    audit.check('jpz_e100', tank);
    assert.throws(() => audit.finish(), new RegExp(`jpz_e100: ${leakL} L reaches the deep interior[^\\n]*\\[below its named carry of ${higher} L: lower its row to ${leakL} L\\]`));
  }
  {
    const audit = await createWatertightAudit({ records: {}, carries: {} });
    audit.check('jpz_e100', tank);
    assert.throws(() => audit.finish(), /jpz_e100: [\d.]+ L reaches the deep interior[^\n]*\[no named carry\]/);
  }
  // 4. a carried hull that holds water with its shipped fills: the row is stale and fails until it is deleted
  {
    const audit = await createWatertightAudit({ carries: { jpz_e100: row(leakL) } });
    audit.check('jpz_e100', tank);
    assert.throws(() => audit.finish(), new RegExp(`jpz_e100: holds water now \\[stale named carry of ${leakL} L: delete its row\\]`));
  }
} finally { tank.dispose(); }
// 5. a fill-policy hull is measured on the boundary its generation bounded (all-mesh air would read 61.81 L)
{
  const audit = await createWatertightAudit({ records: { amx56: await recordOf('amx56') } });
  const amx56 = build('amx56');
  try { audit.check('amx56', amx56); } finally { amx56.dispose(); }
  audit.finish();
}
console.log('watertightAudit.selftest: shipped fills hold water and leave the shared build as it arrived; a withheld record fails by name; '
  + 'a carried leak passes at its listed litres and fails 0.01 L above it, unlisted, or once the hull holds water; the AMX 56 is measured on its fill-policy boundary');
