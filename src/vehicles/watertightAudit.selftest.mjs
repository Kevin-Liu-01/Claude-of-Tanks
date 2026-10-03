// The fleet watertight gate's own controls (watertightAudit.test-support.mjs, run on every tank by fleetPassDefault):
// a hull with its shipped fills holds water, the same hull with its fill record withheld (a stale record) fails with
// the leak named, a fill-policy hull is measured on its policy boundary, and the shared build leaves the audit exactly
// as it arrived (fills attached for the measurement are removed again).
import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';
import { createWatertightAudit } from './watertightAudit.test-support.mjs';

const build = (id) => createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
const shape = (root) => { const rows = []; root.traverse((node) => rows.push(`${node.name}|${node.parent?.name}|${node.children.length}`)); return rows.join('\n'); };
const recordOf = async (id) => (await INTERIOR_FILL_GROUP_LOADERS[FLEET_GROUP_BY_ID[id]]()).INTERIOR_FILLS[id];

// 1. shipped fills: the E100 X holds water, its 2.97 L of lane air reported apart, and the build is restored
{
  const audit = await createWatertightAudit();
  const tank = build('jpz_e100_x');
  try {
    const before = shape(tank.root);
    audit.check('jpz_e100_x', tank);
    assert.equal(shape(tank.root), before, 'the measured build is returned without the attached fills');
    let fills = 0; tank.root.traverse((node) => { if (node.userData?.interiorFill) fills++; });
    assert.equal(fills, 0, 'no fill mesh is left on the shared build');
  } finally { tank.dispose(); }
  audit.finish();
}
// 2. a withheld (stale) record: the same hull leaks and the gate names it with the regeneration command
{
  const audit = await createWatertightAudit({ records: {} });
  const tank = build('jpz_e100_x');
  try { audit.check('jpz_e100_x', tank); } finally { tank.dispose(); }
  assert.throws(() => audit.finish(), /gen-interior-fills\.mjs --ids=<id> --rounds=8 --min-fine=1[\s\S]*jpz_e100_x: [\d.]+ L reaches the deep interior/);
}
// 3. a fill-policy hull is measured on the boundary its generation bounded (all-mesh air would read 61.81 L)
{
  const audit = await createWatertightAudit({ records: { leclerc_classic_x: await recordOf('leclerc_classic_x') } });
  const tank = build('leclerc_classic_x');
  try { audit.check('leclerc_classic_x', tank); } finally { tank.dispose(); }
  audit.finish();
}
console.log('watertightAudit.selftest: shipped fills hold water and leave the shared build as it arrived; a withheld record fails by name; the AMX 56 is measured on its fill-policy boundary');
