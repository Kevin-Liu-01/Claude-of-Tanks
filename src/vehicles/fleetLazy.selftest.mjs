import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROCEDURAL_PROFILES } from './profiledProcedurals.js';
import { MISC_PROFILES } from './profiles/misc.js';
import { FLEET_GROUP_IDS } from './fleetManifest.js';
const owners = new Map();
for (const [group, ids] of Object.entries(FLEET_GROUP_IDS)) {
  for (const id of ids) {
    const profile = PROCEDURAL_PROFILES[id];
    if (group !== 'franceCore') {
      assert.ok(profile, `${group}:${id} resolves to a canonical profile`);
    }
    assert.equal(owners.has(id), false, `${id} has exactly one dynamic owner`);
    owners.set(id, group);
  }
}
for (const [id, profile] of Object.entries(MISC_PROFILES)) {
  assert.equal(PROCEDURAL_PROFILES[id], profile, `deferred misc identity: ${id}`);
}
assert.equal(owners.size - FLEET_GROUP_IDS.franceCore.length, Object.keys(PROCEDURAL_PROFILES).length,
  'every profile has one demand-loaded owner');

const here = dirname(fileURLToPath(import.meta.url));
const facadeUrl = pathToFileURL(join(here, 'fleetFactory.js')).href;
const specsUrl = pathToFileURL(join(here, 'specs.js')).href;
execFileSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  const fleet = await import(${JSON.stringify(facadeUrl)});
  assert.equal(fleet.isTankBuilderReady('leclerc'), false);
  assert.equal(fleet.isTankBuilderReady('amx40'), false);
  assert.equal(fleet.isTankBuilderReady('challenger2'), true);
  assert.equal(fleet.isTankBuilderReady('m1a2'), false);
  assert.equal(fleet.isTankBuilderReady('t90m'), false);
  assert.equal(fleet.isTankBuilderReady('leo2a4'), false);
  assert.equal(fleet.isTankBuilderReady('merkava4'), false);
  await fleet.ensureTankBuilder('m1a2');
  assert.equal(fleet.isTankBuilderReady('m1a2'), true);
  assert.equal(fleet.isTankBuilderReady('m1a2_sepv3'), true);
  assert.equal(fleet.isTankBuilderReady('m60a3'), false);
  assert.equal(fleet.isTankBuilderReady('t90m'), false);
  assert.throws(() => fleet.createTank('t90m', null, { geometryReceipt: true }), /not loaded/);
  const abrams = fleet.createTank('m1a2', null, { proceduralOnly: true, geometryReceipt: true });
  abrams.dispose();
  await fleet.ensureTankBuilders(['leclerc', 'amx40']);
  assert.equal(fleet.isTankBuilderReady('leclerc'), true);
  assert.equal(fleet.isTankBuilderReady('amx40'), true);
  assert.equal(fleet.isTankBuilderReady('challenger2'), true);
  for (const id of ['leclerc', 'challenger2', 'amx40']) {
    const visual = fleet.createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
    visual.dispose();
  }
  await fleet.ensureTankBuilders(['m60a3', 't90m']);
  assert.equal(fleet.isTankBuilderReady('m60a3'), true);
  assert.equal(fleet.isTankBuilderReady('t90m'), true);
  await fleet.ensureFullFleet();
  const { VISIBLE_TANK_IDS } = await import(${JSON.stringify(specsUrl)});
  for (const id of VISIBLE_TANK_IDS) {
    const visual = fleet.createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
    visual.dispose();
  }
  console.log('demand-loaded fleet sweep:', VISIBLE_TANK_IDS.length);
`], { stdio: 'inherit', timeout: 240000 });

console.log(`fleetLazy.selftest: PASS (${owners.size} demand-owned profiles)`);
